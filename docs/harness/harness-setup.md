# Pre-Implementation 체크리스트 (SSOT)

구현 전 확인. 진입 문서(AGENTS.md)는 이 문서로 링크만 한다.

## 구조/공통화
- [ ] TDD: 새 기능·로직 변경은 실패 테스트 먼저 (안전 규칙은 corpus + mutation).
- [ ] Search Before Building: `scripts/lib/`에 이미 있는지 확인 (state·hookio·secrets·grammar·capsule·manifest·capability-router·fingerprint).
- [ ] 함수 크기·early return·에러 삼키지 않기.
- [ ] import 방향 준수 (layer-rules.md). lib → hook 역방향 금지.
- [ ] **zero external dependency** — npm 패키지 추가 금지.

## 안전 (이 프로젝트의 핵심)
- [ ] 안전 hook 변경은 fail-closed 유지 (deny/exit 2). 학습 hook은 fail-open.
- [ ] 시크릿 원문을 로그·state·metric에 남기지 않기 (secrets.js 경유).
- [ ] credential 값 미취급 (요청·저장·전달·자동입력 금지).
- [ ] 위험 grammar 변경 시 safety corpus + mutation fixture 갱신, 탐지율 100%·오탐 ≤10% 유지.
- [ ] state는 CLAUDE_PLUGIN_DATA만 (state.js 경유).

## 플랫폼 계약
- [ ] hook payload/출력 계약 변경은 실측(2.1.215) 또는 documented fixture로 근거.
- [ ] plugin.json은 `hooks` 키를 넣지 않는다 (hooks/hooks.json 자동 로드 — 중복 로드 실패).
- [ ] userConfig 항목에 `title` 필수.

## 검증 (완료 전)
- [ ] `npm test` 전체 통과.
- [ ] `npm run verify-docs` 통과 (문서-코드 일치·레이어 규칙).
- [ ] `claude plugins validate .` 통과.
- [ ] 상태 보고: DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.

## 공유 모듈 레지스트리 (중복 생성 방지)
| 모듈 | 용도 |
|---|---|
| `scripts/lib/state.js` | 상태 read/write, project override, session, mute |
| `scripts/lib/hookio.js` | stdin/stdout, emit, fail-open/closed |
| `scripts/lib/secrets.js` | 시크릿 스캔·redaction, 안전 규칙 로드 |
| `scripts/lib/grammar.js` | Bash/PowerShell 토크나이저, git subgrammar |
| `scripts/lib/capsule.js` | capsule/glossary/tombstone/fade |
| `scripts/lib/manifest.js` | bootstrap manifest 검증·로드 |
| `scripts/lib/capability-router.js` | CLI/MCP/Chrome/guided 경로 결정 |
| `scripts/lib/fingerprint.js` | tool 호출 fingerprint |
| `tests/helpers/run-hook.js` | 테스트에서 hook 자식 프로세스 실행 |
| `tests/helpers/mutate.js` | mutation 하네스 연산자 |
