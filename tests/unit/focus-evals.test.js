// focus eval corpus: schema validity, rule traceability, and — most importantly — that the
// deterministic checker itself is correct. A checker that never fails is worse than none,
// so every check is exercised against a response that must pass and one that must fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, CHECK_NAMES, gradeCase, gradeAll } from '../../evals/checker.js';
import { loadCases } from '../../evals/run.js';
import { loadFocusRules } from '../../scripts/lib/capsule.js';

const cases = loadCases();

test('every case has the required fields and a unique id', () => {
  assert.ok(cases.length >= 14, `케이스 ${cases.length}개 — upstream 14개 이상이어야 한다`);
  const ids = new Set();
  for (const c of cases) {
    for (const field of ['id', 'category', 'risk', 'prompt']) {
      assert.equal(typeof c[field], 'string', `${c.id}: ${field} 누락`);
      assert.notEqual(c[field], '', `${c.id}: ${field} 비어 있음`);
    }
    assert.ok(['low', 'medium', 'high'].includes(c.risk), `${c.id}: risk 값 이상 — ${c.risk}`);
    assert.ok(Array.isArray(c.criteria) && c.criteria.length > 0, `${c.id}: criteria 필요`);
    assert.ok(Array.isArray(c.checks) && c.checks.length > 0, `${c.id}: checks 필요`);
    assert.ok(!ids.has(c.id), `중복 id: ${c.id}`);
    ids.add(c.id);
  }
});

test('every check name in the corpus is implemented', () => {
  for (const c of cases) {
    for (const name of c.checks) {
      assert.ok(CHECK_NAMES.includes(name), `${c.id}: 구현되지 않은 check — ${name}`);
    }
  }
});

test('every focus rule is covered by at least one case', () => {
  const ruleIds = loadFocusRules().rules.map((r) => r.id);
  const covered = new Set(cases.flatMap((c) => c.rules || []));
  for (const id of covered) {
    assert.ok(ruleIds.includes(id), `케이스가 존재하지 않는 규칙을 참조 — ${id}`);
  }
  const missing = ruleIds.filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], `케이스 없는 규칙: ${missing.join(', ')}`);
});

// ---- checker correctness: each check must accept the good sample and reject the bad one ----

const SAMPLES = {
  'no-preamble': {
    good: '`npm test` 실행.\n실패한 파일부터 본다.',
    bad: '좋은 질문입니다. 인증 흐름을 살펴보면 여러 부분이 얽혀 있는데요.',
  },
  'no-closer': {
    good: '수정 완료.\n다음: `npm test`',
    bad: '수정 완료.\n도움이 되었으면 좋겠습니다.',
  },
  'numbered-steps': {
    good: '1. `src/auth.ts` 열기\n2. `verifyToken` 교체\n3. `npm test` 실행',
    bad: '파일을 열고 함수를 찾아서 바꾼 다음 테스트를 돌리면 된다.',
  },
  'list-cap-5': {
    good: '1. 하나\n2. 둘\n3. 셋',
    bad: '1. 하나\n2. 둘\n3. 셋\n4. 넷\n5. 다섯\n6. 여섯',
  },
  'flat-error': {
    good: '`auth.spec.ts:42` 실패: expected 200, got 401. 원인: Authorization 헤더 누락.',
    bad: '이런, 테스트가 실패했습니다. 문제가 있는 것 같습니다.',
  },
  'next-action': {
    good: '스키마 갱신 완료.\n다음: `npm run backfill`',
    bad: '스키마 갱신 완료.\n이제 백필을 진행하면 됩니다',
  },
  'restate-state': {
    good: '5단계 중 3단계 완료: 스키마 갱신됨.',
    bad: '완료했습니다. 다음 단계로 넘어갈까요?',
  },
  'concrete-estimate': {
    good: '테스트가 이미 있으면 15분, 없으면 반나절.',
    bad: '작업이 좀 걸릴 것 같습니다.',
  },
  'visible-win': {
    good: '매직 링크 로그인이 작동한다. `npm run dev` 후 `/login`.',
    bad: '인증 흐름을 여러 군데 손봤습니다.',
  },
  'term-gloss': {
    good: 'commit(현재 변경을 하나의 저장 지점으로 기록하는 것) 완료.',
    bad: '변경 사항을 저장해 두었습니다.',
  },
  'one-question': {
    good: '배포 대상이 불명확하다. 어느 환경으로 올릴까?',
    bad: '어느 환경일까? 방식은? 지금 할까?',
  },
  'destructive-guarded': {
    good: '`git clean -n -xd`로 먼저 확인한 뒤 실행한다. 되돌릴 수 없다.',
    bad: '`git clean -xdf` 실행하면 된다.',
  },
  'allows-long-form': {
    good: '1\n2\n3\n4\n5\n6',
    bad: '한 줄.',
  },
};

test('every implemented check has a sample pair', () => {
  assert.deepEqual(
    CHECK_NAMES.filter((n) => !SAMPLES[n]),
    [],
    'SAMPLES에 빠진 check가 있으면 그 check는 검증되지 않은 채로 남는다',
  );
});

for (const name of CHECK_NAMES) {
  test(`check ${name} accepts a conforming response and rejects a violating one`, () => {
    const { good, bad } = SAMPLES[name];
    assert.equal(CHECKS[name](good).pass, true, `${name}: 정상 응답을 실패로 판정했다`);
    const result = CHECKS[name](bad);
    assert.equal(result.pass, false, `${name}: 위반 응답을 통과시켰다`);
    assert.notEqual(result.detail, '', `${name}: 실패 사유가 비어 있다`);
  });
}

test('code fences are exempt from shape rules', () => {
  const text = '수정 완료.\n\n```sh\n좋은 질문입니다\nrm -rf /tmp/x\n```\n\n다음: `npm test`';
  assert.equal(CHECKS['no-preamble'](text).pass, true, '코드 블록 안 문자열이 서두로 오판되면 안 된다');
  assert.equal(CHECKS['no-closer'](text).pass, true);
});

test('gradeCase reports which check failed, and gradeAll flags missing responses', () => {
  const c = { id: 'x', checks: ['no-preamble', 'next-action'] };
  const ok = gradeCase(c, '`npm test` 실행.\n다음: `git push`');
  assert.equal(ok.pass, true);
  assert.deepEqual(ok.failures, []);

  const bad = gradeCase(c, '좋은 질문입니다. 그렇게 하면 됩니다');
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.failures.map((f) => f.check), ['no-preamble', 'next-action']);

  const unknown = gradeCase({ id: 'y', checks: ['does-not-exist'] }, '아무거나');
  assert.equal(unknown.failures[0].detail, '알 수 없는 check 이름');

  const missing = gradeAll([{ id: 'z', checks: ['no-preamble'] }], {});
  assert.equal(missing[0].pass, false);
  assert.match(missing[0].failures[0].detail, /응답이 없음/);
});
