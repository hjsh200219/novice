---
name: npm-publish-flow
description: claude-novice npm publish 절차 — 계정 2FA 필수(bypass 토큰도 거부됨), 사용자 터미널에서 OTP publish
type: reference
created: 2026-07-21
---

npm 패키지 `claude-novice`(플러그인 배포 채널, plugin.json과 버전 동기).
계정 `inter349`, 2FA(Authenticator App) 등록됨 — 2026-07-21.

publish 절차: 버전 bump 커밋·push 후 **사용자 터미널에서** `npm publish`
→ OTP 프롬프트에 인증 앱 6자리 입력. `prepublishOnly`가 verify-docs+147 테스트를
자동 실행하므로 별도 사전 검증 불필요.

**Why:** 2025-09 npm 공급망 보안 강화 이후 **bypass-2FA granular 토큰으로도
2FA 미등록 계정은 publish 거부(E403)** — 토큰 인증(whoami)은 되는데 publish만
막히는 형태라 오진하기 쉽다. 에이전트 셸에서는 OTP 대화형 입력이 안 되므로
publish는 사용자 터미널 몫이다.
**How to apply:** 릴리스 시 에이전트는 bump·Release Notes·push까지 하고,
publish는 사용자에게 `cd <repo> && npm publish` 안내. E403 2FA 에러가 나오면
토큰 만들 생각 말고 계정 2FA 상태부터 확인. 관련: AGENTS.md 릴리스 규칙.
