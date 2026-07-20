---
created: 2026-07-21T02:05:00+09:00
project: novice
summary: 안전 게이트 deny-only 최소코어 완성(리뷰·잔재정리 포함) — 코드 4커밋 push(4a9cf4b·b4e9d84·e413db8 + rev12 2d66049), 147 tests, PRD rev 12
---

## Session Digest
사용자 결정 "safety가 이 플러그인에 과하다" → **deny-only 최소 코어(B)** 로 전환 완료. 흐름: (1) `safety.js` 재작성 — ask 티어 전면 제거, 긍정 탐지된 파괴 비가역(`rm -rf ~`·`/`·프로젝트 루트, `dd`/`mkfs`/`shred`, disk-format cmdlet, protected branch force-push, production/unknown 파괴 MCP)과 시크릿 값(commit/deploy/명령줄)만 deny, 나머지는 CC 네이티브 권한 위임 → benign 파이프/체인 false-prompt 소멸. (2) `/novice` umbrella front door 추가. (3) PRD rev 12. (4) fixture-scan 자기차단 갭 수정(`scan_path_skip`). (5) Fable 리뷰 패스 — ask 시절 죽은 config(`dangerous_tokens`·`*_ask`·`git_rules`)·고아 `tokenizePowershell`(94줄) 제거, 소비되는 `ask` 값 27개를 `delegate`로 개명(동작 무변경), PowerShell "유한 grammar" 과장 교정, live probe 7종으로 deny/위임 경계 재확인. 문서 테스트 수 147로 동기화.

## Progress
- 완료: deny-only 코어 + 리뷰·잔재 정리 (147 tests, verify-docs OK, 전부 push)
- 완료: `/novice` front door, PRD rev 12, fixture 경로 스캔 예외, novice off(이 프로젝트)
- 미완: 플러그인 재설치(사용자), product beta(사람 참가자), 실제 CLI 설치·로그인 E2E

## Next Steps
1. **플러그인 재설치** — 실행 세션은 캐시본이라 deny-only 코어·`/novice`·fixture 예외 전부 미반영. `/plugin` update → 재설치.
2. 재설치 후 스모크: benign 파이프 명령에 프롬프트 없어졌는지, `/novice` 명령 표시, `rm -rf ~` deny 확인.
3. product beta 준비 (concierge n≥5, moderated n≥20) — PRD §완료 기준.

## Blockers
- 없음

## Watch Out
- **ask 티어 없음이 확정 설계**: 애매하면 위임이지 질문이 아님. ask 재도입 제안 금지. [[novice-safety-minimalism]]
- config의 `delegate` 값 = "novice 의견 없음, CC 네이티브가 처리". 코드는 `=== 'deny'`만 분기.
- PowerShell은 첫 토큰 cmdlet 라우팅 + deny 리스트뿐 — grammar 파서 없음 (PRD도 그렇게 기술).
- 파이프 낀 파괴 명령은 novice가 안 잡음(의도된 트레이드오프, README 비보증에 명시).
- 설치본=캐시 복사본. repo 수정은 재설치 전 미반영. [[claude-code-plugin-platform-facts]]

## Files Touched
- 코드: scripts/lib/safety.js(재작성+경로예외), scripts/lib/grammar.js(−94줄), scripts/pre-tool-use.js, config/safety-rules.json(잔재 제거·delegate 개명·scan_path_skip)
- 스킬: skills/novice/SKILL.md(신규)
- 테스트: safety fixtures/corpus, grammar·secrets unit — 147 pass
- 문서: docs/PRD.md(rev 12), README, AGENTS, ARCHITECTURE, docs/QUALITY
