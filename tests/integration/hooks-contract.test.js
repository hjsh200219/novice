// Drives every hook script end-to-end (stdin JSON → stdout JSON) against the
// documented Claude Code 2.1.215 contract fixtures in tests/fixtures/contract/.
// These fixtures are documented-shape stand-ins pending live runtime capture
// (see tests/fixtures/contract/README.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runHook, makeDataDir, additionalContextOf, decisionOf, repoRoot, readSessionState,
} from '../helpers/run-hook.js';

const contractDir = path.join(repoRoot, 'tests', 'fixtures', 'contract');

function fixture(name, overrides = {}) {
  const payload = JSON.parse(fs.readFileSync(path.join(contractDir, `${name}.json`), 'utf8'));
  return { ...payload, ...overrides };
}

function freshCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novice-contract-'));
}

test('every contract fixture is valid JSON with the common fields', () => {
  const files = fs.readdirSync(contractDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 15);
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(contractDir, f), 'utf8'));
    for (const field of ['session_id', 'cwd', 'hook_event_name', 'provenance']) {
      assert.ok(field in p, `${f} missing ${field}`);
    }
  }
});

test('SessionStart contract: all four sources produce capsule + glossary for active project', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();
  for (const source of ['startup', 'resume', 'clear', 'compact']) {
    const r = await runHook('session-start.js', fixture(`session-start-${source}`, { cwd }), { dataDir });
    assert.equal(r.code, 0);
    const ctx = additionalContextOf(r);
    assert.equal(r.output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.ok(ctx.includes('[NOVICE_STATE]'), source);
  }
});

test('UserPromptSubmit contract: plain prompt gets capsule, slash prompt gets nothing', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();
  const plain = await runHook('user-prompt-submit.js', fixture('user-prompt-submit', { cwd }), { dataDir });
  assert.equal(plain.output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(additionalContextOf(plain).includes('[NOVICE_STATE]'));

  const slash = await runHook('user-prompt-submit.js', fixture('user-prompt-submit-slash', { cwd }), { dataDir });
  assert.equal(slash.output, null);
});

test('UserPromptSubmit contract: alias fixture switches mode', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();
  const r = await runHook('user-prompt-submit.js', fixture('user-prompt-submit-alias', { cwd }), { dataDir });
  assert.ok(additionalContextOf(r).includes('level:2'));
});

test('UserPromptExpansion contract: valid updates state, invalid blocks, query reads', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();

  const valid = await runHook('user-prompt-expansion.js', fixture('user-prompt-expansion-valid', { cwd }), { dataDir });
  assert.ok(additionalContextOf(valid).includes('level:2'));

  const invalid = await runHook('user-prompt-expansion.js', fixture('user-prompt-expansion-invalid', { cwd }), { dataDir });
  assert.equal(decisionOf(invalid).decision, 'block');

  const query = await runHook('user-prompt-expansion.js', fixture('user-prompt-expansion-query', { cwd }), { dataDir });
  assert.ok(additionalContextOf(query).includes('현재 mode'));
});

test('PreToolUse contract: benign bash passes, dangerous bash denied, mcp destructive denied', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();

  const benign = await runHook('pre-tool-use.js', fixture('pre-tool-use-bash', { cwd }), { dataDir });
  assert.equal(benign.output, null);

  // Fixture deletes its own cwd → project-root deny.
  const dangerous = fixture('pre-tool-use-bash-dangerous', { cwd });
  dangerous.tool_input = { ...dangerous.tool_input, command: `rm -rf ${cwd}` };
  const d = await runHook('pre-tool-use.js', dangerous, { dataDir, cwd });
  assert.equal(decisionOf(d).decision, 'deny');
  assert.equal(d.output.hookSpecificOutput.hookEventName, 'PreToolUse');

  const mcp = await runHook('pre-tool-use.js', fixture('pre-tool-use-mcp-destructive', { cwd }), { dataDir });
  assert.equal(decisionOf(mcp).decision, 'deny');
});

test('PostToolUse/Failure/Batch contract: events flow through single-writer aggregation', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();
  const sid = fixture('post-tool-use').session_id;

  await runHook('post-tool-use.js', fixture('post-tool-use', { cwd }), { dataDir });
  await runHook('post-tool-use-failure.js', fixture('post-tool-use-failure', { cwd }), { dataDir });
  const eventsDir = path.join(dataDir, 'sessions', sid, 'events');
  assert.equal(fs.readdirSync(eventsDir).length, 2);

  const batch = await runHook('post-tool-batch.js', fixture('post-tool-batch', { cwd }), { dataDir });
  assert.equal(batch.code, 0);
  assert.equal(fs.readdirSync(eventsDir).length, 0);
  const state = readSessionState(dataDir, sid);
  assert.ok(Object.keys(state.loop_stats).length >= 1);
});

test('Stop contract: counts once, stop_hook_active variant does not count', async () => {
  const dataDir = makeDataDir();
  const sid = fixture('stop').session_id;

  await runHook('stop.js', fixture('stop'), { dataDir });
  assert.equal(readSessionState(dataDir, sid).term_counts.commit, 1);

  await runHook('stop.js', fixture('stop-active'), { dataDir });
  assert.equal(readSessionState(dataDir, sid).term_counts.commit, 1, 'stop_hook_active must not count');
});

test('SessionEnd contract: clear deletes session state', async () => {
  const dataDir = makeDataDir();
  const sid = fixture('session-end-clear').session_id;
  await runHook('stop.js', fixture('stop'), { dataDir });
  assert.ok(readSessionState(dataDir, sid));
  await runHook('session-end.js', fixture('session-end-clear'), { dataDir });
  assert.equal(readSessionState(dataDir, sid), null);
});

test('state stays under CLAUDE_PLUGIN_DATA — plugin root untouched', async () => {
  const dataDir = makeDataDir();
  const cwd = freshCwd();
  const before = fs.readdirSync(repoRoot).sort().join(',');
  await runHook('session-start.js', fixture('session-start-startup', { cwd }), { dataDir });
  await runHook('user-prompt-submit.js', fixture('user-prompt-submit', { cwd }), { dataDir });
  const after = fs.readdirSync(repoRoot).sort().join(',');
  assert.equal(after, before, 'no new entries in plugin root');
  assert.ok(fs.existsSync(path.join(dataDir, 'sessions')), 'session state created under data dir');
});
