---
name: prd-cross-review-workflow
description: Novice 플러그인 PRD는 Codex와 Claude 교차 검토로 다듬으며, Claude의 역할은 공식 문서 사실 검증
type: project
created: 2026-07-20
---

`/Users/hoshin/workspace/SHC/novice`는 비개발자 입문자용 Claude Code "novice" 플러그인 프로젝트다. 2026-07-20 기준 docs/PRD.md만 있는 문서 단계이며, PRD는 revision 3, status는 여전히 `pending approval`, 구현 미시작.

작업 방식: PRD는 Codex와 Claude의 **교차 검토(cross-review)**로 발전시킨다. 이 흐름에서 Claude가 더한 고유 가치는 **공식 Claude Code 문서 대조를 통한 플랫폼 사실 검증** — Codex가 단언한 잘못된 필드명 등을 잡아내 revision 3을 정정했다. 검증된 사실은 [[claude-code-plugin-platform-facts]]에 정리돼 있다.

**Why:** 이 프로젝트의 품질은 두 모델의 관점 차이에서 나온다. Claude를 "또 하나의 초안 작성자"로만 쓰면 교차 검토의 이점이 사라진다. Claude의 담당 축은 사실 검증이다.
**How to apply:** PRD/설계를 수정할 때, 플랫폼 동작·필드·한도를 주장하려면 기억이나 초안이 아니라 공식 문서로 검증한 뒤 반영한다. Codex 산출물의 플랫폼 관련 단언은 특히 대조 검증한다. 승인 상태·revision은 시간에 따라 바뀌므로 작업 전 docs/PRD.md frontmatter로 현재 값을 재확인한다.
