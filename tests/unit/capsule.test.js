import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runHook, makeDataDir, additionalContextOf, readSessionState,
} from '../helpers/run-hook.js';
import {
  buildCapsule, buildTombstone, buildGlossary, capsuleRevision, computeFadedTerms, loadTerms,
} from '../../scripts/lib/capsule.js';
import { setProjectMode } from '../../scripts/lib/state.js';

const SID = 'capsule-test-session';

function freshProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'novice-capsule-proj-'));
}

function startPayload(source, cwd) {
  return { session_id: SID, cwd, hook_event_name: 'SessionStart', source };
}

function submitPayload(prompt, cwd) {
  return { session_id: SID, cwd, hook_event_name: 'UserPromptSubmit', prompt };
}

// ---- pure builders ----

test('capsule ≤800 chars with schema_version, level, and supersession sentence', () => {
  for (const level of [1, 2, 3]) {
    const faded = level === 2 ? ['commit', 'branch', 'deploy'] : [];
    const rev = capsuleRevision(level, faded);
    const capsule = buildCapsule({ level, fadedTerms: faded, revision: rev });
    assert.ok(capsule.length <= 800, `level ${level} capsule ${capsule.length} > 800`);
    assert.ok(capsule.includes('[NOVICE_STATE]'));
    assert.ok(capsule.includes('schema_version:'));
    assert.ok(capsule.includes(`level:${level}`));
    assert.ok(capsule.includes('이 NOVICE_STATE capsule은 이전 turn의 모든 NOVICE_STATE 지시를 대체한다'));
  }
  // Even with every term faded, the cap holds.
  const allTerms = loadTerms().terms.map((t) => t.term);
  const capsule = buildCapsule({ level: 1, fadedTerms: allTerms, revision: 'deadbeef' });
  assert.ok(capsule.length <= 800);
});

test('tombstone ≤300 chars and voids previous novice context', () => {
  const t = buildTombstone();
  assert.ok(t.length <= 300);
  assert.ok(t.includes('NOVICE_STATE: OFF'));
  assert.ok(t.includes('NOVICE_GLOSSARY'));
});

test('glossary ≤5000 chars and contains all 32 terms', () => {
  const terms = loadTerms();
  const g = buildGlossary(terms);
  assert.ok(g.length <= 5000, `glossary ${g.length} > 5000`);
  assert.ok(g.includes('NOVICE_GLOSSARY'));
  for (const t of terms.terms) {
    assert.ok(g.includes(t.term), `glossary missing term: ${t.term}`);
  }
});

test('computeFadedTerms honors threshold and reset list', () => {
  const counts = { commit: 3, branch: 2, deploy: 5 };
  assert.deepEqual(computeFadedTerms(counts, 3), ['commit', 'deploy']);
  assert.deepEqual(computeFadedTerms(counts, 3, ['deploy']), ['commit']);
  assert.deepEqual(computeFadedTerms(counts, 1), ['branch', 'commit', 'deploy']);
  assert.deepEqual(computeFadedTerms({}, 3), []);
});

test('computeFadedTerms: muted terms are force-faded regardless of count and beat reset', () => {
  const counts = { commit: 3, branch: 2, deploy: 5 };
  // branch (count 2 < 3) is muted → faded anyway.
  assert.deepEqual(computeFadedTerms(counts, 3, [], ['branch']), ['branch', 'commit', 'deploy']);
  // a muted term with no exposures at all still fades.
  assert.deepEqual(computeFadedTerms({}, 3, [], ['api']), ['api']);
  // mute beats reset: commit reset (would un-fade) but also muted → stays faded.
  assert.deepEqual(computeFadedTerms(counts, 3, ['commit'], ['commit']), ['commit', 'deploy']);
});

test('capsuleRevision is stable and sensitive to level/faded set', () => {
  const a = capsuleRevision(1, ['commit']);
  assert.equal(a, capsuleRevision(1, ['commit']));
  assert.notEqual(a, capsuleRevision(2, ['commit']));
  assert.notEqual(a, capsuleRevision(1, ['branch']));
});

// ---- hook sequences ----

test('active session-start injects capsule+glossary once; next submit skips duplicate', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();

  const start = await runHook('session-start.js', startPayload('startup', cwd), { dataDir });
  const ctx = additionalContextOf(start);
  assert.ok(ctx.includes('[NOVICE_STATE]'));
  assert.ok(ctx.includes('NOVICE_GLOSSARY'));
  const state = readSessionState(dataDir, SID);
  assert.equal(state.skip_next_submit, true);
  assert.ok(state.capsule_revision);

  // First submit in the same model request: same revision → no duplicate injection.
  const submit1 = await runHook('user-prompt-submit.js', submitPayload('로그인 만들어 줘', cwd), { dataDir });
  assert.equal(submit1.output, null, 'first submit after session-start must not duplicate the capsule');
  assert.equal(readSessionState(dataDir, SID).skip_next_submit, false);

  // Next turn: capsule injected again (new model request).
  const submit2 = await runHook('user-prompt-submit.js', submitPayload('버튼 색 바꿔 줘', cwd), { dataDir });
  assert.ok(additionalContextOf(submit2).includes('[NOVICE_STATE]'));
});

test('compact/resume re-inject current state', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  setProjectMode(cwd, 3, { CLAUDE_PLUGIN_DATA: dataDir });

  for (const source of ['compact', 'resume', 'clear']) {
    const r = await runHook('session-start.js', startPayload(source, cwd), { dataDir });
    const ctx = additionalContextOf(r);
    assert.ok(ctx.includes('level:3'), `${source} must re-inject current level`);
  }
});

test('off from fresh session injects zero novice context', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();
  setProjectMode(cwd, 'off', { CLAUDE_PLUGIN_DATA: dataDir });

  const start = await runHook('session-start.js', startPayload('startup', cwd), { dataDir });
  assert.equal(start.output, null, 'fresh off session-start must inject nothing');
  const submit = await runHook('user-prompt-submit.js', submitPayload('안녕', cwd), { dataDir });
  assert.equal(submit.output, null, 'fresh off submit must inject nothing');
});

test('resume with project off after active capsules emits one tombstone then silence', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();

  // Session had active capsules…
  await runHook('session-start.js', startPayload('startup', cwd), { dataDir });
  // …then the project was switched off outside this session.
  setProjectMode(cwd, 'off', { CLAUDE_PLUGIN_DATA: dataDir });

  const resume = await runHook('session-start.js', startPayload('resume', cwd), { dataDir });
  const ctx = additionalContextOf(resume);
  assert.ok(ctx.includes('NOVICE_STATE: OFF'), 'resume must emit OFF tombstone once');

  const again = await runHook('session-start.js', startPayload('resume', cwd), { dataDir });
  assert.equal(again.output, null, 'tombstone must not repeat');
  const submit = await runHook('user-prompt-submit.js', submitPayload('안녕', cwd), { dataDir });
  assert.equal(submit.output, null, 'off turns after tombstone inject nothing');
});

test('same capsule_revision never injected twice in one request; mode change reinjects', async () => {
  const dataDir = makeDataDir();
  const cwd = freshProject();

  await runHook('session-start.js', startPayload('startup', cwd), { dataDir });
  const r1 = await runHook('user-prompt-submit.js', submitPayload('첫 질문', cwd), { dataDir });
  assert.equal(r1.output, null, 'duplicate revision suppressed');

  // Mode change → different revision → immediate injection even with skip flag semantics.
  setProjectMode(cwd, 2, { CLAUDE_PLUGIN_DATA: dataDir });
  const start2 = await runHook('session-start.js', startPayload('resume', cwd), { dataDir });
  assert.ok(additionalContextOf(start2).includes('level:2'));
  const r2 = await runHook('user-prompt-submit.js', submitPayload('다음 질문', cwd), { dataDir });
  assert.equal(r2.output, null, 'same new revision suppressed right after re-injection');
  const r3 = await runHook('user-prompt-submit.js', submitPayload('그다음 질문', cwd), { dataDir });
  assert.ok(additionalContextOf(r3).includes('level:2'), 'subsequent turns re-carry the capsule');
});
