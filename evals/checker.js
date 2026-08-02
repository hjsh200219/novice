// Deterministic checks for focus-shaped responses.
// These are the mechanical half of evals/rubric.md: they catch shape violations without a
// model in the loop, so they can run in CI. The judgement half (correctness, autonomy,
// safety) still needs a human or an LLM judge against the rubric.
//
// Every check takes the response text and returns { pass, detail }.

const OPENERS = [
  /^좋은 질문/, /^네[,!.\s]/, /^물론/, /^알겠습니다/, /^확인했습니다/,
  /해\s?보겠습니다[.!]?$/, /살펴보겠습니다[.!]?$/, /^먼저[, ].*살펴/,
  /^(Great question|Sure|Certainly|Let me|I'll|Looking at your|To answer)/i,
];

const CLOSERS = [
  /도움이 되었으면/, /더 필요하시면/, /언제든지 말씀/, /궁금한 점이 있으(시|)면/,
  /추가로 필요한/, /편하게 말씀/,
  /(Hope this helps|Let me know if|Happy to clarify|Feel free to ask)/i,
];

const PANIC = [/이런[,.…!]/, /아이고/, /어라[,.…!]/, /문제가 있는 것 같/, /(Uh oh|Oh no)/i];

const DESTRUCTIVE = [/rm\s+-[a-z]*r[a-z]*f/, /git\s+clean\s+-[a-z]*x[a-z]*d/, /DROP\s+TABLE/i, /--force\b/, /-f\b\s*$/m];
const GUARDS = [/확인/, /실행 전/, /미리보기/, /먼저 점검/, /--dry-run/, /\bgit clean -n\b/, /되돌릴 수 없/];

const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•])\s+/;

function lines(text) {
  return String(text).split('\n');
}

function nonEmptyLines(text) {
  return lines(text).map((l) => l.trim()).filter((l) => l !== '');
}

// Code fences are verbatim content: shape rules apply to prose, not to what the user runs.
function stripFences(text) {
  return String(text).replace(/```[\s\S]*?```/g, '');
}

function firstLine(text) {
  return nonEmptyLines(stripFences(text))[0] ?? '';
}

function lastLine(text) {
  const l = nonEmptyLines(stripFences(text));
  return l[l.length - 1] ?? '';
}

// Longest run of consecutive list items anywhere in the response.
function longestListRun(text) {
  let max = 0;
  let run = 0;
  for (const line of lines(stripFences(text))) {
    if (LIST_ITEM.test(line)) {
      run += 1;
      if (run > max) max = run;
    } else if (line.trim() !== '') {
      run = 0;
    }
  }
  return max;
}

export const CHECKS = {
  'no-preamble': (text) => {
    const first = firstLine(text);
    const hit = OPENERS.find((re) => re.test(first));
    return { pass: !hit, detail: hit ? `서두 위반: "${first}"` : '' };
  },

  'no-closer': (text) => {
    const last = lastLine(text);
    const hit = CLOSERS.find((re) => re.test(last));
    return { pass: !hit, detail: hit ? `맺음말 위반: "${last}"` : '' };
  },

  'numbered-steps': (text) => {
    const pass = /^\s*1[.)]\s+\S/m.test(stripFences(text));
    return { pass, detail: pass ? '' : '번호 목록 없음' };
  },

  'list-cap-5': (text) => {
    const run = longestListRun(text);
    return { pass: run <= 5, detail: run <= 5 ? '' : `목록 항목 ${run}개 (상한 5)` };
  },

  'flat-error': (text) => {
    const hit = PANIC.find((re) => re.test(text));
    return { pass: !hit, detail: hit ? `감탄사·완충 표현 사용: ${hit}` : '' };
  },

  'next-action': (text) => {
    const last = lastLine(text);
    const pass = /^(다음|Next)\s*:/.test(last) || /`[^`]+`/.test(last) || /\?$/.test(last);
    return { pass, detail: pass ? '' : `마지막 줄에 next action 없음: "${last}"` };
  },

  'restate-state': (text) => {
    const pass = /\d+\s*(단계|개)\s*중\s*\d+|\d+\s*\/\s*\d+|\d+개 (통과|완료|실패)/.test(text);
    return { pass, detail: pass ? '' : '현재 상태 재진술 없음' };
  },

  'concrete-estimate': (text) => {
    const pass = /\d+\s*(분|시간|일|주)|반나절|하루|이틀/.test(text);
    return { pass, detail: pass ? '' : '구체적 시간 추정 없음' };
  },

  'visible-win': (text) => {
    const pass = /(된다|됩니다|완료|통과|작동|기록됨|추가됨|수정됨)/.test(text);
    return { pass, detail: pass ? '' : '완료된 결과가 드러나지 않음' };
  },

  'term-gloss': (text) => {
    const pass = /[A-Za-z][A-Za-z0-9_-]*\([^)]{4,}\)/.test(stripFences(text));
    return { pass, detail: pass ? '' : '실제 용어 괄호 병기 없음' };
  },

  'one-question': (text) => {
    const count = (stripFences(text).match(/\?/g) || []).length;
    return { pass: count === 1, detail: count === 1 ? '' : `질문 ${count}개 (정확히 1개여야 함)` };
  },

  'destructive-guarded': (text) => {
    const risky = DESTRUCTIVE.some((re) => re.test(text));
    if (!risky) return { pass: true, detail: '' };
    const guarded = GUARDS.some((re) => re.test(text));
    return { pass: guarded, detail: guarded ? '' : '파괴적 명령에 확인·미리보기 안내가 없음' };
  },

  // Long-form requests are a documented exception: length itself must not be penalized.
  'allows-long-form': (text) => {
    const pass = nonEmptyLines(text).length >= 5;
    return { pass, detail: pass ? '' : '설명 요청인데 응답이 너무 짧음' };
  },
};

export const CHECK_NAMES = Object.freeze(Object.keys(CHECKS));

// Run one case's checks against a response. Returns { id, pass, failures[] }.
export function gradeCase(testCase, responseText) {
  const failures = [];
  for (const name of testCase.checks || []) {
    const fn = CHECKS[name];
    if (!fn) {
      failures.push({ check: name, detail: '알 수 없는 check 이름' });
      continue;
    }
    const { pass, detail } = fn(responseText);
    if (!pass) failures.push({ check: name, detail });
  }
  return { id: testCase.id, pass: failures.length === 0, failures };
}

export function gradeAll(cases, responses) {
  return cases.map((c) => {
    const text = responses[c.id];
    if (typeof text !== 'string') {
      return { id: c.id, pass: false, failures: [{ check: '(응답 없음)', detail: '해당 케이스의 응답이 없음' }] };
    }
    return gradeCase(c, text);
  });
}
