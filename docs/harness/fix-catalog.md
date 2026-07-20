# Fix 카탈로그 — 원칙×점수 구간별 개선 액션

`/sh:harness-gc`가 낮은 점수 원칙에 대해 참조하는 개선 액션 카탈로그.

| 원칙 | 낮을 때 증상 | 개선 액션 |
|---|---|---|
| P1 기록 | 결정·부채 미기록 | HANDOFF·tech-debt-tracker·memory 갱신 |
| P2 맵 | 진입 문서 장문 | AGENTS.md를 링크 중심 ~100줄로 압축, 상세는 docs/ 이동 |
| P3 강제 | 규칙 문서만 | `scripts/verify-docs.mjs`에 검사 항목 추가, pretest 연결 |
| P4 재사용 | 중복 유틸 | `scripts/lib/` 레지스트리 확인 후 통합 |
| P5 상태 | 상태 미보고 | 작업 종료 시 DONE/BLOCKED 등 명시 |
| P6 레이어 | 역방향 import | lib가 hook을 import하지 않도록 이동, layer-rules 갱신 |
| P7 dead code | 미사용 코드 | (zero-dep) verify-docs에 export 사용 검사 추가, 필요 시 `--infra`로 knip |
| P8 관측 | 로깅·CI 없음 | 필요 시 `/sh:harness-setup --infra` (gc.sh/coverage/husky) |
| P9 테스트 | 사후 테스트 | 실패 테스트 먼저, 안전 규칙은 corpus+mutation로 |
| P10 일치 | 문서 drift | verify-docs 실행, 수치·경로 갱신 |
| P11 안전 | 시크릿 노출 | permissions.deny 확장, secrets.js 패턴 보강 |
| P12 정직 | 과장 문구 | 미보장·부채를 문서에 명시 |

## 본 프로젝트 특기
- P7/P8 도구 설치는 zero-dep 원칙과 상충 → 기본은 node 내장 대체 수단 강화, 도구 설치는 명시적 `--infra` 옵트인만.
