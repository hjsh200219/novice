---
name: novice-safety-minimalism
description: 사용자 확정 설계 — novice 안전 게이트는 deny-only 최소 코어, ask 티어 금지, 애매하면 CC 네이티브 위임
type: feedback
created: 2026-07-21
---

2026-07-21 사용자 결정: "safety가 이 플러그인에 과하다" → 옵션 A(완전 제거)/B(최소 코어)/C(보정)
중 **B 확정**. 게이트는 긍정 탐지된 파괴 비가역 작업과 노출된 시크릿 값만 `deny`하고,
확인 질문(ask) 티어는 두지 않는다. 파싱 불가·모호·staging/dev 대상·스캔 불가는 판정 없이
Claude Code 네이티브 권한 프롬프트에 위임한다.

**Why:** benign 명령(`find|sort`, `npm build && test`)마다 뜨던 false-prompt가 alarm fatigue를
만들어 안전 역효과. 사용자 승인 UX는 플러그인 자체 질문이 아니라 CC 네이티브 권한 규칙을
따라야 한다는 피드백이 반복됨 (bypassPermissions 논의에서도 동일 취지).
**How to apply:** 안전 게이트에 ask/확인 로직 재도입 제안 금지. 새 위협 추가 시에도
"확실한 파괴/시크릿 → deny, 그 외 → null(위임)" 이분법 유지. config의 `delegate` 값이 이
의미를 담는다. 관련: [[safety-fixture-scan-self-block-gap]].
