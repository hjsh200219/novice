---
created: 2026-07-21T01:10:00+09:00
project: novice
summary: 안전 게이트를 deny-only 최소 코어로 축소(ask 티어 제거→false-prompt 해소) + /novice front door 스킬 추가, 문서 동기화, 148 tests green, 커밋·푸시 완료(4a9cf4b)
---

## Session Digest
사용자가 안전 게이트를 "이 플러그인에 과하다"고 판단. 옵션 논의(A 완전제거 / B 최소코어 / C 캘리브레이션) 후 **B 채택**. `scripts/lib/safety.js`를 deny-only 최소 코어로 재작성: ask 티어를 전면 제거하고, 긍정 탐지된 파괴 비가역 작업(`rm -rf ~`·`/`·프로젝트 루트, `dd`/`mkfs`/`shred`, disk-format cmdlet, protected branch force-push, production/unknown 파괴 MCP)과 노출된 시크릿 값(commit/deploy/명령줄)만 deny. 파싱 불가·모호·staging/dev·스캔 불가는 판정하지 않고 Claude Code 네이티브 권한에 위임. 이로써 `find|sort&&ls` 같은 benign 파이프/체인 명령마다 뜨던 false-prompt(ask) 소멸. 부수로 `/novice` umbrella front door 스킬 신설(상태 대시보드+하위 명령 안내). 세션 중 잘못 짚었던 변경 2건(bypassPermissions 게이트 무력화 시도)은 되돌림.

## Progress
- 완료: safety.js deny-only 재작성(161줄 축소), pre-tool-use 헤더 정정
- 완료: `/novice` umbrella 스킬(skills/novice/SKILL.md) — plugin 컴포넌트는 항상 `/novice:*` namespace
- 완료: 문서 동기화 — PRD §4.5(SSOT), README(한/영) 위협모델, AGENTS 제약 #1, ARCHITECTURE
- 완료: 테스트 정합 — fixtures ask→allow, dangerous-unsupported.json 제거, corpus/commit 테스트 조정 → 148 pass, verify-docs OK
- 완료: `.gitignore` nested `**/.omc/` (테스트 잔여 상태 커밋 방지)
- 완료: 커밋 4a9cf4b + push origin main
- 완료: novice off (이 프로젝트, enabled:false) 저장

## Next Steps
1. **플러그인 재설치** 필요 — 실행 세션은 캐시 복사본을 쓰므로 deny-only 코어와 `/novice` 명령이 아직 미반영. `/plugin` update→재설치 후 적용.
2. ~~fixture-scan 갭~~ — 해결됨: `scan_path_skip` 경로 예외 (b4e9d84). [[safety-fixture-scan-self-block-gap]]
3. ~~미사용 config 정리~~ — 해결됨: `dangerous_tokens`·`*_ask` 리스트·`git_rules`·`tokenizePowershell` 제거, 소비되는 `ask` 값은 `delegate`로 개명 (deny-only 검토 후속).

## Blockers
- 없음 (재설치는 사용자 환경 조작, 기술 블록 아님)

## Watch Out
- 안전 정책 대전환: **ask 티어 없음**. deny는 확실한 파괴/시크릿만. 파이프 낀 파괴 명령(`rm -rf / ; …`)은 novice가 안 잡고 CC 네이티브에 위임(의도된 트레이드오프).
- 설치본은 캐시 복사본 — repo 편집은 재설치 전까지 실행 세션에 반영 안 됨. [[claude-code-plugin-platform-facts]]
- commit 게이트가 repo 자체 fixture(synthetic ghp_/AKIA)를 deny로 플래그(오탐) — 단 이번 세션 hook deny는 실제 커밋을 막지 않았음. [[safety-fixture-scan-self-block-gap]]
- PRD는 rev 11 유지 중 — 안전 정책이 크게 바뀌었으니 다음에 revision bump(→12) 고려.

## Files Touched
- 코드: scripts/lib/safety.js(재작성), scripts/pre-tool-use.js(주석)
- 스킬: skills/novice/SKILL.md(신규)
- 테스트: tests/fixtures/safety/{dangerous-supported,benign-unsupported}.json, tests/integration/safety-corpus.test.js, dangerous-unsupported.json(삭제)
- 문서: docs/PRD.md, README.md, AGENTS.md, ARCHITECTURE.md
- 기타: .gitignore
