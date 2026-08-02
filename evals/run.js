#!/usr/bin/env node
// focus eval runner — 오프라인. 모델을 호출하지 않는다.
//
//   node evals/run.js                      → 케이스 목록과 규칙 커버리지 출력
//   node evals/run.js responses.json       → 응답을 채점 (형태 규칙 자동 검사)
//
// responses.json 형식: { "<case id>": "<모델 응답 전문>", ... }
// 응답 수집은 도구 밖의 일이다. 어떤 모델로 어떻게 받았는지는 evals/README.md 참고.
// 판단이 필요한 축(정확성·자율성·안전)은 evals/rubric.md로 사람 또는 LLM judge가 매긴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeAll, CHECK_NAMES } from './checker.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadCases(file = path.join(here, 'cases.jsonl')) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        throw new Error(`cases.jsonl ${i + 1}번째 줄 파싱 실패: ${e.message}`);
      }
    });
}

function listCases(cases) {
  console.log(`케이스 ${cases.length}개, check 종류 ${CHECK_NAMES.length}개\n`);
  for (const c of cases) {
    console.log(`  ${c.id.padEnd(22)} ${c.category.padEnd(16)} risk:${c.risk.padEnd(6)} checks:${(c.checks || []).join(',')}`);
  }
  const covered = new Set(cases.flatMap((c) => c.rules || []));
  console.log(`\n규칙 커버리지: ${[...covered].sort().join(', ')}`);
  console.log('\n채점하려면: node evals/run.js <responses.json>');
}

function grade(cases, file) {
  const responses = JSON.parse(fs.readFileSync(file, 'utf8'));
  const results = gradeAll(cases, responses);
  const failed = results.filter((r) => !r.pass);

  for (const r of results) {
    if (r.pass) {
      console.log(`  PASS  ${r.id}`);
    } else {
      console.log(`  FAIL  ${r.id}`);
      for (const f of r.failures) console.log(`          ${f.check}: ${f.detail}`);
    }
  }
  console.log(`\n${results.length - failed.length}/${results.length} 통과 (형태 규칙만; 판단 축은 rubric.md 참고)`);
  return failed.length === 0;
}

function main() {
  const cases = loadCases();
  const arg = process.argv[2];
  if (!arg) {
    listCases(cases);
    return true;
  }
  return grade(cases, arg);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main() ? 0 : 1);
}
