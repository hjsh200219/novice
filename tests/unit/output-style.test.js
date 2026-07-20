// Completion criteria A: novice mode on/off and plugin enable/disable must never change the
// user's output style. novice is designed to hold this trivially — no code path emits an
// output-style directive and no hook writes settings. These tests lock that invariant so a
// future change can't quietly introduce an output-style side effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHook, makeDataDir, repoRoot } from '../helpers/run-hook.js';

// 1) Static guarantee: no source file references output-style APIs at all.
test('no plugin source references output style', () => {
  const dirs = ['scripts', 'hooks', 'skills', 'config'];
  const offenders = [];
  const re = /output[_-]?style|outputStyle|force-for-plugin/i;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|json|md)$/.test(entry.name) && re.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  for (const d of dirs) walk(path.join(repoRoot, d));
  assert.deepEqual(offenders, [], `output-style reference found in: ${offenders.join(', ')}`);
});

// 2) Behavioral guarantee: no hook output ever carries an output-style field, across every
// mode transition and enable/disable path.
function hasOutputStyleField(obj) {
  let found = false;
  (function scan(v) {
    if (found || v == null) return;
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (/output[_-]?style/i.test(k)) { found = true; return; }
        scan(val);
      }
    }
  })(obj);
  return found;
}

test('no hook emits an output-style field across mode transitions and off', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-ostyle-'));
  const sid = 'ostyle-session';

  const runs = [];
  runs.push(await runHook('session-start.js', { session_id: sid, cwd, hook_event_name: 'SessionStart', source: 'startup' }, { dataDir }));
  for (const args of ['1', '2', '3', 'off']) {
    runs.push(await runHook('user-prompt-expansion.js', {
      session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
      command_name: 'novice:mode', command_args: args, command_source: 'plugin', prompt: `/novice:mode ${args}`,
    }, { dataDir }));
  }
  runs.push(await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: '안녕' }, { dataDir }));

  for (const r of runs) {
    if (r.output) assert.equal(hasOutputStyleField(r.output), false, `output-style field leaked: ${JSON.stringify(r.output)}`);
  }
});
