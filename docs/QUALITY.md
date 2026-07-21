# QUALITY

## Health Stack (검사 명령 SSOT)
| 목적 | 명령 | 비고 |
|---|---|---|
| 전체 테스트 | `npm test` | unit + integration (157) |
| 단위 | `npm run test:unit` | |
| 통합 | `npm run test:integration` | safety corpus·mutation·latency 벤치 포함 |
| 커버리지 | `npm run test:coverage` | node 내장 `--experimental-test-coverage` (zero-dep). 현재 line ~95% |
| 문서-코드 일치 | `npm run verify-docs` | AGENTS.md 참조 경로·수치·레이어·lib 레지스트리 검증 (pretest에 연결) |
| 플러그인 매니페스트 | `claude plugins validate .` | plugin.json + marketplace.json |
| latency 예산 | `NOVICE_BENCH_ITERS=1000 npm run test:integration` | p95: UserPromptSubmit ≤300ms, PreToolUse ≤250ms |

- lint/type/build은 이 프로젝트에 없음(zero-dep, node:test만). 레이어 강제는 `docs/design-docs/layer-rules.md` + `verify-docs`로, 커버리지는 node 내장 `--experimental-test-coverage`로 대체(외부 c8/vitest 불필요).
- pre-commit 훅(husky)·구조화 logger·API withErrorHandler는 **미채택**: husky/lint-staged는 외부 의존성으로 zero-dep 위배, logger/withErrorHandler는 API 라우트·프론트가 없는 hook 플러그인엔 대상 없음. 커밋 전 게이트는 CI(`.github/workflows/test.yml`) + `pretest`(verify-docs)로 대체한다.
- 상태 프로토콜: 작업 결과는 `DONE` | `DONE_WITH_CONCERNS` | `BLOCKED` | `NEEDS_CONTEXT` 중 하나로 보고.

## 품질 게이트 (핵심)
- **TDD**: 새 기능/변경은 실패 테스트 먼저 (Red→Green→Refactor). 안전 규칙은 corpus + mutation으로 검증.
- **안전 hook fail-closed / 학습 hook fail-open** 유지.
- **시크릿 원문 미저장** (스캔은 메모리, 로그·state·metric 금지).
- **zero external dependency** — npm 패키지 추가 금지.
- 자세한 구현 전 체크리스트: [harness/harness-setup.md](./harness/harness-setup.md).
