---
created: 2026-07-20T11:00:00+09:00
project: novice
summary: PRD revision 8 확정 — rev7 플랫폼 주장 runtime 바이너리로 전부 검증 + 2-tier 부트스트랩 절충(사용자 결정). 구현 승인 대기
---

## Session Digest

codex가 rev6를 재리뷰해 revision 7 작성 (allowlisted bootstrap manifest, 유한 안전 문법, 2.1.215 계약, PostToolBatch·expansion block·범용 updatedToolOutput 재도입). Claude가 설치 runtime 바이너리(2.1.215)를 직접 grep해 검증한 결과 **codex의 플랫폼 주장 전부 사실로 확인** — rev5에서 SDK 타입(v0.2.117)으로 "오류"라 판정했던 것이 오히려 낡은 snapshot 기반 오판이었음. 판정 기준 확정: 설치 runtime 바이너리 > docs > SDK snapshot. codex의 allowlist 3개 제한이 사용자의 "개수 제한 없음" 지시와 충돌했는데, 사용자가 절충안을 선택해 revision 8로 확정: 2-tier 부트스트랩(Tier 1 manifest 자동 / Tier 2 근거 제시 + 승인 후 진행). 구현은 승인 대기.

## Progress

- [DONE] PRD revision 7 리뷰 — codex 플랫폼 주장 4건 runtime 바이너리로 전부 검증 (미커밋)
  - `PostToolBatch` 실존: batch 전체 resolve 후 정확히 1회 실행 (바이너리 doc string이 PRD 서술과 일치)
  - `UserPromptExpansion` block 가능 + 입력 필드(expansion_type/command_name/command_args/command_source/prompt) 일치
  - `updatedToolOutput` 전체 tool 범용, `updatedMCPToolOutput`은 legacy MCP 전용
  - `disable-model-invocation`·`stop_hook_active` 실존
- [DONE] rev7의 설계 개선 확인: 유한 shell grammar(Bash·PowerShell 단일 command+argv), target 분류(dev/staging/prod/unknown), bootstrap manifest contract, event 파일 + PostToolBatch 집계, 입력 상한(64KiB/1MiB/5MiB), fallback 비율 지표
- [DONE] memory를 runtime 판정본으로 재작성 (rev5 SDK 판정은 오판이었음)
- [DONE] allowlist 충돌 해소 (rev8, 사용자 절충안 채택) — **2-tier 부트스트랩**: Tier 1(검토 manifest vercel/gh/supabase) 표준 승인 자동, Tier 2(그 외 모든 CLI) ad-hoc manifest(공식 근거 URL·coordinate·argv)를 화면 제시 + 사용자 승인 시 동일 engine 진행, 근거 미확인 시 guided manual. CLI 개수 제한 없음 복원.
- [TODO] 구현 착수 (전체 일괄 개발) — 사용자 승인 필요

## Next Steps

1. **사용자 실행 승인** — 단일 구현 pass 착수 전제
2. **착수 직후: 완료 기준 A** — 2.1.215에서 hook payload fixture 캡처 (UserPromptExpansion 순서 포함)
3. **전체 일괄 구현** — hooks + config schema + bootstrap engine·manifest(2-tier) + skills + tests, 완료 기준 A~D 판정
4. **검증** — concierge test(n≥5) → moderated beta(n≥20)

## Blockers

- 구현 착수만 사용자 승인 대기.

## Watch Out

- **플랫폼 사실 판정은 설치 runtime 바이너리 grep으로** — 문서 인용(1차)·SDK 타입(3차) 모두 틀렸던 역사 있음. SDK snapshot은 runtime보다 낡는다. 검증 명령은 memory `claude-code-plugin-platform-facts` 참조.
- **rev5의 "expansion block 불가·PostToolBatch 없음" 경고는 OBSOLETE** — runtime 2.1.215에서 둘 다 실존 확인. rev7 설계(block 사용, PostToolBatch 집계)가 유효.
- **secret 미취급 원칙 유지 (rev6)** — env/secret 값 입력은 사용자 직접. 단 rev7이 경계를 정밀화: local scanner는 메모리 내 검사 가능, provider CLI 자체 credential store는 manifest 정책으로 검증.
- **output style 사용 금지, PreToolUse 강제 차단, 파괴 차단은 등재 패턴만 보증** — 기존 결정 유지.
- **최소 지원 버전 2.1.215 고정** — PostToolBatch·expansion block·updatedToolOutput은 이 버전 기준. 구버전 호환을 약속하지 말 것.

## Files Touched

- `docs/PRD.md` (revision 6 → 7(codex) → 8(2-tier 절충), 미커밋 — Claude 리뷰 통과)
- `.claude-project/memory/` (runtime 판정본으로 재작성)
- `.claude-project/HANDOFF.md` (본 파일)
