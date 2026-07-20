# GC 실행 이력

`/sh:harness-gc` 실행 기록 + 성숙도 추이. (setup 시점 초기 생성 — 아직 GC 미실행.)

| 날짜 | 실행 | 성숙도 | 주요 조치 | 비고 |
|---|---|---|---|---|
| 2026-07-20 | harness-setup | L4 초입(추정) | AGENTS/ARCHITECTURE/docs 생성, CLAUDE.md→@AGENTS.md, permissions.deny, verify-docs | setup 기준선 |
| 2026-07-20 | harness-gc (full) | L4 (76.75) | dead export 제거, HANDOFF 갱신, verify-docs lib-registry 검사, node:test CI 신설 | baseline 정밀 채점. 문서 신선도 96%, 아키텍처 위반 0. P8(4) 통과선 미달 |

## 2026-07-20 (Run #1) — 정밀 채점 baseline
- 모드: full (3-에이전트 감사 + 회의적 채점; quality-scorer는 리포트 작성 후 session limit)
- 문서 신선도: 96%
- 아키텍처 준수율: ~97% (레이어 위반 0, 순환 0, 중복 3 저심각, dead export 1)
- 품질 등급: A-/B+
- 하네스 성숙도: L4 (76.75) — A: 8.25 / B: 8.00 / C: 9.00 / D: 5.00
- 약점 원칙: P8 (4, 🔴), P7 (6), P4·P5 (7)
- Knip strict: 미설치 (zero-dep by design)
- 발견 이슈: 즉시 수정 3 + 준자동 1 적용, 수동 검토 3
- 반복 드리프트: 없음
- 예방 스크립트: verify-docs에 lib-registry 검사 추가
- 하네스 메타 검증: SKIP (3회 미만)

> 다음: 주요 기능 추가 후 재실행. P8 잔여(coverage/logger)는 `--infra` 옵트인 시 재평가.
