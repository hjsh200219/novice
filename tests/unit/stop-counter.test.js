import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHook, makeDataDir, readSessionState, readProjectOverrides, additionalContextOf } from '../helpers/run-hook.js';

const SID = 'stop-test-session';

function stopPayload(message, { active = false } = {}) {
  return {
    session_id: SID,
    hook_event_name: 'Stop',
    stop_hook_active: active,
    last_assistant_message: message,
  };
}

const COMMIT_EXPLAINED = 'commit(현재 변경을 하나의 저장 지점으로 기록하는 것)을 만들었어요.';

test('canonical term(설명) pattern counts once per term per message', async () => {
  const dataDir = makeDataDir();
  const doubled = `${COMMIT_EXPLAINED} 그리고 다시 commit(현재 변경을 하나의 저장 지점으로 기록하는 것)을 설명해요. branch(원본을 건드리지 않고 변경을 시도할 수 있는 독립 작업 줄기)도 만들어요.`;
  await runHook('stop.js', stopPayload(doubled), { dataDir });
  const state = readSessionState(dataDir, SID);
  assert.equal(state.term_counts.commit, 1, 'same term counts once per message');
  assert.equal(state.term_counts.branch, 1);
});

test('bare mentions and code blocks are not counted', async () => {
  const dataDir = makeDataDir();
  const message = [
    'commit을 실행해요. branch도 씁니다.', // bare mentions — no canonical parenthetical
    '```bash',
    'git commit -m "x" # commit(현재 변경을 하나의 저장 지점으로 기록하는 것)',
    '```',
    '인라인 코드 `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`도 제외.',
  ].join('\n');
  await runHook('stop.js', stopPayload(message), { dataDir });
  const state = readSessionState(dataDir, SID);
  assert.equal(state?.term_counts?.commit ?? 0, 0);
  assert.equal(state?.term_counts?.branch ?? 0, 0);
});

test('duplicate Stop for the same message does not double-count', async () => {
  const dataDir = makeDataDir();
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 1);
});

test('different messages accumulate to fade threshold', async () => {
  const dataDir = makeDataDir();
  for (let i = 0; i < 3; i++) {
    await runHook('stop.js', stopPayload(`${i}번째: ${COMMIT_EXPLAINED}`), { dataDir });
  }
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 3);
});

test('stop_hook_active or missing message leaves counters untouched', async () => {
  const dataDir = makeDataDir();
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });

  await runHook('stop.js', stopPayload(`다시 ${COMMIT_EXPLAINED}`, { active: true }), { dataDir });
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 1, 'stop_hook_active must not count');

  const noMessage = { session_id: SID, hook_event_name: 'Stop', stop_hook_active: false };
  const r = await runHook('stop.js', noMessage, { dataDir });
  assert.equal(r.code, 0);
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 1, 'missing message must not count');
});

test('reset aliases zero counters; questions do not', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-stop-proj-'));
  const submit = (prompt) =>
    runHook('user-prompt-submit.js', { session_id: SID, cwd, hook_event_name: 'UserPromptSubmit', prompt }, { dataDir });

  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  await runHook('stop.js', stopPayload(`한 번 더 ${COMMIT_EXPLAINED}`), { dataDir });
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 2);

  await submit('commit이 뭐예요');
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 2, 'question must not reset');

  await submit('novice reset commit');
  const afterOne = readSessionState(dataDir, SID);
  assert.equal(afterOne.term_counts.commit ?? 0, 0);
  assert.ok(afterOne.reset_terms.includes('commit'));

  await runHook('stop.js', stopPayload(`리셋 후 ${COMMIT_EXPLAINED}`), { dataDir });
  const recount = readSessionState(dataDir, SID);
  assert.equal(recount.term_counts.commit, 1, 'explained again after reset starts a fresh cycle');
  assert.ok(!recount.reset_terms.includes('commit'));

  await runHook('stop.js', stopPayload('branch(원본을 건드리지 않고 변경을 시도할 수 있는 독립 작업 줄기)!'), { dataDir });
  await submit('novice reset all');
  const cleared = readSessionState(dataDir, SID);
  assert.deepEqual(cleared.term_counts, {});
});

function mutedOf(dataDir) {
  return readProjectOverrides(dataDir)[0]?.muted_terms ?? [];
}

test('novice mute is project-scoped (persists across sessions); unmute restores; question does not mute', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mute-proj-'));
  const submit = (prompt, sid = SID) =>
    runHook('user-prompt-submit.js', { session_id: sid, cwd, hook_event_name: 'UserPromptSubmit', prompt }, { dataDir });

  // A term the user never wants explained again, even with zero exposures.
  await submit('novice mute commit');
  assert.deepEqual(mutedOf(dataDir), ['commit'], 'mute stored in project override, not session');

  // Explaining it afterward must not un-mute it (mute is intentional and sticky).
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  assert.deepEqual(mutedOf(dataDir), ['commit']);

  // A plain question does not mute.
  await submit('commit이 뭐예요');
  assert.deepEqual(mutedOf(dataDir), ['commit']);

  // Unmute restores normal fade behavior.
  await submit('novice unmute commit');
  assert.deepEqual(mutedOf(dataDir), []);

  // Alias resolves to the canonical term.
  await submit('novice mute 커밋');
  assert.deepEqual(mutedOf(dataDir), ['commit']);

  // Unknown target does not create a mute entry.
  await submit('novice mute 없는용어xyz');
  assert.deepEqual(mutedOf(dataDir), ['commit']);
});

test('a term muted in one session is still faded in a brand-new session', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mute-xsession-'));

  // Session A mutes the term.
  await runHook(
    'user-prompt-submit.js',
    { session_id: 'sess-A', cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice mute branch' },
    { dataDir },
  );
  assert.deepEqual(mutedOf(dataDir), ['branch']);

  // A completely different session starts fresh — the mute must carry over.
  const start = await runHook(
    'session-start.js',
    { session_id: 'sess-B', cwd, hook_event_name: 'SessionStart', source: 'startup' },
    { dataDir },
  );
  const ctx = additionalContextOf(start) ?? '';
  assert.ok(ctx.includes('[NOVICE_STATE]'), 'new session injects a capsule');
  assert.ok(ctx.includes('branch'), 'project-scoped mute must appear in the new session faded list');
});

test('muted term appears in the injected capsule faded list', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-mute-cap-'));
  const submit = (prompt) =>
    runHook('user-prompt-submit.js', { session_id: SID, cwd, hook_event_name: 'UserPromptSubmit', prompt }, { dataDir });

  const r = await submit('novice mute branch');
  const ctx = r.output?.hookSpecificOutput?.additionalContext ?? '';
  assert.ok(ctx.includes('[NOVICE_STATE]'), 'mute should re-inject the capsule');
  assert.ok(ctx.includes('branch'), 'muted term must show in the 설명 제외(faded) list');
});

test('alias-based reset resolves to canonical term', async () => {
  const dataDir = makeDataDir();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-stop-proj-'));
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  await runHook(
    'user-prompt-submit.js',
    { session_id: SID, cwd, hook_event_name: 'UserPromptSubmit', prompt: 'novice reset 커밋' },
    { dataDir },
  );
  const state = readSessionState(dataDir, SID);
  assert.equal(state.term_counts.commit ?? 0, 0);
  assert.ok(state.reset_terms.includes('commit'));
});

test('counters persist across resume (state file survives)', async () => {
  const dataDir = makeDataDir();
  await runHook('stop.js', stopPayload(COMMIT_EXPLAINED), { dataDir });
  // simulate resume: session-start does not clear counters
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'novice-stop-proj-'));
  await runHook('session-start.js', { session_id: SID, cwd, hook_event_name: 'SessionStart', source: 'resume' }, { dataDir });
  assert.equal(readSessionState(dataDir, SID).term_counts.commit, 1);
});
