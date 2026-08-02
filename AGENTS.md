# novice — 에이전트 진입 맵

비개발자 입문자용 Claude Code 학습 동반자 플러그인. 실제 개발 용어 보존 + 안전 게이트 +
외부 서비스 CLI 부트스트랩. 제품 스펙 SSOT는 [docs/PRD.md](./docs/PRD.md) (revision 13).

> 이 문서는 handbook이 아니라 **map**이다. 상세는 각 링크의 하위 문서에 있다.

## 세션 시작 시 필수
- 작업 전 **반드시** [.claude-project/HANDOFF.md](./.claude-project/HANDOFF.md)를 읽어 이전 세션 맥락 파악.
- 모든 답변은 한국어 (코드·커밋 메시지·에러 원문 인용은 예외).

## 기술 스택 (불변)
- Node.js ESM (`"type":"module"`), Node >= 18, **외부 dependency 0** — npm 패키지 추가 금지.
- 테스트: `node:test`. `npm test` = unit + integration (현재 195개). 부분: `npm run test:unit` / `test:integration`.
  `npm run evals` = focus 응답 형태 eval 코퍼스(오프라인, 모델 호출 없음) — [evals/README.md](./evals/README.md).
- 릴리스 (이 프로젝트 규칙): 버전은 `.claude-plugin/plugin.json` + `package.json`(npm `claude-novice`) **동기 bump**. **주요 버전(minor 이상) bump를 push할 때 README `## Release Notes`(한/영)에 항목을 추가**하고 bump와 같은 커밋으로 묶은 뒤, push 후 `npm publish`(prepublishOnly가 전체 테스트 실행)한다.
  publish는 **에이전트가 직접** 수행한다 — `.env`의 bypass-2FA granular 토큰을 임시 npmrc에 넣고
  `npm publish --userconfig=<임시파일>` 후 임시파일 삭제(값이 채팅·로그에 안 남는 경로).
  **`npm login` 금지** — `~/.npmrc`의 granular 토큰을 웹 세션 토큰으로 덮어써 E403이 난다.
  상세: [.claude-project/memory/npm-publish-flow.md](./.claude-project/memory/npm-publish-flow.md).

## 아키텍처 한 줄
config(데이터) ← lib(순수) ← hook 핸들러. 상세: [ARCHITECTURE.md](./ARCHITECTURE.md), 레이어 규칙: [docs/design-docs/layer-rules.md](./docs/design-docs/layer-rules.md).

## Critical Constraints (인라인 유지)
1. **안전 hook은 최소 deny-only 코어** — pre-tool-use는 긍정 탐지된 파괴 비가역 명령(`rm -rf ~`, protected branch force-push, `dd`/`mkfs` 등)과 노출된 시크릿 값만 deny한다. **ask 티어 없음**: 파싱 불가·모호한 명령은 의견 없이 CC 네이티브 권한에 위임(false-prompt 방지). JSON 오류·상한초과·예외만 fail-closed deny(exit 2). 플랫폼 timeout 한계로 절대 보장은 아님. 예외: `permission_mode === 'bypassPermissions'`면 게이트 완전 stand down(즉시 allow) — 사용자가 전 리스크를 인수한 모드이므로 파괴적 명령도 통과.
2. **학습 hook은 fail-open** — 오류 시 조용히 exit 0, 사용자 작업 차단 금지.
3. **credential 값 미취급** — 요청·저장·전달·자동입력 금지. audit엔 service id·revision·step·exit status만.
4. **state는 `CLAUDE_PLUGIN_DATA`에만** — `scripts/lib/state.js` 경유. 리포 트리에 상태 파일 금지.
5. **안전 게이트는 `novice_enabled`와 무관** — 플러그인 활성 시 항상 동작.
6. **focus는 level과 별개 다이얼** — `novice off`에서도 살아 있는 게 의도된 설계다. 두 capsule은
   `NOVICE_STATE`/`NOVICE_FOCUS`로 네임스페이스가 갈리고 각자 tombstone을 갖는다. 충돌 시 focus가
   이기되 **용어 괄호 병기는 유지**(인라인이지 서론이 아님). off를 focus에 전파하자는 제안 금지.

## LLM 코딩 행동 원칙

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

Layer note: These four principles are the behavioral/judgment layer. They complement — not duplicate — the tool-enforced invariants (layer-rules, verify-docs). Tools catch mechanical violations after code exists; these guide the decisions tools cannot check.

1. Think Before Coding — Don't assume. Don't hide confusion. Surface tradeoffs. State assumptions explicitly; if multiple interpretations exist, present them; if simpler approach exists, say so; if unclear, stop and ask.
2. Simplicity First — Minimum code that solves the problem. No speculative features, no single-use abstractions, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite it.
3. Surgical Changes — Touch only what you must. Don't improve adjacent code. Match existing style. Mention unrelated dead code but don't delete it. Remove only imports/vars/functions YOUR changes made unused.
4. Goal-Driven Execution — Transform tasks into verifiable goals (write failing test first, then make it pass). For multi-step tasks, state a plan with verify steps. Loop independently until criteria met.

## 지도 (map)
| 영역 | 문서 |
|---|---|
| 제품 스펙 (SSOT) | [docs/PRD.md](./docs/PRD.md) |
| 아키텍처·레이어 | [ARCHITECTURE.md](./ARCHITECTURE.md), [docs/design-docs/layer-rules.md](./docs/design-docs/layer-rules.md) |
| 품질·검증 명령 | [docs/QUALITY.md](./docs/QUALITY.md) |
| 구현 전 체크리스트 | [docs/harness/harness-setup.md](./docs/harness/harness-setup.md) |
| 하네스(원칙·성숙도·개선) | [docs/harness/](./docs/harness/) |
| 기술 부채 | [docs/exec-plans/tech-debt-tracker.md](./docs/exec-plans/tech-debt-tracker.md) |
| 운영 원칙 | [docs/design-docs/core-beliefs.md](./docs/design-docs/core-beliefs.md) |
| 위협 모델·비보증 | [README.md](./README.md) 안전 게이트 절, [docs/PRD.md](./docs/PRD.md) §4.5 |
| 사용자 명령 | `/novice`(front door), `/novice:mode 1\|2\|3\|off`, `/novice:focus on\|off`, `novice mute/unmute/reset <용어>` — [skills/novice/SKILL.md](./skills/novice/SKILL.md), [skills/mode/SKILL.md](./skills/mode/SKILL.md), [skills/focus/SKILL.md](./skills/focus/SKILL.md) |
| focus eval 하네스 | [evals/README.md](./evals/README.md) |
| 외부 서비스 부트스트랩 | [skills/setup-service/SKILL.md](./skills/setup-service/SKILL.md) |
