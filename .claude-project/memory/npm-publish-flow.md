---
name: npm-publish-flow
description: claude-novice npm publish 절차 — .env의 bypass-2FA granular 토큰을 --userconfig로 주입해 게시. npm login 금지(세션 토큰이 granular 토큰을 덮어써 E403)
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

**`npm login` 금지 (2026-08-02 0.4.0 릴리스에서 실측):** `npm login`은 `~/.npmrc`의
granular 토큰을 **웹 세션 토큰으로 덮어쓴다**. 세션 토큰은 bypass-2FA가 없어 publish가
`E403 Two-factor authentication or granular access token with bypass 2fa enabled is
required`로 죽는다. **E403 = 2FA 미등록**이라고 단정하면 안 된다 — 계정이 2FA 등록
상태여도 세션 토큰을 쓰면 같은 E403이 난다.

**401을 봤을 때 순서:** ① `.env`의 NPM 키를 임시 npmrc에 넣고
`npm whoami --userconfig=<임시파일>`로 먼저 테스트 → ② 살아 있으면
`npm publish --userconfig=<임시파일>`로 게시(에이전트가 직접 가능, 값 노출 없음) →
③ 임시파일 삭제. 로그인은 마지막 수단이다. 이 프로젝트의 `.env` NPM 키는 **살아 있는**
bypass-2FA granular 토큰이다(2026-07-22 발급) — 지우지 말 것.

**Why:** 2025-09 npm 공급망 보안 강화로 publish에는 2FA 또는 bypass-2FA granular 토큰이
필요하다. 웹 로그인 세션 토큰은 그 조건을 만족하지 않는데, 로그인이 기존 토큰을 조용히
덮어쓰기 때문에 "토큰이 죽었다"는 오진으로 이어지기 쉽다. 에이전트 셸은 OTP 대화형 입력이
불가하므로 토큰 경로가 유일하게 매끄러운 길이다.
**How to apply:** 릴리스는 bump·Release Notes·push 후 publish까지 에이전트가 수행한다.
`--userconfig`로 granular 토큰을 주입하면 값이 채팅·로그에 노출되지 않는다. 401/E404는
토큰 죽음, E403은 **세션 토큰 사용 여부부터** 의심한다(`~/.npmrc` mtime + 토큰
접두어·접미어 `case` 매칭으로 확인, 값은 절대 출력하지 않는다).
**토큰·recovery code는 채팅에 절대 붙이지 말 것**(노출 시 재발급). 관련: AGENTS.md 릴리스 규칙.
