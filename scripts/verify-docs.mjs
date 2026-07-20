#!/usr/bin/env node
// verify-docs: 문서-코드 일치 + 레이어 종속성 정적 검사.
// ESLint 대체(zero-dep 원칙). 실패 시 exit 1. pretest에 연결되어 매 테스트 전 실행된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

// 모든 import/export 지정자 수집 (static·side-effect·re-export·dynamic 전부).
function collectSpecifiers(src) {
  const specs = [];
  for (const re of [
    /(?:^|\n)\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/g, // import x from 'y'
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g, // import 'y' (side-effect)
    /(?:^|\n)\s*export\s[^;]*?from\s*['"]([^'"]+)['"]/g, // export … from 'y'
    /import\(\s*['"]([^'"]+)['"]\s*\)/g, // import('y') (dynamic)
  ]) {
    for (const m of src.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

// 1) AGENTS.md가 참조하는 상대 경로가 실존하는지 (http·앵커 제외, ./ 유무 무관).
const agents = read('AGENTS.md');
for (const m of agents.matchAll(/\]\((?!https?:)([^)]+)\)/g)) {
  const target = m[1].split('#')[0].replace(/^\.\//, '');
  if (target) ok(exists(target), `AGENTS.md가 참조하는 경로가 없음: ${target}`);
}

// 2) CLAUDE.md는 @AGENTS.md 참조여야 함 (SSOT 정규화).
ok(read('CLAUDE.md').trim() === '@AGENTS.md', 'CLAUDE.md는 "@AGENTS.md" 참조여야 함');

// 3) plugin.json은 hooks 키를 넣지 않는다 (중복 로드 실패 방지).
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
ok(!('hooks' in plugin), 'plugin.json에 hooks 키가 있으면 중복 로드 실패 — 제거하세요');
for (const [, v] of Object.entries(plugin.userConfig ?? {})) {
  ok(typeof v.title === 'string', 'userConfig 항목에 title 필수');
}

// 4a) 레이어 규칙: scripts/lib/*.js(L2)는 node 내장 또는 같은 lib만 import.
const libDir = path.join(root, 'scripts', 'lib');
for (const f of fs.readdirSync(libDir).filter((x) => x.endsWith('.js'))) {
  for (const spec of collectSpecifiers(fs.readFileSync(path.join(libDir, f), 'utf8'))) {
    const isNode = spec.startsWith('node:');
    // 같은 lib 디렉토리: "./name.js" (./ 이후에 추가 경로 구분자 없음).
    const isSameLib = spec.startsWith('./') && !spec.slice(2).includes('/');
    ok(isNode || isSameLib, `레이어 위반: scripts/lib/${f} 가 '${spec}' import (lib는 node 내장 또는 같은 lib만 허용)`);
  }
}

// 4b) 레이어 규칙: scripts/*.js(L3 hook)는 node 내장 또는 ./lib/*만 import (hook→hook 금지).
const scriptsDir = path.join(root, 'scripts');
for (const f of fs.readdirSync(scriptsDir).filter((x) => x.endsWith('.js'))) {
  for (const spec of collectSpecifiers(fs.readFileSync(path.join(scriptsDir, f), 'utf8'))) {
    const isNode = spec.startsWith('node:');
    const isLib = spec.startsWith('./lib/');
    ok(isNode || isLib, `레이어 위반: scripts/${f} 가 '${spec}' import (hook은 node 내장 또는 ./lib/*만 허용 — hook→hook·외부 금지)`);
  }
}

// 5) 문서 수치 일치: config/terms.json 용어 수 == 문서 표기(32).
const terms = JSON.parse(read('config/terms.json')).terms.length;
ok(terms === 32, `terms.json 용어 수 ${terms} != 문서 표기 32`);

// 6) bootstrap manifest 3종 실존 (service-capabilities 참조와 일치).
const caps = JSON.parse(read('config/service-capabilities.json'));
for (const svc of Object.values(caps.services ?? {})) {
  ok(exists(path.join('config', svc.manifest)), `manifest 없음: ${svc.manifest}`);
}

// 7) docs/harness 필수 5종 존재.
for (const f of ['principles.md', 'maturity-framework.md', 'fix-catalog.md', 'gc-history.md', 'harness-setup.md']) {
  ok(exists(path.join('docs', 'harness', f)), `docs/harness/${f} 누락`);
}

// 8) lib 레지스트리 일치: 실제 scripts/lib/*.js 모듈이 전부 ARCHITECTURE.md 모듈맵에 등재됐는지
//    (Search Before Building — 레지스트리 drift 방지). *.mjs·helper 제외.
const arch = read('ARCHITECTURE.md');
for (const f of fs.readdirSync(path.join(root, 'scripts', 'lib')).filter((x) => x.endsWith('.js'))) {
  const mod = f.replace(/\.js$/, '');
  ok(arch.includes(`\`${mod}.js\``), `ARCHITECTURE.md lib 모듈맵에 scripts/lib/${f} 누락 (레지스트리 drift)`);
}

if (errors.length) {
  console.error('verify-docs FAILED:\n' + errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log('verify-docs OK');
