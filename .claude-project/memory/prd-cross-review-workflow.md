---
name: prd-cross-review-workflow
description: Novice 플러그인 PRD는 Codex와 Claude 교차 검토로 다듬으며, Claude의 역할은 공식 문서 사실 검증
type: project
created: 2026-07-20
---

`/Users/hoshin/workspace/SHC/novice`는 비개발자 입문자용 Claude Code "novice" 플러그인 프로젝트다. 2026-07-20 기준 docs/PRD.md는 **revision 11**, status `implemented (MVP)` — 구현 완료, **npm test 149/149 green**, marketplace 등록·실제 설치까지 완료(novice@novice enabled). 구현은 단계 분할 없이 전체 일괄 개발(rev5). 외부설정은 secret 미취급 **2-tier CLI 부트스트랩**: Tier 1 검토 manifest(vercel/gh/supabase) 자동, Tier 2 그 외 CLI는 공식 근거+사용자 승인. rev9 plaintext 정책 provider별([[bootstrap-credential-policy-per-provider]]), rev10 Level2 fade 1→3·mute(교차세션)·MCP/Chrome capability 라우터·latency 벤치, rev11 MCP 런타임 등록+명시 동의 경로·CLI Tier2 동의. 하네스 셋업+GC 완료: 성숙도 **L4(76.75)**, zero-dep 유지(eslint/knip/husky 미채택, verify-docs + node 내장 coverage로 대체).

작업 방식: PRD는 Codex와 Claude의 **교차 검토(cross-review)**로 발전시킨다. 플랫폼 사실 검증 4라운드 끝에 판정 기준이 확정됨: 문서 인용(1차, 오류) → SDK 타입(3차, snapshot이 runtime보다 낡아 오판) → **설치 runtime 바이너리 grep(4차, 확정)**. rev7의 codex 플랫폼 주장(PostToolBatch·expansion block·범용 updatedToolOutput)은 전부 runtime 2.1.215에서 사실로 확인됨. 상세: [[claude-code-plugin-platform-facts]].

**Why:** 이 프로젝트의 품질은 두 모델의 관점 차이에서 나온다. Claude를 "또 하나의 초안 작성자"로만 쓰면 교차 검토의 이점이 사라진다. Claude의 담당 축은 사실 검증이다.
**How to apply:** PRD/설계를 수정할 때, 플랫폼 동작·필드·한도를 주장하려면 기억이나 초안이 아니라 공식 문서로 검증한 뒤 반영한다. Codex 산출물의 플랫폼 관련 단언은 특히 대조 검증한다. 승인 상태·revision은 시간에 따라 바뀌므로 작업 전 docs/PRD.md frontmatter로 현재 값을 재확인한다.
