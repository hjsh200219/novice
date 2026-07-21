---
created: 2026-07-21T09:35:00+09:00
project: novice
summary: README 설치 절 한/영 전면 재구성 — marketplace 외 전체 설치 채널(settings.json 자동 설치·세션 로드·CI 시드) 문서화
---

## Session Digest
사용자 질문 "marketplace/npm 외 설치 방법?" → Claude Code 공식 문서 조사로 설치 채널 전수 확인:
(1) marketplace add의 git URL(`.git`, `#ref`)·로컬 경로 변형, (2) 프로젝트 `.claude/settings.json`의
`extraKnownMarketplaces`+`enabledPlugins` 팀 자동 설치, (3) `--plugin-dir`/`--plugin-url` 세션 한정 로드,
(4) `CLAUDE_CODE_PLUGIN_CACHE_DIR`/`CLAUDE_CODE_PLUGIN_SEED_DIR` 컨테이너·CI 시드,
(5) `~/.claude/skills/` 수동 복사는 hook 미로드로 novice에 부적합(안전 게이트 불능).
"모두 반영" 지시로 README 설치 절을 한/영 subsection 구조(marketplace 권장 / settings.json 자동 설치 /
npm / 세션 로드 / 기타)로 재구성. verify-docs 통과, 커밋 8dea032 push. 코드 변경 0, 버전 bump 없음(문서 전용).

## Progress
- 완료: 설치 채널 조사(공식 문서 기반 — **미실측**, 신뢰 등급은 memory 7차 섹션에 구분 기록)
- 완료: README 설치 절 한/영 재구성 + skills 수동 복사 미지원 경고 (8dea032)
- 완료: memory `claude-code-plugin-platform-facts` 7차 섹션 추가(설치 채널)
- 미완: 사용자 보안 후속 — npm recovery codes 재생성 + `.env` NPM_KEY bypass 토큰 revoke (carryover)
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E (carryover)

## Next Steps
1. **사용자 보안 후속**: npm recovery codes 재생성(채팅 노출분 무효화) + NPM_KEY revoke.
2. product beta 준비 (concierge n≥5, moderated n≥20) — PRD §완료 기준.
3. (선택) 새 문서화한 설치 채널 실측 검증 — 특히 settings.json 자동 설치·`--plugin-url`은 문서 기반이라 6차 방식(실제 설치)으로 확인 가치 있음.

## Blockers
- 없음

## Watch Out
- **ask 티어 없음이 확정 설계**: 애매하면 위임이지 질문이 아님. ask 재도입 제안 금지. [[novice-safety-minimalism]]
- config의 `delegate` 값 = "novice 의견 없음, CC 네이티브가 처리". 코드는 `=== 'deny'`만 분기.
- PowerShell은 첫 토큰 cmdlet 라우팅 + deny 리스트뿐 — grammar 파서 없음 (PRD도 그렇게 기술).
- 파이프 낀 파괴 명령은 novice가 안 잡음(의도된 트레이드오프, README 비보증에 명시).
- 설치본=캐시 복사본. repo 수정은 재설치 전 미반영. [[claude-code-plugin-platform-facts]]
- **README 설치 채널 절은 문서 조사 기반(미실측)** — 사용자 문의로 동작 불일치 보고되면 memory 7차 신뢰 등급부터 확인.
- 릴리스 = plugin.json+package.json 동기 bump → Release Notes → push → 사용자 터미널 `npm publish`(OTP). [[npm-publish-flow]]
- `.env`는 gitignore됨 — 커밋 절대 금지 (NPM_KEY 등 시크릿).

## Files Touched
- 문서: README.md 설치 절 한/영 재구성 (8dea032)
- 메타: .claude-project/memory/claude-code-plugin-platform-facts.md(7차 섹션), MEMORY.md 인덱스, HANDOFF.md
