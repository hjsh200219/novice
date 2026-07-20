# 하네스 원칙 (채점 기준 SSOT)

에이전트 우선 리포지터리의 12원칙 채점 기준 + Anthropic 하네스 원칙. `/sh:harness-gc`가 이 문서로 채점한다.

## 12원칙 (각 0~5점, 앵커 예시 포함)
| # | 원칙 | 0~1 (미흡) | 3 (보통) | 5 (우수) |
|---|---|---|---|---|
| P1 | 리포지터리 = 기록 시스템 | 결정·부채 미기록 | 일부 문서화 | HANDOFF·tech-debt·memory 최신 |
| P2 | 진입 문서 = map | 없음/장문 handbook | 존재하나 상세 혼재 | AGENTS.md ~100줄 링크 중심 |
| P3 | 아키텍처 기계적 강제 | 규칙 없음 | 문서만 | 문서 + verify-docs 자동 검사 |
| P4 | Search Before Building | 중복 유틸 산재 | 일부 재사용 | lib 레지스트리 참조 습관 |
| P5 | 작업은 상태로 끝난다 | 상태 없음 | 가끔 | 항상 DONE/BLOCKED 등 |
| P6 | 레이어 종속성 | 역방향 존재 | 문서화 | layer-rules + 검증 |
| P7 | dead code 관리 | 방치 | 수동 | knip 등 게이트 (본 프로젝트는 zero-dep로 수동) |
| P8 | 관측·자동화 | 없음 | 부분 | logger/CI/hook |
| P9 | 테스트 우선 | 사후 | 일부 TDD | 안전 corpus+mutation |
| P10 | 문서-코드 일치 | drift | 가끔 검증 | verify-docs 자동 |
| P11 | 시크릿·안전 | 노출 위험 | 부분 | permissions.deny + 스캔 |
| P12 | 정직성 | 과장 | 일부 | 미보장·부채 명시 |

## Anthropic 하네스 원칙
- **회의적 평가**: 평가자 에이전트는 "증명될 때까지 미흡" 관점으로 채점 (self-evaluation bias 상쇄).
- **하네스 단순화**: 모든 하네스 컴포넌트는 "모델이 스스로 못하는 것"에 대한 가정. 모델 개선 시 재검증해 불필요 복잡도 제거. (예: eslint 미도입 — 모델+테스트로 레이어 위반을 이미 잡음.)
- **Phase 독립 에이전트**: context reset > compaction. 깨끗한 추론 환경.
- **Sprint Contract**: 수정 전 평가자-수정자 간 기대 효과 사전 합의.
- **채점 앵커**: 위 표의 점수대별 예시로 채점 드리프트 방지.

## 본 프로젝트 특기
- zero-dep 원칙상 P7(knip)·P8(husky/coverage) 도구 미설치 — 감점 대신 "zero-dep 대체 수단(node:test, verify-docs)"으로 평가.
