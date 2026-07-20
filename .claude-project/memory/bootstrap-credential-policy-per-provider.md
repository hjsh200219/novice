---
name: bootstrap-credential-policy-per-provider
description: novice 부트스트랩의 plaintext 로그인 처리는 provider별 manifest 정책 — 고지형(vercel) vs 중단형(gh/supabase)
type: project
created: 2026-07-20
---

novice 플러그인의 CLI 부트스트랩 엔진에서 로그인 시 credential이 plaintext로 저장되는 경우의 처리는 **provider별로 다르며, 각 bootstrap manifest에 정책으로 명시**한다(PRD rev 9에서 이 형태로 확정, 사용자 확정 2026-07-20, bootstrap 테스트로 lock).

두 archetype:
- **고지형 (disclose-not-abort)** — 예: `vercel`. 로그인 흐름이 본질적으로 plaintext 토큰을 쓰므로, plaintext를 감지해도 사용자에게 고지(경고)하고 로그인을 진행한다.
- **중단형 (abort-on-plaintext)** — 예: `gh`, `supabase`. plaintext fallback이 감지되면 로그인을 **중단**한다(안전한 로그인 경로가 따로 있으므로 plaintext는 회피 가능).

**Why:** provider마다 credential 저장 보안 특성이 달라 일률적 정책이 맞지 않는다. vercel처럼 plaintext가 불가피한 흐름을 무조건 중단하면 그 서비스 설정 자체가 막혀 사용자 가치가 사라지고, gh/supabase처럼 안전 경로가 있는 경우엔 plaintext를 허용할 이유가 없다. 초안(rev8)은 vercel만 예외로 뒀으나 rev9에서 provider별 manifest 정책으로 일반화됨.
**How to apply:** 새 부트스트랩 manifest를 추가할 때 그 provider의 로그인이 plaintext를 쓰는지 확인하고 고지형/중단형 중 하나를 manifest에 명시한다. 정책 변경은 대응하는 bootstrap 테스트를 함께 갱신한다. 부트스트랩 전반 맥락: [[prd-cross-review-workflow]].
