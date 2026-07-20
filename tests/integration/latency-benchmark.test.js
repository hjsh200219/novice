// Completion criteria / §2 metric: blocking hooks must stay under budget
// (UserPromptSubmit p95 ≤ 300ms, PreToolUse p95 ≤ 250ms). PRD frames this as a 1,000-turn
// benchmark; this test runs a scaled iteration count in-process by default (fast enough for
// CI) and can be pushed to 1,000 via NOVICE_BENCH_ITERS. It measures real child-process hook
// invocations, so it captures process spin-up cost — the dominant term in practice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHook, makeDataDir, repoRoot } from '../helpers/run-hook.js';

const ITERS = Number(process.env.NOVICE_BENCH_ITERS) || 120;
const WARMUP = 10;

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function measure(script, payloadFor, { dataDir, cwd }) {
  const times = [];
  for (let i = 0; i < ITERS + WARMUP; i++) {
    const t0 = process.hrtime.bigint();
    await runHook(script, payloadFor(i), { dataDir, cwd });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (i >= WARMUP) times.push(ms);
  }
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 50), p95: percentile(times, 95), n: times.length };
}

test(`UserPromptSubmit p95 <= 300ms over ${ITERS} turns`, async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-bench-ups-'));
  const stats = await measure(
    'user-prompt-submit.js',
    (i) => ({ session_id: 'bench-ups', cwd, hook_event_name: 'UserPromptSubmit', prompt: `작업 요청 ${i}` }),
    { dataDir, cwd },
  );
  assert.ok(stats.p95 <= 300, `UserPromptSubmit p95 ${stats.p95.toFixed(0)}ms > 300ms (p50 ${stats.p50.toFixed(0)}ms)`);
});

test(`PreToolUse p95 <= 250ms over ${ITERS} turns (incl. git commit index scan)`, async () => {
  const dataDir = makeDataDir();
  // Real git repo so the commit path performs an actual index scan (worst realistic case).
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-bench-ptu-'));
  const git = (args) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@e.co']);
  git(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(cwd, 'app.js'), 'export const x = 1;\n');
  git(['add', 'app.js']);

  const stats = await measure(
    'pre-tool-use.js',
    () => ({ session_id: 'bench-ptu', cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git commit -m "bench"' } }),
    { dataDir, cwd },
  );
  assert.ok(stats.p95 <= 250, `PreToolUse p95 ${stats.p95.toFixed(0)}ms > 250ms (p50 ${stats.p50.toFixed(0)}ms)`);
});
