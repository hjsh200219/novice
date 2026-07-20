import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  dataDir, projectKey, projectOverridePath, sessionDir, sessionStatePath,
  readJsonSafe, writeJsonAtomic, writeJsonExclusive,
  getProjectConfig, setProjectMode, muteProjectTerm, unmuteProjectTerm, loadSession, saveSession, deleteSession,
  cleanupExpiredSessions, defaultSessionState, BUILTIN_DEFAULTS,
} from '../../scripts/lib/state.js';

const execFileP = promisify(execFile);

function tmpEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-state-'));
  return { CLAUDE_PLUGIN_DATA: dir };
}

test('dataDir honors CLAUDE_PLUGIN_DATA and never points at plugin root', () => {
  const env = { CLAUDE_PLUGIN_DATA: '/tmp/x', CLAUDE_PLUGIN_ROOT: '/plugins/novice' };
  assert.equal(dataDir(env), '/tmp/x');
  const fallback = dataDir({ CLAUDE_PLUGIN_ROOT: '/plugins/novice' });
  assert.ok(!fallback.startsWith('/plugins/novice'));
});

test('projectKey uses git toplevel inside a repo', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-repo-'));
  execFileSync('git', ['-C', repo, 'init', '-q']);
  const sub = path.join(repo, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(projectKey(sub), projectKey(repo), 'subdir and toplevel must map to same key');
  assert.match(projectKey(repo), /^[0-9a-f]{64}$/);
});

test('projectKey falls back to symlink-resolved cwd outside git', () => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-real-'));
  const link = path.join(os.tmpdir(), `novice-link-${process.pid}-${Math.random().toString(16).slice(2)}`);
  fs.symlinkSync(real, link);
  try {
    assert.equal(projectKey(link), projectKey(real), 'symlink must resolve to canonical path');
  } finally {
    fs.unlinkSync(link);
  }
});

test('writeJsonAtomic writes 0600 and readJsonSafe round-trips', () => {
  const env = tmpEnv();
  const file = path.join(dataDir(env), 'projects', 'x.json');
  writeJsonAtomic(file, { level: 2 });
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.deepEqual(readJsonSafe(file), { level: 2 });
});

test('readJsonSafe rejects symlinks, oversized files, and corrupt JSON', () => {
  const env = tmpEnv();
  const base = dataDir(env);
  fs.mkdirSync(base, { recursive: true });

  const target = path.join(base, 'target.json');
  fs.writeFileSync(target, '{"a":1}');
  const link = path.join(base, 'link.json');
  fs.symlinkSync(target, link);
  assert.equal(readJsonSafe(link, 'FALLBACK'), 'FALLBACK');

  const big = path.join(base, 'big.json');
  fs.writeFileSync(big, `{"pad":"${'x'.repeat(300 * 1024)}"}`);
  assert.equal(readJsonSafe(big, 'FALLBACK'), 'FALLBACK');

  const corrupt = path.join(base, 'corrupt.json');
  fs.writeFileSync(corrupt, '{not json');
  assert.equal(readJsonSafe(corrupt, 'FALLBACK'), 'FALLBACK');
});

test('writeJsonAtomic refuses symlinked targets and oversized payloads', () => {
  const env = tmpEnv();
  const base = dataDir(env);
  fs.mkdirSync(base, { recursive: true });
  const target = path.join(base, 'real.json');
  fs.writeFileSync(target, '{}');
  const link = path.join(base, 'evil.json');
  fs.symlinkSync(target, link);
  assert.throws(() => writeJsonAtomic(link, { a: 1 }), /symlink/);
  assert.throws(
    () => writeJsonAtomic(path.join(base, 'huge.json'), { pad: 'x'.repeat(300 * 1024) }),
    /size cap/,
  );
});

test('session id sanitization blocks path traversal', () => {
  const env = tmpEnv();
  assert.throws(() => sessionDir('../escape', env), /unsafe/);
  assert.throws(() => sessionStatePath('a/b', env), /unsafe/);
});

test('config precedence: override > userConfig env > builtin', () => {
  const env = tmpEnv();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-proj-'));

  const base = getProjectConfig(cwd, env);
  assert.equal(base.level, BUILTIN_DEFAULTS.level);
  assert.equal(base.enabled, true);

  const envWithUser = { ...env, CLAUDE_PLUGIN_CONFIG: JSON.stringify({ default_level: 3, novice_enabled: true }) };
  assert.equal(getProjectConfig(cwd, envWithUser).level, 3);

  setProjectMode(cwd, 2, env);
  assert.equal(getProjectConfig(cwd, envWithUser).level, 2, 'project override beats userConfig');

  setProjectMode(cwd, 'off', env);
  const off = getProjectConfig(cwd, envWithUser);
  assert.equal(off.enabled, false);
  assert.equal(off.level, 2, 'off keeps last level for restore');
});

test('mute/unmute persist in the project override and survive mode changes', () => {
  const env = tmpEnv();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mute-'));

  muteProjectTerm(cwd, 'commit', env);
  muteProjectTerm(cwd, 'branch', env);
  assert.deepEqual(getProjectConfig(cwd, env).muted_terms.sort(), ['branch', 'commit']);

  // duplicate mute is idempotent
  muteProjectTerm(cwd, 'commit', env);
  assert.deepEqual(getProjectConfig(cwd, env).muted_terms.sort(), ['branch', 'commit']);

  // a mode change must not wipe the mute list
  setProjectMode(cwd, 2, env);
  assert.deepEqual(getProjectConfig(cwd, env).muted_terms.sort(), ['branch', 'commit']);
  assert.equal(getProjectConfig(cwd, env).level, 2);

  unmuteProjectTerm(cwd, 'commit', env);
  assert.deepEqual(getProjectConfig(cwd, env).muted_terms, ['branch']);

  // muting does not disturb level/enabled
  const cfg = getProjectConfig(cwd, env);
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.level, 2);
});

test('setProjectMode validates input', () => {
  const env = tmpEnv();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-proj-'));
  assert.throws(() => setProjectMode(cwd, 5, env), /invalid mode/);
  assert.throws(() => setProjectMode(cwd, 'loud', env), /invalid mode/);
});

test('session state round-trip, defaults on corrupt file, delete', () => {
  const env = tmpEnv();
  const sid = 'sess-1';
  const fresh = loadSession(sid, env);
  assert.deepEqual(fresh, defaultSessionState());

  fresh.term_counts.commit = 2;
  saveSession(sid, fresh, env);
  assert.equal(loadSession(sid, env).term_counts.commit, 2);

  fs.writeFileSync(sessionStatePath(sid, env), 'garbage');
  assert.deepEqual(loadSession(sid, env).term_counts, {});

  saveSession(sid, fresh, env);
  deleteSession(sid, env);
  assert.equal(fs.existsSync(sessionDir(sid, env)), false);
});

test('cleanupExpiredSessions removes only stale sessions', () => {
  const env = tmpEnv();
  saveSession('old-sess', defaultSessionState(), env);
  saveSession('new-sess', defaultSessionState(), env);
  const oldDir = sessionDir('old-sess', env);
  const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldDir, past, past);
  cleanupExpiredSessions(env);
  assert.equal(fs.existsSync(oldDir), false);
  assert.equal(fs.existsSync(sessionDir('new-sess', env)), true);
});

test('concurrent atomic writes leave valid JSON', async () => {
  const env = tmpEnv();
  const file = path.join(dataDir(env), 'projects', 'race.json');
  const script = `
    import { writeJsonAtomic } from ${JSON.stringify(path.resolve('scripts/lib/state.js'))};
    for (let i = 0; i < 50; i++) writeJsonAtomic(${JSON.stringify(file)}, { i, pid: process.pid });
  `;
  await Promise.all([
    execFileP('node', ['--input-type=module', '-e', script]),
    execFileP('node', ['--input-type=module', '-e', script]),
    execFileP('node', ['--input-type=module', '-e', script]),
  ]);
  const result = readJsonSafe(file);
  assert.ok(result && typeof result.i === 'number', 'file must contain intact JSON after racing writers');
});

test('writeJsonExclusive refuses to overwrite an existing event', () => {
  const env = tmpEnv();
  const file = path.join(dataDir(env), 'sessions', 's', 'events', 'tool-1.json');
  writeJsonExclusive(file, { ok: true });
  assert.throws(() => writeJsonExclusive(file, { ok: false }), /EEXIST/);
});
