---
name: zero-dep-harness-approach
description: zero external dependency 프로젝트의 하네스 — eslint/knip/husky 대신 node 내장으로 강제·검증
type: project
created: 2026-07-20
---

novice 플러그인은 **외부 dependency 0** 원칙(package.json deps/devDeps 전부 비어 있음)이다. 하네스 엔지니어링(setup/gc)에서 이 제약과 충돌하는 도구는 도입하지 않고 node 내장으로 대체했다.

- **레이어 강제**: ESLint `import/no-restricted-paths` 대신 `scripts/verify-docs.mjs`가 정적 검사 — lib(L2)는 node내장+같은lib만, hook(L3)은 node내장+`./lib/*`만 import (hook→hook·외부 import 차단). `pretest`에 연결돼 매 테스트 전 실행.
- **coverage**: c8/vitest 대신 `node --test --experimental-test-coverage` (`npm run test:coverage`, line ~95%).
- **CI**: `.github/workflows/test.yml`이 `npm test`만 실행 (npm install 스텝 없음 — deps 0).
- **dead code**: knip 미설치. verify-docs가 lib 레지스트리(ARCHITECTURE 모듈맵 ↔ 실제 scripts/lib/*.js) 일치 검사.
- **문서-코드 일치**: verify-docs가 AGENTS 링크·CLAUDE.md=@AGENTS.md·plugin.json hooks-키 금지·userConfig title·terms수·manifest·harness 5종 검증.

**미채택 (정직 표기, 부채 아님)**: husky/lint-staged(외부 의존성), 구조화 logger/withErrorHandler(API·프론트 없는 hook 플러그인이라 N/A). pre-commit 게이트 역할은 CI + pretest로 대체.

안전 분석은 `scripts/lib/safety.js`에 분리하고 `scripts/pre-tool-use.js`는 thin hook(54줄)이다. safety corpus·mutation 테스트가 pre-tool-use를 자식 프로세스로 검증하므로 리팩터해도 동작 회귀를 잡는다.

**Why:** zero-dep는 이 플러그인의 핵심 제약이자 신뢰 근거다. 하네스 성숙도를 올린다고 외부 도구를 넣으면 제약 자체를 깨서 본말전도. "모델이 스스로 못하는 것"만 하네스로 인코딩하고 나머지는 node 내장으로.
**How to apply:** 품질/자동화 개선 시 외부 패키지 추가 전에 node 내장(`node:test` coverage, verify-docs 정적 검사, GitHub Actions)으로 되는지 먼저 확인. 정말 필요하면 `/sh:harness-setup --infra` 명시 옵트인. [[claude-code-plugin-platform-facts]] · [[prd-cross-review-workflow]].
