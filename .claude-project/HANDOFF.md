---
created: 2026-07-20T09:40:00+09:00
project: novice
summary: PRD revision 5 확정 (codex 적대적 리뷰 → SDK 타입 교차 판정 → 오류 교정 + 단일 구현 단계), 구현 승인 대기
---

## Session Digest

Codex 적대적 리뷰(revision 4)를 Claude가 SDK 타입 정의(`@anthropic-ai/claude-agent-sdk` v0.2.117 `sdk.d.ts`)로 교차 판정해 revision 5로 확정했다. codex 리뷰의 실질 개선(OFF tombstone, model-blind secret broker, Git candidate tree scan, Vercel 단일 MVP, 지표 방법론)은 유지하고, codex의 사실 오류 2건(`decision:block` 차단 — 실제로는 불가능, `PostToolBatch` — 존재하지 않는 hook)을 교정했다. 1차 검증의 필드명 오류(`command_input`/`expanded_prompt`)는 codex가 맞았음을 확인. 사용자 결정으로 Phase 0~3을 단일 구현 단계(완료 기준 A~D 체크리스트)로 통합했다. 구현은 승인 대기.

## Progress

- [DONE] PRD revision 5 확정 (미커밋)
  - `UserPromptExpansion` payload 확정: `expansion_type`/`command_name`/`command_args`/`command_source?`/`prompt` (SDK 타입 기준)
  - **expansion 차단 불가 확정** — invalid args는 state 미변경 + `additionalContext` 안내로 재설계
  - `PostToolBatch` 제거 — 반복 루프는 `PostToolUse`(성공)+`PostToolUseFailure`(실패) per-call + atomic single-writer
  - `PostToolUse` redaction은 `updatedMCPToolOutput`(MCP 전용)로 교정 — CLI stdout은 runner 정제만 가능
  - `defer` 의미 미확정 처리 — P0 미사용 결정
  - `Stop.last_assistant_message` optional 부재 처리 추가
  - Phase 0~3 → 단일 구현 단계 통합 (완료 기준 A 플랫폼 contract / B mode·용어 / C 안전 gate / D Vercel E2E + 검증 beta 분리)
  - 부록 A에 SDK 타입 정의 출처 행 추가
- [DONE] codex rev4의 유지된 개선: OFF tombstone, model-blind secret broker, Vercel 단일 MVP(Supabase·GitHub OAuth P1), Git candidate tree scan, 자연어 별칭 exact-match, within-subject beta 지표
- [DONE] memory 파일 3차 검증 결과로 재작성 (`claude-code-plugin-platform-facts`)
- [TODO] 구현 착수 (전체 일괄 개발, 완료 기준 A fixture 캡처 먼저) — 사용자 승인 필요

## Next Steps

1. **사용자 실행 승인** — 단일 구현 pass 착수 전제
2. **착수 직후: 완료 기준 A (플랫폼 contract fixture)** — 실제 설치 버전에서 `UserPromptExpansion` payload 캡처, `SessionStart(compact)` 재주입, output style 무변경, `${CLAUDE_PLUGIN_DATA}` 상태 생성 확인
3. **전체 일괄 구현** — hooks 전부 + config schema + `adapters/vercel` + `bin/novice-secret` + tests, 완료 기준 A~D 체크리스트로 판정
4. **검증** — concierge test(n≥5) → moderated beta(n≥20)

## Blockers

- 구현은 사용자 승인 대기. PRD는 문서로 확정됐으나 broker/adapter/hook contract 실측은 전부 남아 있음.

## Watch Out

- **LLM 문서 검증 단일 출처 금지** — 1차(claude)·2차(codex) 검증이 서로 다른 항목에서 틀렸음. 플랫폼 사실은 SDK 타입 정의(`sdk.d.ts`) 같은 기계 산출물로 판정할 것. 상세: memory `claude-code-plugin-platform-facts`.
- **expansion 차단 불가** — `UserPromptExpansion` 출력은 `additionalContext`뿐. invalid args 설계는 이 제약 위에 서 있음. 구현 시 block을 시도하지 말 것.
- **`PostToolBatch` 없음** — codex가 만든 가공 hook. 병렬 집계는 per-call + single-writer lock.
- **output style 사용 금지 결정됨** — `force-for-plugin`은 novice off와 양립 불가. 레벨 가변 내용은 hook capsule로만.
- **안전 게이트는 PreToolUse 강제 차단** (novice off 무관 always-on, plugin disable 시 소멸) — 텍스트 권고 구현 금지.
- **secret broker 경계** — secret은 model prompt·argv·stdout 통과 금지. keychain 부재 시 guided manual 강등. CLI 출력 redaction은 불가능하므로 runner가 출력을 정제해야 함.
- **MVP는 Vercel 단독** — Supabase·GitHub OAuth는 P1 (broker·adapter contract 재사용 전제, GitHub OAuth는 callback URL 1개 제약 ADR 필요).

## Files Touched

- `docs/PRD.md` (revision 4 → 5, 미커밋)
- `.claude-project/memory/claude-code-plugin-platform-facts.md` (3차 검증 결과로 재작성)
- `.claude-project/HANDOFF.md` (본 파일)
