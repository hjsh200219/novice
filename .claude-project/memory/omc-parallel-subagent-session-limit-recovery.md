---
name: omc-parallel-subagent-session-limit-recovery
description: 병렬 OMC executor subagent가 session usage limit에 걸리면 부분 산출물 회수 후 인라인 전환이 유효
type: feedback
created: 2026-07-20
---

병렬로 띄운 OMC executor subagent들이 실행 도중 **session usage limit**에 걸려 중단될 때, 처음부터 다시 돌리지 말고 이미 나온 **부분 산출물을 회수해서 그대로 채택**하고, 남은 작업은 메인 세션에서 **인라인으로 이어서** 처리하는 방식이 실제로 유효했다(novice 구현 iteration 1: executor 4개가 리셋 시각 직전 중단, capsule.js·session-start.js·user-prompt-submit.js·grammar.js·post-tool-use.js 부분 산출물이 고품질이라 유지, 나머지는 인라인 구현 → 전 스토리 완료).

**Why:** 병렬 subagent의 부분 산출물도 품질이 충분히 높을 수 있어 버리면 낭비다. 재시작은 산출물을 날리고 같은 limit에 또 걸릴 위험이 있다. limit 리셋을 기다리는 것보다 인라인 전환이 대개 빠르다.
**How to apply:** 병렬 subagent가 limit로 중단되면 (1) 각 subagent가 남긴 부분 결과를 먼저 점검·품질 확인 후 채택, (2) 미완 부분만 메인 세션에서 인라인으로 완결, (3) 재시작은 부분 산출물이 쓸 수 없을 때만. 완료 전 부분 산출물에 placeholder/미구현 분기가 없는지 검사한다.
