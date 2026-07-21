import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHook, makeDataDir, decisionOf, repoRoot } from '../helpers/run-hook.js';
import { projectKey, projectOverridePath, writeJsonAtomic } from '../../scripts/lib/state.js';

const SID = 'safety-corpus-session';
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures', 'safety');

function loadCorpus(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8')).entries;
}

// All corpus entries run inside a real throwaway git repo (branch main, one commit)
// so git-aware rules see a realistic novice project.
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-safety-repo-'));
  const git = (args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  git(['add', 'README.md']);
  git(['commit', '-q', '-m', 'init']);
  return dir;
}

function gatePayload(entry, cwd) {
  const toolInput = structuredClone(entry.tool_input);
  if (typeof toolInput.command === 'string') {
    toolInput.command = toolInput.command.replaceAll('{{CWD}}', cwd);
  }
  return {
    session_id: SID,
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: entry.tool_name,
    tool_input: toolInput,
    permission_mode: 'default',
  };
}

async function judge(entry, cwd, dataDir) {
  const r = await runHook('pre-tool-use.js', gatePayload(entry, cwd), { dataDir, cwd });
  const d = decisionOf(r);
  return d?.decision ?? 'allow';
}

test('dangerous corpus (supported grammar): 100% detected with expected decision', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  for (const entry of loadCorpus('dangerous-supported.json')) {
    const decision = await judge(entry, cwd, dataDir);
    assert.equal(
      decision,
      entry.expect,
      `${entry.tool_input.command ?? entry.tool_name} → expected ${entry.expect}, got ${decision} (${entry.note ?? ''})`,
    );
  }
});

test('benign corpus: supported FP ≤10%, unsupported never denied (delegated to native)', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();

  const supported = loadCorpus('benign-supported.json');
  let falsePositives = 0;
  const fpList = [];
  for (const entry of supported) {
    const decision = await judge(entry, cwd, dataDir);
    if (decision !== 'allow') {
      falsePositives++;
      fpList.push(`${entry.tool_input.command} → ${decision}`);
    }
  }
  const fpRate = falsePositives / supported.length;
  assert.ok(fpRate <= 0.10, `benign FP rate ${(fpRate * 100).toFixed(1)}% > 10%: ${fpList.join('; ')}`);

  // Unsupported grammar gets no opinion — never denied, delegated to Claude Code's native prompt.
  const unsupported = loadCorpus('benign-unsupported.json');
  for (const entry of unsupported) {
    const decision = await judge(entry, cwd, dataDir);
    assert.equal(decision, 'allow', `${entry.tool_input.command} → unsupported must be delegated (allow), got ${decision}`);
  }
});

// ---- git commit secret scan against real repos ----

const GHP = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9m';

function commitScan(cwd, dataDir, command) {
  return runHook(
    'pre-tool-use.js',
    { session_id: SID, cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } },
    { dataDir, cwd },
  );
}

test('staged secret blocks plain commit; reason names pattern not value', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  fs.writeFileSync(path.join(cwd, '.env'), `GITHUB_TOKEN=${GHP}\n`);
  execFileSync('git', ['-C', cwd, 'add', '.env']);

  const r = await commitScan(cwd, dataDir, 'git commit -m "add env"');
  const d = decisionOf(r);
  assert.equal(d.decision, 'deny');
  assert.match(d.reason, /github-token/);
  assert.ok(!d.reason.includes(GHP), 'reason must never echo the secret');
});

test('commit -a scans tracked worktree modifications', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  fs.appendFileSync(path.join(cwd, 'README.md'), `\ntoken: ${GHP}\n`);
  const r = await commitScan(cwd, dataDir, 'git commit -am "update docs"');
  assert.equal(decisionOf(r).decision, 'deny');
});

test('pathspec commit scans only the named file', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  fs.writeFileSync(path.join(cwd, 'clean.txt'), 'nothing secret here\n');
  fs.writeFileSync(path.join(cwd, 'dirty.txt'), `key=${GHP}\n`);
  execFileSync('git', ['-C', cwd, 'add', 'clean.txt', 'dirty.txt']);

  const clean = await commitScan(cwd, dataDir, 'git commit -m "ok" clean.txt');
  assert.equal(decisionOf(clean), null, 'clean pathspec commit passes');

  const dirty = await commitScan(cwd, dataDir, 'git commit -m "bad" dirty.txt');
  assert.equal(decisionOf(dirty).decision, 'deny');
});

test('benign staged content commits freely; unborn HEAD is delegated (no opinion)', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  fs.writeFileSync(path.join(cwd, 'app.js'), 'export const x = 1;\n');
  execFileSync('git', ['-C', cwd, 'add', 'app.js']);
  const ok = await commitScan(cwd, dataDir, 'git commit -m "feat: x"');
  assert.equal(decisionOf(ok), null);

  // Unborn HEAD can't be scanned → no opinion (allow), not a block. Deny only on positive detection.
  const unborn = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-unborn-'));
  execFileSync('git', ['-C', unborn, 'init', '-q', '-b', 'main']);
  const r = await commitScan(unborn, dataDir, 'git commit -m "first"');
  assert.equal(decisionOf(r), null, 'unborn HEAD is delegated, never blocked');
});

test('fixture-path files are excluded from the commit secret scan; non-fixture secrets still deny', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  // Intentional synthetic secret under tests/fixtures/ — the plugin must be able to commit its own corpus.
  fs.mkdirSync(path.join(cwd, 'tests', 'fixtures', 'safety'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'tests', 'fixtures', 'safety', 'corpus.json'), `{"cmd":"echo ${GHP}"}\n`);
  execFileSync('git', ['-C', cwd, 'add', 'tests/fixtures/safety/corpus.json']);
  const skipped = await commitScan(cwd, dataDir, 'git commit -m "add fixture"');
  assert.equal(decisionOf(skipped), null, 'fixture-path file is not scanned');

  // Same token outside a fixture path still blocks (regression guard).
  fs.writeFileSync(path.join(cwd, 'leak.txt'), `token=${GHP}\n`);
  execFileSync('git', ['-C', cwd, 'add', 'leak.txt']);
  const denied = await commitScan(cwd, dataDir, 'git commit -m "leak"');
  assert.equal(decisionOf(denied).decision, 'deny', 'non-fixture secret still blocked');
});

test('oversized command is denied with split guidance; unscannable staged file is delegated', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();

  // A file too large to scan is delegated (no opinion) — the gate blocks only on a positive secret hit.
  fs.writeFileSync(path.join(cwd, 'big.txt'), 'x'.repeat(1024 * 1024 + 10));
  execFileSync('git', ['-C', cwd, 'add', 'big.txt']);
  const big = await commitScan(cwd, dataDir, 'git commit -m "big"');
  assert.equal(decisionOf(big), null, 'oversize staged file is delegated, not blocked');

  // An oversized command line itself still can't be safely inspected → deny.
  const hugeCommand = `echo ${'a'.repeat(65 * 1024)}`;
  const r = await commitScan(cwd, dataDir, hugeCommand);
  assert.equal(decisionOf(r).decision, 'deny');
});

test('invalid JSON stdin fails closed with exit 2', async () => {
  const dataDir = makeDataDir();
  const r = await runHook('pre-tool-use.js', '{not json', { dataDir });
  assert.equal(r.code, 2);
});

test('project protected-branch override is add-only and enforced', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  const env = { CLAUDE_PLUGIN_DATA: dataDir };
  const key = projectKey(cwd);
  writeJsonAtomic(projectOverridePath(key, env), {
    level: 1,
    enabled: true,
    protected_branches_extra: ['develop'],
  });

  const r = await commitScan(cwd, dataDir, 'git push --force origin develop');
  assert.equal(decisionOf(r).decision, 'deny', 'extra protected branch enforced');

  const builtin = await commitScan(cwd, dataDir, 'git push --force origin main');
  assert.equal(decisionOf(builtin).decision, 'deny', 'builtin protection cannot be removed');
});

test('simple wrappers are normalized before dangerous command analysis', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  const cases = [
    'FOO=bar rm -rf /',
    'env rm -rf /',
    'command rm -rf /',
    'sudo rm -rf /',
    'command git push --force origin main',
  ];
  for (const command of cases) {
    const r = await commitScan(cwd, dataDir, command);
    assert.equal(decisionOf(r).decision, 'deny', `${command} must be denied after wrapper normalization`);
  }
});

test('non-executing command wrapper probes are delegated', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  for (const command of ['command -v rm', 'command -V git']) {
    const r = await commitScan(cwd, dataDir, command);
    assert.equal(decisionOf(r), null, `${command} must be delegated`);
  }
});

test('unquoted generic assignment secrets are blocked in commit scan', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  const secret = 'qZ8xV3nM7kL2wR9tY6uP1sD4fG5hJ0aB';
  fs.writeFileSync(path.join(cwd, '.env'), `API_KEY = ${secret}\n`);
  execFileSync('git', ['-C', cwd, 'add', '.env']);

  const r = await commitScan(cwd, dataDir, 'git commit -m "add env"');
  const d = decisionOf(r);
  assert.equal(d.decision, 'deny');
  assert.match(d.reason, /generic-assignment/);
  assert.ok(!d.reason.includes(secret), 'reason must never echo the secret');
});

test('novice off does not disable the gate', async () => {
  const dataDir = makeDataDir();
  const cwd = makeRepo();
  const env = { CLAUDE_PLUGIN_DATA: dataDir };
  writeJsonAtomic(projectOverridePath(projectKey(cwd), env), { level: 1, enabled: false });

  const r = await commitScan(cwd, dataDir, 'rm -rf /');
  assert.equal(decisionOf(r).decision, 'deny');
});

test('non-matching tools pass through without opinion', async () => {
  const dataDir = makeDataDir();
  const r = await runHook(
    'pre-tool-use.js',
    { session_id: SID, cwd: repoRoot, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } },
    { dataDir },
  );
  assert.equal(r.output, null);
  assert.equal(r.code, 0);
});
