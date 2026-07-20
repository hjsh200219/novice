import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runHook, makeDataDir, additionalContextOf, readSessionState,
} from '../helpers/run-hook.js';
import { setProjectMode } from '../../scripts/lib/state.js';

const SID = 'batch-test-session';
const GHP = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6jK9m';

function freshProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novice-batch-proj-'));
}

function successPayload(toolUseId, command = 'npm test') {
  return {
    session_id: SID,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_use_id: toolUseId,
    tool_input: { command },
    tool_response: { stdout: 'ok', stderr: '' },
  };
}

function failurePayload(toolUseId, command = 'npm test') {
  return {
    session_id: SID,
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'Bash',
    tool_use_id: toolUseId,
    tool_input: { command },
    error: 'Command failed with exit code 1',
  };
}

function batchPayload(cwd) {
  return { session_id: SID, cwd, hook_event_name: 'PostToolBatch' };
}

function eventsDir(dataDir) {
  return path.join(dataDir, 'sessions', SID, 'events');
}

test('events are created per tool_use_id and batch aggregates + deletes them', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();

  await runHook('post-tool-use.js', successPayload('tu-1'), { dataDir });
  await runHook('post-tool-use-failure.js', failurePayload('tu-2'), { dataDir });
  assert.equal(fs.readdirSync(eventsDir(dataDir)).length, 2);

  await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  assert.equal(fs.readdirSync(eventsDir(dataDir)).length, 0, 'batch must delete processed events');

  const state = readSessionState(dataDir, SID);
  const stats = Object.values(state.loop_stats);
  assert.equal(stats.length, 1, 'same command → same fingerprint');
  assert.equal(stats[0].count, 2);
  assert.equal(stats[0].failures, 1);
});

test('repeated failures at level-1 threshold trigger exactly one intervention, then throttle', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject(); // built-in default level 1 → repeat_failure_threshold 2

  await runHook('post-tool-use-failure.js', failurePayload('tu-a'), { dataDir });
  await runHook('post-tool-use-failure.js', failurePayload('tu-b'), { dataDir });
  const first = await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  const ctx = additionalContextOf(first);
  assert.ok(ctx?.includes('[novice]'), 'intervention expected at threshold');
  assert.ok(ctx.includes('2회'), 'failure count surfaced');

  // No new failures → no repeated nagging.
  await runHook('post-tool-use.js', successPayload('tu-c', 'other command'), { dataDir });
  const second = await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  assert.equal(additionalContextOf(second), null, 'no repeat intervention without new failures');
});

test('multiple exceeding fingerprints still yield at most one message per batch', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  for (const cmd of ['cmd-one', 'cmd-two']) {
    for (let i = 0; i < 2; i++) {
      await runHook('post-tool-use-failure.js', failurePayload(`tu-${cmd}-${i}`, cmd), { dataDir });
    }
  }
  const r = await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  const ctx = additionalContextOf(r);
  assert.ok(ctx, 'one intervention expected');
  assert.equal(ctx.match(/\[novice\]/g).length, 1, 'single message only');
});

test('novice off: aggregation continues, intervention text suppressed', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  setProjectMode(cwd, 'off', { CLAUDE_PLUGIN_DATA: dataDir });

  await runHook('post-tool-use-failure.js', failurePayload('tu-x'), { dataDir });
  await runHook('post-tool-use-failure.js', failurePayload('tu-y'), { dataDir });
  const r = await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  assert.equal(additionalContextOf(r), null, 'off must not inject');
  const state = readSessionState(dataDir, SID);
  assert.equal(Object.values(state.loop_stats)[0].failures, 2, 'aggregation still happens');
});

test('duplicate tool_use_id delivery is a silent no-op', async () => {
  const dataDir = makeDataDir();
  const r1 = await runHook('post-tool-use.js', successPayload('dup-1'), { dataDir });
  const r2 = await runHook('post-tool-use.js', successPayload('dup-1'), { dataDir });
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  assert.equal(fs.readdirSync(eventsDir(dataDir)).length, 1);
});

test('10 parallel event writers then one batch: all aggregated, dir empty', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      runHook('post-tool-use.js', successPayload(`par-${i}`, `command ${i}`), { dataDir }),
    ),
  );
  assert.equal(fs.readdirSync(eventsDir(dataDir)).length, 10);
  await runHook('post-tool-batch.js', batchPayload(cwd), { dataDir });
  assert.equal(fs.readdirSync(eventsDir(dataDir)).length, 0);
  const state = readSessionState(dataDir, SID);
  const total = Object.values(state.loop_stats).reduce((a, s) => a + s.count, 0);
  assert.equal(total, 10);
});

test('secret in tool output is redacted via updatedToolOutput; event carries no secret', async () => {
  const dataDir = makeDataDir();
  const payload = successPayload('sec-1');
  payload.tool_response = { stdout: `token line: ${GHP}\nrest ok`, stderr: '' };
  const r = await runHook('post-tool-use.js', payload, { dataDir });
  const updated = r.output?.hookSpecificOutput?.updatedToolOutput;
  assert.ok(updated, 'updatedToolOutput expected');
  assert.ok(updated.stdout.includes('[REDACTED:github-token]'));
  assert.ok(!JSON.stringify(r.output).includes(GHP), 'stdout JSON must not contain the token');
  const eventRaw = fs.readFileSync(path.join(eventsDir(dataDir), 'sec-1.json'), 'utf8');
  assert.ok(!eventRaw.includes(GHP), 'event file must not contain the token');
});

test('clean output emits no updatedToolOutput; MCP content shape supported', async () => {
  const dataDir = makeDataDir();
  const clean = await runHook('post-tool-use.js', successPayload('clean-1'), { dataDir });
  assert.equal(clean.output, null);

  const mcp = {
    session_id: SID,
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__github__get_secret',
    tool_use_id: 'mcp-1',
    tool_input: { name: 'x' },
    tool_response: { content: [{ type: 'text', text: `value: ${GHP}` }] },
  };
  const r = await runHook('post-tool-use.js', mcp, { dataDir });
  const updated = r.output?.hookSpecificOutput?.updatedToolOutput;
  assert.ok(updated.content[0].text.includes('[REDACTED:github-token]'));
});

test('malformed stdin fails open without corrupting state', async () => {
  const dataDir = makeDataDir();
  for (const script of ['post-tool-use.js', 'post-tool-use-failure.js', 'post-tool-batch.js']) {
    const r = await runHook(script, '{broken', { dataDir });
    assert.equal(r.code, 0, `${script} must fail open`);
  }
});
