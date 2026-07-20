import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHook, makeDataDir, readSessionState } from '../helpers/run-hook.js';

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
