# 레이어 종속성 규칙

ARCHITECTURE.md의 레이어 구조를 강제하는 규칙. ESLint는 zero-dep 원칙상 미채택 —
대신 이 문서 + `scripts/verify-docs.mjs`의 정적 검사로 강제한다.

## 허용 import 방향
```
config/*.json (데이터)  ← scripts/lib/*.js  ← scripts/*.js (hook)
```
- `scripts/lib/`(L2)는 **node 내장 + 같은 lib 디렉토리만** import한다.
- `scripts/*.js`(L3 hook)는 `./lib/*` + node 내장을 import한다.
- config는 코드가 아니며 코드를 참조하지 않는다.

## 금지 패턴 (verify-docs가 검사)
- ❌ `scripts/lib/*.js`가 상위 hook 핸들러(`../post-tool-*`, `../pre-tool-use` 등)를 import — **역방향 금지**.
- ❌ `scripts/lib/*.js`가 외부 npm 패키지를 import — **zero-dep 위반**.
- ❌ hook 핸들러가 다른 hook 핸들러를 직접 import (공유 로직은 lib로).

## 에러 메시지 가이드 (에이전트용)
- "lib(L2) → hook(L3) import 금지. 공유 로직은 `scripts/lib/`의 순수 모듈로 추출하세요."
- "외부 패키지 import 감지. 이 프로젝트는 zero external dependency입니다. node 내장으로 해결하세요."

## 검증
`npm run verify-docs` — 위 금지 패턴을 정적으로 검사하고, AGENTS.md 참조 경로·수치의 실존/일치를 확인한다.
