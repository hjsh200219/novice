---
created: 2026-07-20T15:16:00+09:00
project: novice
summary: novice 플러그인 전체 구현 완료 (PRD rev 9) — 테스트 123/123, 실측 2.1.215 검증, 커밋 ba4f137 push
---

## Session Digest
docs/PRD.md rev 8을 Ralph 루프로 전 범위 구현하고 rev 9로 갱신했다. 학습 seam(용어 스캐폴딩·mode capsule·fade 카운터), 안전 gate(Bash·PowerShell 유한 grammar·secret scan·target 분류), 관찰층(event 집계·출력 redaction), 2-tier bootstrap engine을 모두 만들었다. architect 리뷰 APPROVE, 실제 Claude Code 2.1.215에서 hook payload 캡처 + `--plugin-dir` live E2E까지 검증. 초반 병렬 executor agent 4개가 session limit으로 죽어 부분 산출물만 회수하고 나머지는 인라인 구현했다. 코드 커밋 ba4f137로 push 완료.

## Progress
- 완료: PRD rev 9 전 범위 구현 (완료 기준 A~D 충족)
- 완료: 테스트 123/123 (unit 8 + integration 3), 외부 dependency 0
- 완료: 실측 2.1.215 hook payload 캡처 fixture + `/novice:mode` live E2E
- 완료: blocking hook latency 실측 (UserPromptSubmit p95 39ms, PreToolUse p95 51ms)
- 완료: PowerShell 전용 grammar, mutation 하네스(위험 35건 → mutant 106개, 우회 0)
- 완료: 코드 커밋 ba4f137 origin/main push
- 미완: product beta 검증 (concierge n≥5, moderated n≥20 — 사람 참가자 필요)
- 미완: interactive 캡처 2건 (SessionStart clear/compact source, MCP destructive payload — headless 불가)

## Next Steps
1. interactive 세션에서 `/clear`·compact·MCP destructive payload 캡처해 documented fixture 2건을 실측으로 교체
2. product beta 준비 — concierge test(n≥5) 시나리오 설계, baseline Claude Code 관찰 프로토콜
3. marketplace 배포 준비 검토 (plugin.json 메타, 배포 채널)

## Blockers
- 없음 (beta는 사람 참가자가 필요할 뿐 기술 블록 아님)

## Watch Out
- plugin.json `userConfig` 각 항목에 `title` 필수 (2.1.215 스키마 — 없으면 플러그인 로드 실패, `claude plugins validate`로 확인)
- `PostToolBatch` payload는 `tool_calls[]` (문서 추정 `batch[]` 아님); `UserPromptExpansion.command_source`는 `"plugin"`
- contract fixture는 `provenance` 필드로 captured/derived/documented 구분 — documented 2건은 실측 교체 대상
- credential 정책: vercel은 고지형(파일 저장이 공식 기본), gh·supabase는 중단형(secure storage 전제) — manifest `abort_auto_login_on_plaintext`가 결정
- tests/fixtures·test의 토큰(ghp_/AKIA 등)은 전부 synthetic fixture — 실제 secret 아님

## Files Touched
- `.claude-plugin/plugin.json`, `hooks/hooks.json`, `package.json`, `README.md`, `CLAUDE.md`(신규)
- `scripts/` (9 hook handlers + `lib/` 6 모듈), `config/` (5 JSON + manifest 3)
- `skills/mode`, `skills/setup-service`
- `tests/` (unit 8 + integration 3 + fixtures + helpers), `docs/PRD.md` (rev 9)
