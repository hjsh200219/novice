# novice — Claude Code 학습 동반자 플러그인

비개발자 입문자를 위한 3단계 학습 동반자 Claude Code 플러그인. 실제 개발 용어를 보존하면서 안전 게이트와 외부 서비스 CLI 부트스트랩을 제공한다. 제품 스펙의 SSOT는 `docs/PRD.md` (현재 revision 9).

## 세션 시작 시 필수
- 작업 시작 전 **반드시** `.claude-project/HANDOFF.md`를 Read로 읽는다. 이전 세션의 진행 상황·결정·다음 작업이 기록되어 있다.
- 모든 답변은 한국어로 작성한다 (코드·커밋 메시지·에러 원문 인용은 예외).

## 기술 스택
- Node.js ESM (`"type": "module"`), Node >= 18, **의존성 zero** — 외부 npm 패키지를 추가하지 않는다.
- 테스트는 `node:test` 내장 러너. `npm test`가 unit + integration 전체(현재 123개 통과)를 돌린다. 부분 실행은 `npm run test:unit`, `npm run test:integration`.

## 디렉터리
- `hooks/hooks.json` — 훅 wiring 매니페스트 (Claude Code가 읽는 훅 등록 파일).
- `scripts/` — 실제 훅 핸들러 구현체 (`pre-tool-use.js`, `post-tool-use.js`, `session-start.js`, `user-prompt-submit.js`, `bootstrap-engine.js` 등) + 공용 로직 `scripts/lib/`.
- `config/` — 동작의 SSOT JSON: `levels.json`, `safety-rules.json`, `service-capabilities.json`, `terms.json`, `bootstrap-manifests/`. 동작을 바꿀 때는 코드보다 이 JSON을 먼저 수정한다.
- `skills/` — `mode`, `setup-service`.
- `tests/` — `unit/`, `integration/`, `fixtures/`, `helpers/`.
- `docs/PRD.md` — 제품 요구사항 SSOT.

## 필수 규칙
1. **안전 hook은 fail-closed 지향** — pre-tool-use 등 안전 관련 훅은 지원 문법 안에서 위험·모호·입력 상한 초과를 deny(exit 2)한다. 단, 플랫폼이 훅 timeout·강제 종료를 non-blocking으로 처리하는 한계 때문에 절대적 fail-closed는 보장하지 않는다.
2. **학습 hook은 fail-open** — 용어 주입·설명 등 학습 관련 훅은 오류가 나면 조용히 건너뛰고(exit 0) 사용자 작업을 막지 않는다.
3. **credential 값 미취급** — 부트스트랩 audit state에는 service ID·manifest revision·완료 단계·exit status만 저장한다. argv 원문·tool output·credential 값은 저장하거나 로깅하지 않는다. provider CLI 자체 credential store는 plugin data와 별개다.
4. **state는 `CLAUDE_PLUGIN_DATA`에만** — 세션/영속 상태는 `scripts/lib/state.js`를 통해 `CLAUDE_PLUGIN_DATA` 아래에만 기록한다. 리포 트리에 상태 파일을 만들지 않는다.
5. 안전 게이트는 `novice_enabled`(userConfig) 값과 무관하게 플러그인 활성 시 항상 동작한다.
