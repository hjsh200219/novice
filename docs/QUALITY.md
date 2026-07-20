# QUALITY

## Health Stack (검사 명령 SSOT)
| 목적 | 명령 | 비고 |
|---|---|---|
| 전체 테스트 | `npm test` | unit + integration (149) |
| 단위 | `npm run test:unit` | |
| 통합 | `npm run test:integration` | safety corpus·mutation·latency 벤치 포함 |
| 문서-코드 일치 | `npm run verify-docs` | AGENTS.md 참조 경로·수치 검증 (pretest에 연결) |
| 플러그인 매니페스트 | `claude plugins validate .` | plugin.json + marketplace.json |
| latency 예산 | `NOVICE_BENCH_ITERS=1000 npm run test:integration` | p95: UserPromptSubmit ≤300ms, PreToolUse ≤250ms |

- lint/type/build은 이 프로젝트에 없음(zero-dep, node:test만). 레이어 강제는 `docs/design-docs/layer-rules.md` + `verify-docs`로 대체.
- 상태 프로토콜: 작업 결과는 `DONE` | `DONE_WITH_CONCERNS` | `BLOCKED` | `NEEDS_CONTEXT` 중 하나로 보고.

## 품질 게이트 (핵심)
- **TDD**: 새 기능/변경은 실패 테스트 먼저 (Red→Green→Refactor). 안전 규칙은 corpus + mutation으로 검증.
- **안전 hook fail-closed / 학습 hook fail-open** 유지.
- **시크릿 원문 미저장** (스캔은 메모리, 로그·state·metric 금지).
- **zero external dependency** — npm 패키지 추가 금지.
- 자세한 구현 전 체크리스트: [harness/harness-setup.md](./harness/harness-setup.md).
