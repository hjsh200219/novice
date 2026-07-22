---
name: npm-publish-flow
description: claude-novice npm publish 절차 — 계정 2FA 필수(bypass 토큰도 거부됨), 사용자 터미널에서 OTP publish
type: reference
created: 2026-07-21
---

npm 패키지 `claude-novice`(플러그인 배포 채널, plugin.json과 버전 동기).
계정 `inter349`, 2FA(Authenticator App) 등록됨 — 2026-07-21.

publish 절차: 버전 bump 커밋·push 후 **사용자 터미널에서** publish.
`prepublishOnly`가 verify-docs+전체 테스트를 자동 실행하므로 별도 사전 검증 불필요.

**인증 경로 (2026-07-22 0.3.0 릴리스에서 실측 확정):**
- 계정 2FA가 **등록된 상태**에서는 **새 Granular Access Token**(claude-novice
  read+write)으로 `npm publish --//registry.npmjs.org/:_authToken=<token>` 하면
  **OTP 없이 게시 성공**. ← 가장 매끄러운 경로.
- OTP 경로: `npm publish --otp=<인증앱 6자리>`. `!` 셸은 비대화형이라 OTP
  프롬프트가 안 떠 EOTP 에러 → 반드시 `--otp=` 인라인 전달.
- 죽은/폐기 토큰은 `whoami`에서 **401**, publish는 **E404로 위장**(Not found /
  permission) — 미인증을 404로 감추는 npm 동작. OTP 프롬프트가 아예 안 뜨면 인증 부재 신호.

**Why:** 2025-09 npm 공급망 보안 강화로, 2FA **미등록** 계정은 bypass granular
토큰으로도 publish 거부(E403). 2FA 등록 후에는 granular 토큰 publish가 정상 동작.
에이전트 셸은 OTP 대화형 입력 불가라 토큰 경로 또는 `--otp=` 인라인이 필요하다.
**How to apply:** 릴리스 시 에이전트는 bump·Release Notes·push까지. publish는
사용자 터미널 몫 — 우선 새 Granular 토큰 발급 안내(가장 편함), 없으면 `--otp=<6자리>`.
E404/401 나오면 토큰 죽음부터 의심(재발급), E403이면 계정 2FA 등록 상태 확인.
**토큰·recovery code는 채팅에 절대 붙이지 말 것**(노출 시 재발급). 관련: AGENTS.md 릴리스 규칙.
