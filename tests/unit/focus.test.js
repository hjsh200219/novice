// focus dial: capsule builders, revision stability, project-scoped persistence, and the
// two-dial composition rule (focus is independent of novice_enabled).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHook, makeDataDir, additionalContextOf, readSessionState, readProjectOverrides } from '../helpers/run-hook.js';
import { loadFocusRules, focusRevision, buildFocusCapsule, buildFocusTombstone, focusSegment, applyFocusSegment } from '../../scripts/lib/capsule.js';
import { getProjectConfig, setProjectFocus, defaultSessionState } from '../../scripts/lib/state.js';

function tmpCwd() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novice-focus-'));
}

// ---- pure builders ----

test('focus revision depends on rule ids, not on rule wording', () => {
  const rules = loadFocusRules();
  const base = focusRevision(rules);
  const reworded = { ...rules, rules: rules.rules.map((r) => ({ ...r, ko: `${r.ko} (다시 씀)` })) };
  assert.equal(focusRevision(reworded), base, '문구만 고치면 revision이 유지돼야 한다');

  const dropped = { ...rules, rules: rules.rules.slice(0, -1) };
  assert.notEqual(focusRevision(dropped), base, '규칙을 빼면 revision이 바뀌어야 한다');
});

test('focus capsule carries every rule, stays under the cap, and supersedes prior turns', () => {
  const rules = loadFocusRules();
  const capsule = buildFocusCapsule(focusRevision(rules));
  assert.ok(capsule.length <= rules.capsule_max_chars, `capsule ${capsule.length}자 > 상한 ${rules.capsule_max_chars}`);
  assert.match(capsule, /^\[NOVICE_FOCUS\] schema_version:\d+ rev:[0-9a-f]{8}$/m);
  for (let i = 1; i <= rules.rules.length; i += 1) {
    assert.match(capsule, new RegExp(`^${i}\\. `, 'm'), `규칙 ${i}번 누락`);
  }
  assert.match(capsule, /이전 turn의 모든 NOVICE_FOCUS 지시를 대체한다/);
});

test('under the cap the capsule keeps the prose qualifiers', () => {
  const rules = loadFocusRules();
  const capsule = buildFocusCapsule('abcdef12');
  assert.ok(capsule.includes(rules.precedence), '우선순위 문장이 살아 있어야 한다');
  assert.ok(capsule.includes(rules.exceptions), '예외 문장이 살아 있어야 한다');
  assert.equal(capsule.split('\n').filter((l) => /^\d+\. /.test(l)).length, rules.rules.length);
});

// Point the config loader at a throwaway plugin root whose cap only the numbered core fits
// under, so the overflow branch actually runs instead of being asserted from the outside.
test('over the cap the capsule drops the prose qualifiers, never a rule', () => {
  const rules = loadFocusRules();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-focus-root-'));
  const core = ['[NOVICE_FOCUS] schema_version:1 rev:abcdef12', '응답 형태 규칙:',
    ...rules.rules.map((r, i) => `${i + 1}. ${r.ko}`)].join('\n').length;
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'config', 'focus-rules.json'),
    JSON.stringify({ ...rules, capsule_max_chars: core + 60 }),
  );

  const capsule = buildFocusCapsule('abcdef12', { CLAUDE_PLUGIN_ROOT: root });
  assert.equal(capsule.split('\n').filter((l) => /^\d+\. /.test(l)).length, rules.rules.length, '규칙은 절대 잘리지 않는다');
  assert.ok(!capsule.includes(rules.precedence), '상한을 넘으면 우선순위 문장을 버린다');
  assert.ok(!capsule.includes(rules.exceptions), '상한을 넘으면 예외 문장을 버린다');
  assert.match(capsule, /이전 turn의 모든 NOVICE_FOCUS 지시를 대체한다/, 'supersession은 남는다');
  assert.ok(capsule.length <= core + 60);
});

test('focus tombstone cancels only focus, not level rules or the safety gate', () => {
  const t = buildFocusTombstone();
  assert.match(t, /^NOVICE_FOCUS: OFF/);
  assert.match(t, /NOVICE_FOCUS 응답 형태 지시를 무시한다/);
  assert.match(t, /안전 게이트는 그대로 유지/);
  assert.ok(!t.includes('NOVICE_STATE'), 'focus tombstone이 level 지시를 취소하면 안 된다');
});

// ---- segment state machine ----

test('focusSegment is one-shot for the tombstone and repeats while enabled', () => {
  const session = defaultSessionState();

  // never enabled → silence
  assert.equal(applyFocusSegment(session, focusSegment(false, session)), null);
  assert.equal(session.focus_revision, null);

  // enabled → capsule every turn
  const first = applyFocusSegment(session, focusSegment(true, session));
  assert.match(first, /NOVICE_FOCUS/);
  const rev = session.focus_revision;
  assert.ok(rev, 'revision이 기록돼야 한다');
  assert.match(applyFocusSegment(session, focusSegment(true, session)), /NOVICE_FOCUS/);
  assert.equal(session.focus_revision, rev);

  // disabled → exactly one tombstone, then silence
  assert.match(applyFocusSegment(session, focusSegment(false, session)), /NOVICE_FOCUS: OFF/);
  assert.equal(session.focus_revision, null);
  assert.equal(applyFocusSegment(session, focusSegment(false, session)), null);
});

// ---- project-scoped persistence ----

test('setProjectFocus persists per project and does not disturb level or mutes', () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: dataDir };

  assert.equal(getProjectConfig(cwd, env).focus_enabled, false, '기본값은 off');
  setProjectFocus(cwd, true, env);
  const on = getProjectConfig(cwd, env);
  assert.equal(on.focus_enabled, true);
  assert.equal(on.level, 1, 'focus 전환이 level을 건드리면 안 된다');

  setProjectFocus(cwd, false, env);
  assert.equal(getProjectConfig(cwd, env).focus_enabled, false);
  assert.throws(() => setProjectFocus(cwd, 'yes', env), /invalid focus/);
});

test('focus_default userConfig sets the baseline; project override wins', () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const env = { ...process.env, CLAUDE_PLUGIN_DATA: dataDir, CLAUDE_PLUGIN_CONFIG: JSON.stringify({ focus_default: true }) };

  assert.equal(getProjectConfig(cwd, env).focus_enabled, true, 'userConfig 기본값이 적용돼야 한다');
  setProjectFocus(cwd, false, env);
  assert.equal(getProjectConfig(cwd, env).focus_enabled, false, '프로젝트 override가 이겨야 한다');
});

// ---- hook wiring ----

test('SessionStart carries level capsule and focus capsule together', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-start';

  await runHook('user-prompt-expansion.js', {
    session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
    command_name: 'novice:focus', command_args: 'on', command_source: 'plugin', prompt: '/novice:focus on',
  }, { dataDir });

  const start = await runHook('session-start.js', { session_id: sid, cwd, hook_event_name: 'SessionStart', source: 'startup' }, { dataDir });
  const ctx = additionalContextOf(start);
  assert.match(ctx, /\[NOVICE_STATE\]/);
  assert.match(ctx, /NOVICE_GLOSSARY/);
  assert.match(ctx, /\[NOVICE_FOCUS\]/);
  assert.equal(readSessionState(dataDir, sid).skip_next_submit, true);
});

test('the handshake suppresses the duplicate focus capsule on the next prompt', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-handshake';

  await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice focus on' }, { dataDir });
  await runHook('session-start.js', { session_id: sid, cwd, hook_event_name: 'SessionStart', source: 'startup' }, { dataDir });

  const next = await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: '안녕' }, { dataDir });
  assert.equal(additionalContextOf(next), null, 'SessionStart 직후 동일 payload는 재주입하지 않는다');

  const later = await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: '다음' }, { dataDir });
  assert.match(additionalContextOf(later), /\[NOVICE_FOCUS\]/, '이후 턴에는 다시 주입한다');
});

test('focus survives novice off and stays project-scoped', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-independent';

  await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice focus on' }, { dataDir });
  const off = await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice off' }, { dataDir });
  const ctx = additionalContextOf(off);
  assert.match(ctx, /NOVICE_STATE: OFF/, 'level은 꺼져야 한다');
  assert.match(ctx, /\[NOVICE_FOCUS\]/, 'focus는 novice off와 무관하게 살아 있어야 한다');

  const overrides = readProjectOverrides(dataDir);
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].focus_enabled, true);
  assert.equal(overrides[0].enabled, false);
});

test('/novice:focus off emits exactly one tombstone and then goes quiet', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-off';

  await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice focus on' }, { dataDir });
  const offRun = await runHook('user-prompt-expansion.js', {
    session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
    command_name: 'novice:focus', command_args: 'off', command_source: 'plugin', prompt: '/novice:focus off',
  }, { dataDir });
  assert.match(additionalContextOf(offRun), /NOVICE_FOCUS: OFF/);

  const after = await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: '안녕' }, { dataDir });
  const ctx = additionalContextOf(after) ?? '';
  assert.ok(!ctx.includes('NOVICE_FOCUS'), 'tombstone은 한 번만 나온다');
  assert.match(ctx, /\[NOVICE_STATE\]/, 'level capsule은 계속 나온다');
});

test('/novice:focus with no args is read-only; invalid args block without writing state', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-args';

  const status = await runHook('user-prompt-expansion.js', {
    session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
    command_name: 'novice:focus', command_args: '', command_source: 'plugin', prompt: '/novice:focus',
  }, { dataDir });
  assert.match(additionalContextOf(status), /\[novice focus 상태\] 현재: off/);
  assert.deepEqual(readProjectOverrides(dataDir), [], '상태 조회는 아무것도 쓰지 않는다');

  const bad = await runHook('user-prompt-expansion.js', {
    session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
    command_name: 'novice:focus', command_args: 'yes', command_source: 'plugin', prompt: '/novice:focus yes',
  }, { dataDir });
  assert.equal(bad.output.decision, 'block');
  assert.match(bad.output.reason, /\/novice:focus on\|off/);
  assert.deepEqual(readProjectOverrides(dataDir), [], '잘못된 인자는 상태를 바꾸지 않는다');
});

test('an exact /novice:focus prompt is left to expansion (no duplicate capsule)', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-slash';
  const r = await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: '/novice:focus on' }, { dataDir });
  assert.equal(additionalContextOf(r), null);
});

test('/novice:mode status reports the focus dial', async () => {
  const dataDir = makeDataDir();
  const cwd = tmpCwd();
  const sid = 'focus-mode-status';

  await runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice focus on' }, { dataDir });
  const status = await runHook('user-prompt-expansion.js', {
    session_id: sid, cwd, hook_event_name: 'UserPromptExpansion',
    command_name: 'novice:mode', command_args: '', command_source: 'plugin', prompt: '/novice:mode',
  }, { dataDir });
  assert.match(additionalContextOf(status), /focus\(응답 형태 규칙\): on/);
});
