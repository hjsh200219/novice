import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateManifest, loadTier1Manifest, buildAdHocManifest } from '../../scripts/lib/manifest.js';
import { createEngine, runBootstrap } from '../../scripts/bootstrap-engine.js';
import { makeDataDir, repoRoot } from '../helpers/run-hook.js';

const SERVICES = ['vercel', 'github', 'supabase'];
const MANIFEST_FILES = ['vercel.json', 'github-cli.json', 'supabase.json'];

function loadFixtureManifest(file) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'bootstrap-manifests', file), 'utf8'));
}

// Scripted mock exec: maps argv[0]+subcommand to canned results; records every call.
function mockExec(scenario = {}) {
  const calls = [];
  const exec = async (argv) => {
    calls.push([...argv]);
    const key = argv.join(' ');
    for (const [pattern, result] of Object.entries(scenario)) {
      if (key.includes(pattern)) return { code: result.code ?? 0, stdout: result.stdout ?? '', stderr: '' };
    }
    return { code: 0, stdout: '1.2.3', stderr: '' };
  };
  return { exec, calls };
}

// ---- manifest validation ----

for (const file of MANIFEST_FILES) {
  test(`shipped manifest ${file} validates`, () => {
    const { valid, errors } = validateManifest(loadFixtureManifest(file));
    assert.deepEqual(errors, []);
    assert.equal(valid, true);
  });
}

test('validateManifest rejects missing fields, shell metachars, http docs_url, piped installers', () => {
  const base = loadFixtureManifest('vercel.json');

  const noLogin = { ...base };
  delete noLogin.login;
  assert.equal(validateManifest(noLogin).valid, false);

  const meta = structuredClone(base);
  meta.installers[0].argv = ['npm', 'install', '-g', 'vercel', '&&', 'echo', 'done'];
  assert.ok(validateManifest(meta).errors.some((e) => e.includes('metacharacter')));

  const http = structuredClone(base);
  http.docs_url = 'http://vercel.com/docs/cli';
  assert.ok(validateManifest(http).errors.some((e) => e.includes('https')));

  const curl = structuredClone(base);
  curl.installers[0].argv = ['curl', '-fsSL', 'https://x.sh'];
  assert.ok(validateManifest(curl).errors.some((e) => e.includes('forbidden')));

  const noninteractive = structuredClone(base);
  noninteractive.login.interactive = false;
  assert.equal(validateManifest(noninteractive).valid, false);
});

// ---- resolve ----

test('resolve: tier 1 services map to shipped manifests', () => {
  const engine = createEngine({ exec: mockExec().exec });
  for (const svc of SERVICES) {
    const r = engine.resolve(svc);
    assert.equal(r.tier, 1, svc);
    assert.equal(validateManifest(r.manifest).valid, true);
  }
});

test('resolve: unlisted CLI without provenance → guided manual', () => {
  const engine = createEngine({ exec: mockExec().exec });
  const r = engine.resolve('railway');
  assert.equal(r.mode, 'guided_manual');
});

test('resolve: tier 2 with confirmed official provenance proceeds, unconfirmed does not', () => {
  const engine = createEngine({ exec: mockExec().exec });
  const adHoc = {
    manifest: {
      ...loadFixtureManifest('vercel.json'),
      service_id: 'railway',
      binary: 'railway',
    },
    provenance: { docs_url: 'https://docs.railway.app/cli', confirmed_by_user: true },
  };
  const ok = engine.resolve('railway', adHoc);
  assert.equal(ok.tier, 2);
  assert.equal(ok.requiresUserApproval, true);
  assert.equal(ok.manifest.tier, 2);

  const unconfirmed = engine.resolve('railway', {
    ...adHoc,
    provenance: { ...adHoc.provenance, confirmed_by_user: false },
  });
  assert.equal(unconfirmed.mode, 'guided_manual');

  const noDocs = engine.resolve('railway', { manifest: adHoc.manifest, provenance: { confirmed_by_user: true } });
  assert.equal(noDocs.mode, 'guided_manual');
});

// ---- preflight (read-only) ----

test('preflight is read-only and reports install/auth state', async () => {
  const manifest = loadFixtureManifest('vercel.json');
  const { exec, calls } = mockExec({ 'vercel --version': { code: 1 } });
  const engine = createEngine({ exec });
  const pf = await engine.preflight(manifest);
  assert.equal(pf.installed, false);
  assert.equal(pf.authenticated, false);
  // Only the detect probe ran; nothing mutating.
  assert.deepEqual(calls, [['vercel', '--version']]);
});

test('preflight on installed+authenticated machine skips everything in plan', async () => {
  const manifest = loadFixtureManifest('github-cli.json');
  const { exec } = mockExec({ 'gh --version': { code: 0, stdout: 'gh version 2.45.0' } });
  const engine = createEngine({ exec });
  const pf = await engine.preflight(manifest);
  assert.equal(pf.installed, true);
  assert.equal(pf.version_ok, true);
  assert.equal(pf.authenticated, true);
  const plan = engine.plan(manifest, pf);
  assert.equal(plan.steps.length, 0, 'idempotent re-run: no steps');
});

// ---- plan ----

test('plan on fresh machine: install + login, both approval_required, with disclosures', async () => {
  const manifest = loadFixtureManifest('vercel.json');
  const { exec } = mockExec({ 'vercel --version': { code: 1 } });
  const engine = createEngine({ exec, platform: 'darwin' });
  const plan = engine.plan(manifest, await engine.preflight(manifest));
  assert.equal(plan.steps.length, 2);
  const [install, login] = plan.steps;
  assert.equal(install.kind, 'install');
  assert.equal(install.approval_required, true);
  assert.ok(install.disclosure.includes('package coordinate'));
  assert.ok(install.disclosure.includes(manifest.docs_url));
  assert.equal(login.kind, 'login');
  assert.equal(login.approval_required, true);
  assert.ok(login.disclosure.includes('logout'));
});

test('noninteractive: gh login denied, vercel login guided manual', async () => {
  for (const [file, expected] of [['github-cli.json', 'denied_login'], ['vercel.json', 'guided_manual']]) {
    const manifest = loadFixtureManifest(file);
    const { exec } = mockExec({
      [`${manifest.binary} --version`]: { code: 0, stdout: 'gh version 2.45.0' },
      [manifest.auth_status.argv.join(' ')]: { code: 1 },
    });
    const engine = createEngine({ exec, interactive: false });
    const plan = engine.plan(manifest, await engine.preflight(manifest));
    const loginStep = plan.steps.find((s) => s.kind !== 'install');
    assert.equal(loginStep.kind, expected, file);
  }
});

// Intent lock (reviewer finding 2, user-confirmed): vercel's documented normal behavior IS
// file-based token storage, so plaintext detection does NOT abort its login — the storage
// location and logout path are disclosed in the approval-gated login step instead.
// gh/supabase support secure storage, so their plaintext fallback DOES abort (test below).
test('vercel: plaintext storage is disclosed, not aborted — login stays approval-gated', async () => {
  const manifest = loadFixtureManifest('vercel.json');
  assert.equal(manifest.credential_store.abort_auto_login_on_plaintext, false);
  const { exec } = mockExec({ 'vercel whoami': { code: 1 } });
  const engine = createEngine({ exec });
  const pf = await engine.preflight(manifest, { plaintextDetected: true });
  assert.equal(pf.plaintext_risk, true);
  assert.equal(pf.abort_login, false, 'vercel must not abort on plaintext');
  const login = engine.plan(manifest, pf).steps.find((s) => s.kind === 'login');
  assert.ok(login, 'login step still planned');
  assert.equal(login.approval_required, true);
  assert.ok(login.disclosure.includes('인증 저장'), 'storage location disclosed before approval');
  assert.ok(login.disclosure.includes('logout'), 'recovery path disclosed');
});

test('plaintext credential fallback aborts auto-login with guidance', async () => {
  const manifest = loadFixtureManifest('supabase.json'); // abort_auto_login_on_plaintext: true
  const { exec } = mockExec({ 'supabase projects list': { code: 1 } });
  const engine = createEngine({ exec });
  const pf = await engine.preflight(manifest, { plaintextDetected: true });
  assert.equal(pf.abort_login, true);
  const plan = engine.plan(manifest, pf);
  const login = plan.steps.find((s) => s.kind === 'aborted_login');
  assert.ok(login, 'login must be aborted');
  assert.ok(login.guidance.includes('logout') || login.guidance.includes('제거'));
});

// ---- apply / approvals / recover ----

test('apply refuses unapproved steps; approvals gate install and login separately', async () => {
  const manifest = loadFixtureManifest('vercel.json');
  const scenario = { 'vercel --version': { code: 1 }, 'vercel whoami': { code: 1 } };

  // No approvals → nothing executes.
  {
    const { exec, calls } = mockExec(scenario);
    const engine = createEngine({ exec, platform: 'darwin' });
    const plan = engine.plan(manifest, await engine.preflight(manifest));
    const before = calls.length;
    const results = await engine.apply(manifest, plan, {});
    assert.ok(results.every((r) => r.skipped === true && r.reason === 'approval_missing'));
    assert.equal(calls.length, before, 'no mutating argv executed');
  }

  // Install only.
  {
    const { exec, calls } = mockExec(scenario);
    const engine = createEngine({ exec, platform: 'darwin' });
    const plan = engine.plan(manifest, await engine.preflight(manifest));
    const results = await engine.apply(manifest, plan, { install: true });
    assert.equal(results.find((r) => r.step === 'install').ok, true);
    assert.equal(results.find((r) => r.step === 'login').skipped, true);
    assert.ok(!calls.some((argv) => argv.join(' ').includes('vercel login')), 'login argv must not run');
  }

  // Both.
  {
    const { exec, calls } = mockExec(scenario);
    const engine = createEngine({ exec, platform: 'darwin' });
    const plan = engine.plan(manifest, await engine.preflight(manifest));
    const results = await engine.apply(manifest, plan, { install: true, login: true });
    assert.ok(results.every((r) => r.ok === true));
    const joined = calls.map((c) => c.join(' '));
    assert.ok(joined.some((c) => c.includes('install')), 'install ran');
    assert.ok(joined.some((c) => c.includes('vercel login')), 'login ran');
  }
});

test('partial failure stops the chain; recover reports without auto cleanup', async () => {
  const dataDir = makeDataDir();
  const env = { CLAUDE_PLUGIN_DATA: dataDir };
  const manifest = loadFixtureManifest('vercel.json');
  const { exec, calls } = mockExec({
    'vercel --version': { code: 1 },
    'npm install --global vercel': { code: 1 }, // install fails
  });
  const engine = createEngine({ exec, platform: 'darwin', env });
  const plan = engine.plan(manifest, await engine.preflight(manifest));
  const results = await engine.apply(manifest, plan, { install: true, login: true }, 'boot-sess');
  assert.equal(results.length, 1, 'chain stops at first failure');
  assert.equal(results[0].ok, false);

  const rec = engine.recover(manifest, 'boot-sess');
  assert.equal(rec.auto_cleanup, false);
  assert.deepEqual(rec.logout_argv, manifest.logout.argv);
  assert.ok(rec.completed_steps.some((s) => s.step === 'install' && s.exit_status === 1));
  const joined = calls.map((c) => c.join(' '));
  assert.ok(!joined.some((c) => c.includes('logout') || c.includes('uninstall')), 'no automatic logout/uninstall');
});

test('audit state stores only step metadata — no argv, output, or token-like content', async () => {
  const dataDir = makeDataDir();
  const env = { CLAUDE_PLUGIN_DATA: dataDir };
  const manifest = loadFixtureManifest('vercel.json');
  const { exec } = mockExec({
    'vercel --version': { code: 1 },
    'vercel whoami': { code: 1 },
    'vercel login': { code: 0, stdout: 'token sk-secret-value-abc' },
  });
  const engine = createEngine({ exec, platform: 'darwin', env });
  const plan = engine.plan(manifest, await engine.preflight(manifest));
  await engine.apply(manifest, plan, { install: true, login: true }, 'audit-sess');

  const auditFile = path.join(dataDir, 'sessions', 'audit-sess', 'bootstrap', 'vercel.json');
  const raw = fs.readFileSync(auditFile, 'utf8');
  const audit = JSON.parse(raw);
  assert.equal(audit.service_id, 'vercel');
  assert.equal(audit.manifest_revision, 1);
  assert.ok(audit.steps.every((s) => ['step', 'exit_status', 'at'].every((k) => k in s)));
  assert.ok(!raw.includes('argv'), 'no argv key');
  assert.ok(!raw.includes('npm install'), 'no argv text');
  assert.ok(!raw.includes('sk-secret-value'), 'no stdout/credential content');
});

// ---- one engine, three manifests ----

for (const file of MANIFEST_FILES) {
  test(`same engine code path drives ${file} end to end`, async () => {
    const manifest = loadFixtureManifest(file);
    const detectKey = manifest.detect.argv.join(' ');
    const authKey = manifest.auth_status.argv.join(' ');
    const versionOut = manifest.binary === 'gh' ? 'gh version 2.45.0' : '2.5.0';
    const { exec } = mockExec({
      [detectKey]: { code: 1 },
      [authKey]: { code: 1 },
      [manifest.version_check.argv.join(' ')]: { code: 1 },
    });
    const engine = createEngine({ exec, platform: 'darwin' });
    const pf = await engine.preflight(manifest);
    assert.equal(pf.installed, false);
    const plan = engine.plan(manifest, pf);
    assert.ok(plan.steps.length >= 1);
    assert.equal(plan.steps[0].kind, 'install');

    // After "installation", probes succeed.
    const { exec: exec2 } = mockExec({
      [detectKey]: { code: 0, stdout: versionOut },
      [manifest.version_check.argv.join(' ')]: { code: 0, stdout: versionOut },
      [authKey]: { code: 0 },
    });
    const engine2 = createEngine({ exec: exec2, platform: 'darwin' });
    const verified = await engine2.verify(manifest);
    assert.equal(verified.installed_ok, true);
    assert.equal(verified.auth_ok, true);
  });
}

test('runBootstrap orchestrates the full machine and reports already-complete runs', async () => {
  const { exec } = mockExec({ 'gh --version': { code: 0, stdout: 'gh version 2.45.0' } });
  const engine = createEngine({ exec });
  const report = await runBootstrap(engine, 'github', {});
  assert.equal(report.already_complete, true);
  assert.equal(report.verified.installed_ok, true);

  const guided = await runBootstrap(engine, 'unknown-cli', {});
  assert.equal(guided.mode, 'guided_manual');
});
