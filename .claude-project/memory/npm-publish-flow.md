---
name: npm-publish-flow
description: npm publish 절차 — 토큰은 ~/.npmrc(.env 아님), 범위 넓어 새 패키지 생성 가능. npm login 금지(세션 토큰이 E403). 샌드박스가 npmrc를 가려 ENEEDAUTH 오진 유발
type: reference
created: 2026-07-21
---

계정 `inter349`, 2FA(Authenticator App) 등록됨 — 2026-07-21. 이 계정으로 발행하는
플러그인 패키지는 전부 이 절차를 쓴다 — `claude-novice`, `crosspost-plugin`(2026-08-05).
버전은 각 repo의 `plugin.json`과 `package.json`을 동기 bump.

publish 절차: 버전 bump 커밋·push 후 **사용자 터미널에서** publish.
`prepublishOnly`가 verify-docs+전체 테스트를 자동 실행하므로 별도 사전 검증 불필요.

**인증 경로 (2026-07-22 0.3.0 릴리스에서 실측 확정):**
- 계정 2FA가 **등록된 상태**에서는 **Granular Access Token**으로
  `npm publish --//registry.npmjs.org/:_authToken=<token>` 하면
  **OTP 없이 게시 성공**. ← 가장 매끄러운 경로. (아래 2026-08-05 정정 참조 — 그 토큰은
  지금 `~/.npmrc`에 있어 인자 없이 `npm publish`만 하면 된다.)
- OTP 경로: `npm publish --otp=<인증앱 6자리>`. `!` 셸은 비대화형이라 OTP
  프롬프트가 안 떠 EOTP 에러 → 반드시 `--otp=` 인라인 전달.
- 죽은/폐기 토큰은 `whoami`에서 **401**, publish는 **E404로 위장**(Not found /
  permission) — 미인증을 404로 감추는 npm 동작. OTP 프롬프트가 아예 안 뜨면 인증 부재 신호.

**`npm login` 금지 (2026-08-02 0.4.0 릴리스에서 실측):** `npm login`은 `~/.npmrc`의
granular 토큰을 **웹 세션 토큰으로 덮어쓴다**. 세션 토큰은 bypass-2FA가 없어 publish가
`E403 Two-factor authentication or granular access token with bypass 2fa enabled is
required`로 죽는다. **E403 = 2FA 미등록**이라고 단정하면 안 된다 — 계정이 2FA 등록
상태여도 세션 토큰을 쓰면 같은 E403이 난다.

**토큰의 실제 위치는 `~/.npmrc`다 (2026-08-05 정정).** 이 문서가 원래 적어 둔
`SHC/novice/.env`는 **더 이상 존재하지 않는다.** 토큰은 `~/.npmrc`의
`//registry.npmjs.org/:_authToken` 한 줄로 살아 있다(2026-07-22 발급, 계정 `inter349`,
`npm token list` 기준 이 계정의 유일한 토큰). 따라서 `--userconfig` 주입은 불필요하고
**`npm publish`를 그냥 실행하면 된다.**

**범위는 `claude-novice` 전용이 아니다 (2026-08-05 실측).** 이 토큰으로 완전히 새 패키지
`crosspost-plugin@0.6.0`을 생성·게시하는 데 성공했다. 즉 패키지 지정이 아니라 넓은 범위의
토큰이다. `npm access list packages`가 E403을 내지만 **그건 범위 협소의 증거가 아니다** —
granular 토큰은 org 열거 엔드포인트 자체를 못 쓴다. 범위를 CLI로 미리 알아낼 방법은 없다.

**범위가 궁금하면 그냥 publish를 시도하라.** 권한이 모자라면 E404로 튕기고 **아무것도
발행되지 않는다**(npm이 미인증·무권한을 404로 위장). 위험한 건 실패가 아니라 *원치 않는
이름으로 성공하는 것*이므로, 시도 전에 확정할 것은 권한이 아니라 **패키지 이름**이다.

**401을 봤을 때 순서:** ① `npm whoami`로 먼저 확인 → ② 죽었으면 `.env`나 별도 위치의
키를 임시 npmrc에 넣고 `npm publish --userconfig=<임시파일>` 후 임시파일 삭제(값이 채팅·
로그에 안 남는 경로) → ③ 로그인은 마지막 수단이다.

**샌드박스가 `~/.npmrc`를 조용히 가린다 (2026-08-05 실측).** 세션 첫 `ls ~/.npmrc`와 첫
`npm whoami`가 각각 "파일 없음"과 `ENEEDAUTH`를 냈는데 **둘 다 거짓이었다.** 파일은 있고
토큰도 살아 있었다. **`ENEEDAUTH`나 "npmrc 없음"을 토큰 부재의 근거로 삼지 말 것** —
`cut -d= -f1 ~/.npmrc`(키 이름만, 값은 절대 출력 금지)로 한 번 더 확인하고 `npm whoami`를
재실행하라. 두 번째 호출은 통과했다.

**Why:** 2025-09 npm 공급망 보안 강화로 publish에는 2FA 또는 bypass-2FA granular 토큰이
필요하다. 웹 로그인 세션 토큰은 그 조건을 만족하지 않는데, 로그인이 기존 토큰을 조용히
덮어쓰기 때문에 "토큰이 죽었다"는 오진으로 이어지기 쉽다. 에이전트 셸은 OTP 대화형 입력이
불가하므로 토큰 경로가 유일하게 매끄러운 길이다.
**How to apply:** 릴리스는 bump·Release Notes·push 후 publish까지 에이전트가 수행한다.
`--userconfig`로 granular 토큰을 주입하면 값이 채팅·로그에 노출되지 않는다. 401/E404는
토큰 죽음, E403은 **세션 토큰 사용 여부부터** 의심한다(`~/.npmrc` mtime + 토큰
접두어·접미어 `case` 매칭으로 확인, 값은 절대 출력하지 않는다).
**토큰·recovery code는 채팅에 절대 붙이지 말 것**(노출 시 재발급). 관련: AGENTS.md 릴리스 규칙.
