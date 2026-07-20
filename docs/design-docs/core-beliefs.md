# Core Beliefs — 에이전트 우선 운영 원칙

novice 개발·유지보수에서 에이전트가 따르는 핵심 신념.

1. **정직한 축소** — "AI가 전부 대신"이 아니라 검증 가능한 경로만 자동화하고 나머지는 명시적으로 사용자에게 남긴다. 부트스트랩은 탐지·설치·로그인·인증 확인까지, provisioning은 사용자.
2. **No silent security claims** — 안전 게이트의 위협 모델·탐지 범위·미보장을 문서·테스트에 명시한다. 보장 못 하는 것을 보장한다고 쓰지 않는다.
3. **Fail-closed는 안전, fail-open은 학습** — 안전 hook은 막는 쪽으로, 학습 hook은 사용자 작업을 막지 않는 쪽으로 실패한다.
4. **credential 미취급** — 플러그인은 비밀 값을 요청·저장·전달·자동입력하지 않는다.
5. **데이터가 SSOT** — 동작 규칙은 config JSON에. 코드는 데이터를 해석할 뿐. Markdown을 런타임 파싱하지 않는다.
6. **map, not handbook** — 진입 문서는 링크 중심 ~100줄. 상세는 하위 문서.
7. **Search Before Building** — 새 유틸 만들기 전 `scripts/lib/`에 이미 있는지 확인 (state·secrets·grammar·capsule·manifest·capability-router·fingerprint).
8. **실측 우선** — 플랫폼 계약은 추정 대신 실제 runtime 캡처로 확정 (contract fixture provenance).
9. **회의적 검증** — 산출물은 "존재"가 아니라 "코드와 일치"로 검증한다. 작성과 검증은 분리한다.
