---
created: 2026-07-20T19:00:00+09:00
project: novice
summary: novice 플러그인 구현 완료 (PRD rev 11) + 하네스 셋업/GC 완료 — 테스트 149/149, 성숙도 L4(76.75), 설치·활성화됨
---

## Session Digest
novice 플러그인을 PRD rev 8→11로 전 범위 구현하고 marketplace 등록·실제 설치까지 마쳤다. 이후 하네스 엔지니어링 셋업(AGENTS.md 맵·ARCHITECTURE·docs/harness·verify-docs)과 GC(3-에이전트 감사 + 회의적 채점)를 수행했다. rev 8→11 주요 변경: Level 2 fade 1→3, novice mute(교차 세션·프로젝트 스코프), MCP·Chrome capability 라우터(정적 allowlist + 런타임 등록·명시 동의), CLI Tier 2 명시 동의, plaintext credential 정책(vercel 고지형/gh·supabase 중단형), latency 벤치·hook 순서 실측, plugin.json hooks 키 제거(중복 로드 버그 수정).

## Progress
- 완료: PRD rev 11 전 범위 구현, 테스트 149/149 (unit 11 + integration 4), 외부 dependency 0
- 완료: marketplace 등록(.claude-plugin/marketplace.json), user scope 설치·활성화(novice@novice ✔ enabled)
- 완료: 하네스 셋업(AGENTS.md 51줄 맵, ARCHITECTURE.md, docs/harness 5종, verify-docs.mjs pretest 연결, permissions.deny)
- 완료: 하네스 GC — 문서 신선도 96%, 아키텍처 위반 0, 성숙도 L4(76.75), P8만 통과선 미달
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E(계정), MCP/clear/compact 실측 payload(headless 불가)

## Next Steps
1. 새 세션에서 실사용 스모크 테스트 (`/plugin` → novice enabled, `/novice:mode`, 용어 병기, 안전 게이트)
2. P8 gap: zero-dep node:test CI(GitHub Actions) — 이번 GC에서 추가됨. 실제 push CI 동작 확인
3. product beta 준비 (concierge n≥5, moderated n≥20)
4. (선택) `/sh:harness-setup --infra`로 coverage/logger/husky — zero-dep 벗어나므로 명시 옵트인만

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
- 코드: scripts/(hook 10 + lib 8 + bootstrap-engine + verify-docs), config/(5 JSON + manifest 3), hooks/hooks.json
- 문서: AGENTS.md, ARCHITECTURE.md, CLAUDE.md(@AGENTS.md), README.md(한/영), docs/(PRD rev11, harness 5, QUALITY, design-docs 2, tech-debt), .claude-project/(HANDOFF, memory)
- 플러그인: .claude-plugin/(plugin.json, marketplace.json), .claude/settings.json(permissions.deny)
