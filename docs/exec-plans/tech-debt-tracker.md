# 기술 부채 추적

코드로 해결 불가하거나 의도적으로 남긴 항목. (코드 빈 구현은 현재 0.)

## 코드 불가 — 환경·사람 필요
| # | 항목 | 사유 | 해소 조건 |
|---|---|---|---|
| TD-1 | 실제 CLI 설치·로그인 E2E | 실 소프트웨어 설치 + 계정 필요 | 사용자 환경에서 vercel/gh/supabase 실행 |
| TD-2 | MCP destructive·SessionStart `clear`/`compact` payload 실측 | headless `claude -p`로 트리거 불가 | interactive 세션 캡처로 fixture `provenance` 교체 (현재 documented/derived) |
| TD-3 | product beta 지표 | telemetry 미수집, 사람 참가자 필요 | concierge n≥5 + moderated n≥20 |

## 의도적 결정 (부채 아님, 기록용)
- ESLint 레이어 강제 미채택 — zero-dep 원칙. `layer-rules.md` + `verify-docs`로 대체.
- 운영 인프라(gc.sh/knip/coverage/husky) 미설치 — zero-dep + node:test로 충분. 필요 시 `/sh:harness-setup --infra`.

## P1/P2 후보 (PRD §6)
- P1: 교차 세션 용어 학습(자동 fade 누적 — 단 명시적 mute는 이미 교차 세션), statusline nudge, 비용 preview.
- P2: spaced repetition, 오개념 추적.
