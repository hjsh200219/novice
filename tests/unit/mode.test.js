import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runHook, makeDataDir, additionalContextOf, decisionOf, readProjectOverrides, repoRoot,
} from '../helpers/run-hook.js';

const SID = 'mode-test-session';

function expansionPayload(args, cwd) {
  return {
    session_id: SID,
    cwd,
    hook_event_name: 'UserPromptExpansion',
    expansion_type: 'slash_command',
    command_name: 'novice:mode',
    command_args: args,
    command_source: 'plugin:novice',
    prompt: `/novice:mode ${args}`.trim(),
  };
}

function submitPayload(prompt, cwd) {
  return { session_id: SID, cwd, hook_event_name: 'UserPromptSubmit', prompt };
}

function freshProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mode-proj-'));
}

test('expansion transitions 1→2→3→off update state and inject fresh capsule/tombstone', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  for (const level of ['1', '2', '3']) {
    const r = await runHook('user-prompt-expansion.js', expansionPayload(level, cwd), { dataDir });
    assert.equal(r.code, 0);
    const ctx = additionalContextOf(r);
    assert.ok(ctx.includes('[NOVICE_STATE]'), `level ${level} must inject capsule`);
    assert.ok(ctx.includes(`level:${level}`), `capsule must carry level ${level}`);
    assert.ok(ctx.includes('대체한다'), 'capsule must carry supersession sentence');
    const overrides = readProjectOverrides(dataDir);
    assert.equal(overrides[0].level, Number(level));
    assert.equal(overrides[0].enabled, true);
  }
  const off = await runHook('user-prompt-expansion.js', expansionPayload('off', cwd), { dataDir });
  const offCtx = additionalContextOf(off);
  assert.ok(offCtx.includes('NOVICE_STATE: OFF'));
  assert.ok(offCtx.length <= 300);
  assert.equal(readProjectOverrides(dataDir)[0].enabled, false);
});

test('invalid expansion args block without state change', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  await runHook('user-prompt-expansion.js', expansionPayload('2', cwd), { dataDir });

  for (const bad of ['9', '4', 'loud', 'on', '1 2']) {
    const r = await runHook('user-prompt-expansion.js', expansionPayload(bad, cwd), { dataDir });
    const d = decisionOf(r);
    assert.equal(d?.decision, 'block', `args '${bad}' must block`);
    assert.match(d.reason, /1\|2\|3\|off/);
    assert.equal(readProjectOverrides(dataDir)[0].level, 2, 'state must be unchanged');
    assert.equal(readProjectOverrides(dataDir)[0].enabled, true);
  }
});

test('empty args = status query, read-only', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  const r = await runHook('user-prompt-expansion.js', expansionPayload('', cwd), { dataDir });
  const ctx = additionalContextOf(r);
  assert.ok(ctx.includes('현재 mode'));
  assert.ok(ctx.includes('안전 게이트'));
  assert.equal(readProjectOverrides(dataDir).length, 0, 'status query must not create state');
});

test('other command names are ignored', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  const payload = { ...expansionPayload('2', cwd), command_name: 'other:cmd' };
  const r = await runHook('user-prompt-expansion.js', payload, { dataDir });
  assert.equal(r.output, null);
  assert.equal(readProjectOverrides(dataDir).length, 0);
});

test('natural-language aliases switch mode via the same state writer', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();

  const r2 = await runHook('user-prompt-submit.js', submitPayload('novice 2', cwd), { dataDir });
  assert.ok(additionalContextOf(r2).includes('level:2'));
  assert.equal(readProjectOverrides(dataDir)[0].level, 2);

  const rTrail = await runHook('user-prompt-submit.js', submitPayload('  novice 3. ', cwd), { dataDir });
  assert.ok(additionalContextOf(rTrail).includes('level:3'), 'trailing period + whitespace normalized');
  assert.equal(readProjectOverrides(dataDir)[0].level, 3);

  const rOff = await runHook('user-prompt-submit.js', submitPayload('novice off', cwd), { dataDir });
  assert.ok(additionalContextOf(rOff).includes('NOVICE_STATE: OFF'));
  assert.equal(readProjectOverrides(dataDir)[0].enabled, false);
});

test('out-of-list sentences change nothing persistent', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  await runHook('user-prompt-expansion.js', expansionPayload('2', cwd), { dataDir });

  const sentences = [
    '더 쉽게 설명해 줘',
    '이제 간단히',
    'novice를 꺼줘',
    'novice 4',
    'novice off please',
    'please novice off',
  ];
  for (const s of sentences) {
    await runHook('user-prompt-submit.js', submitPayload(s, cwd), { dataDir });
    const o = readProjectOverrides(dataDir)[0];
    assert.equal(o.level, 2, `'${s}' must not change level`);
    assert.equal(o.enabled, true, `'${s}' must not disable novice`);
  }
});

test('mode SKILL.md is user-invocable only (disable-model-invocation)', () => {
  const skill = fs.readFileSync(path.join(repoRoot, 'skills', 'mode', 'SKILL.md'), 'utf8');
  assert.match(skill, /^name: mode$/m);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.ok(skill.includes('/novice:mode 1|2|3|off') || skill.includes('/novice:mode'));
});

test('exact slash prompt is skipped by submit hook (expansion owns the turn)', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  const r = await runHook('user-prompt-submit.js', submitPayload('/novice:mode 2', cwd), { dataDir });
  assert.equal(r.output, null, 'submit hook must not inject anything for slash prompts');
  assert.equal(readProjectOverrides(dataDir).length, 0, 'submit hook must not change state for slash prompts');
});
