---
created: 2026-07-20T19:30:00+09:00
project: novice
summary: novice 플러그인 구현+하네스+GC+후속조치 완료 (PRD rev 11) — 테스트 149/149, 성숙도 L4, 설치·활성화, 최신 커밋 f9ba85e
---

## Session Digest
novice 플러그인을 PRD rev 8→11로 전 범위 구현하고 marketplace 등록·실제 설치까지 마쳤다. 하네스 셋업(AGENTS 맵·ARCHITECTURE·docs/harness·verify-docs) + GC(3-에이전트 감사, 성숙도 L4/76.75) 후, GC 수동 검토 3건을 처리했다: pre-tool-use.js 472→54줄 thin hook화(분석은 scripts/lib/safety.js로 분리, 동작 무변경), zero-dep coverage(node 내장), husky/logger는 zero-dep·N/A로 불채택. rev 8→11 주요 변경: Level 2 fade 1→3, mute(교차 세션·프로젝트 스코프), MCP·Chrome capability 라우터(정적 allowlist + 런타임 등록·명시 동의), CLI Tier 2 동의, plaintext credential 정책(vercel 고지형/gh·supabase 중단형), latency 벤치·hook 순서 실측, plugin.json hooks 키 제거(중복 로드 버그).

## Progress
- 완료: PRD rev 11 전 범위 구현, 테스트 149/149 (unit 11 + integration 4), 외부 dependency 0
- 완료: marketplace 등록 + user scope 설치·활성화(novice@novice ✔ enabled)
- 완료: 하네스 셋업 + GC baseline(L4/76.75) + GC 수동 검토 3건 처리
- 완료: 안전 분석 scripts/lib/safety.js 분리(pre-tool-use 54줄), zero-dep coverage(line ~95%), zero-dep CI(.github/workflows/test.yml)
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E(계정), MCP/clear/compact 실측 payload(headless 불가)

## Next Steps
1. 새 세션에서 실사용 스모크 테스트 (`/plugin` → novice enabled, `/novice:mode`, 용어 병기, 안전 게이트)
2. GitHub Actions CI 실제 push 동작 확인 (첫 워크플로 run)
3. product beta 준비 (concierge n≥5, moderated n≥20)
4. (선택) 재-GC로 성숙도 재채점 — safety.js 분리·coverage·CI 반영으로 P7/P8 상승 예상

## Blockers
- 없음 (남은 항목은 사람·환경 필요, 기술 블록 아님)

## Watch Out
- **zero external dependency** 원칙 — eslint/knip/husky 도입 금지. 레이어 강제는 scripts/verify-docs.mjs.
- plugin.json에 `hooks` 키 넣지 말 것 (hooks/hooks.json 자동 로드 — 중복 로드 실패).
- userConfig 항목에 `title` 필수. marketplace name엔 슬래시 불가(설치는 `install novice`).
- mute=프로젝트 스코프(교차 세션), reset·용어 카운터=세션 스코프.
- MCP 허용 = 정적 allowlist(비어 있음) 또는 런타임 등록+명시 동의. 자동 설치 안 함, PreToolUse가 계속 가드.
- 안전 hook fail-closed / 학습 hook fail-open. credential 값 미취급. state는 CLAUDE_PLUGIN_DATA만.
- tests/fixtures의 토큰(ghp_/AKIA)은 전부 synthetic.

## Files Touched
- 코드: scripts/(hook 10 + lib 9[safety.js 포함] + bootstrap-engine + verify-docs.mjs), config/(5 JSON + manifest 3), hooks/hooks.json
- 문서: AGENTS.md, ARCHITECTURE.md, CLAUDE.md(@AGENTS.md), README.md(한/영), docs/(PRD rev11, harness 5, QUALITY, design-docs 2, tech-debt), .claude-project/(HANDOFF, memory 6)
- 플러그인/CI: .claude-plugin/(plugin.json, marketplace.json), .claude/settings.json, .github/workflows/test.yml
