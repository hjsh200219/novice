---
created: 2026-07-22T00:00:00+09:00
project: novice
summary: 안전 게이트 wrapper 정규화(env/command/sudo/NAME=) + bypassPermissions stand-down + 부트스트랩 installer min_version semver 검증 — 147→157 tests
---

## Session Digest
안전 게이트·부트스트랩 하드닝 세션. 커밋 c4bae6b:
(1) `grammar.js` `unwrapCommandArgv` 신설 — 선행 env assignment와 옵션 없는 `env`/`command`/`sudo`
wrapper를 내부 명령으로 정규화(파괴 판정 전 적용), 복잡한 wrapper 옵션·미지원 shape는 null 반환해 위임.
(2) `manifest.js` FORBIDDEN_ARGV0에 shell 인터프리터 확장(dash/ksh/csh/fish/pwsh/cmd 등) + wrapper
정규화 후 argv0 검사 + `.exe/.cmd/.bat` 확장자 정규화.
(3) `safety.js` analyzeBash가 unwrapCommandArgv로 wrapper 벗긴 뒤 base 판정.
(4) `pre-tool-use.js` `permission_mode==='bypassPermissions'`면 즉시 exit 0(게이트 완전 stand down).
(5) `bootstrap-engine.js` installer `min_version`을 semver parse/compare로 검증(versionMeetsMinimum),
approval 누락 시 plan `break`(기존 continue 버그) + `pending_approvals`를 `approve` phase로 노출.
(6) `safety-rules.json` generic-assignment 패턴이 따옴표 없는 값도 매칭.
docs(README 한/영·PRD rev12 위협모델·grammar 절·QUALITY·maturity·AGENTS)에 wrapper 지원·bypassPermissions
예외 반영 + 테스트 수 147→157 동기화. verify-docs + 157/157 통과, push 완료.

## Progress
- 완료: 안전 게이트 wrapper 정규화 + bypassPermissions stand-down + secret 패턴 unquoted 매칭 (c4bae6b)
- 완료: 부트스트랩 installer min_version semver 검증 + approval 누락 시 plan 중단 + approve phase
- 완료: 문서 전면 동기화(위협모델·grammar 절·테스트 수 147→157)
- 미완: 사용자 보안 후속 — npm recovery codes 재생성 + `.env` NPM_KEY bypass 토큰 revoke (carryover)
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E (carryover)

## Next Steps
1. **사용자 보안 후속**: npm recovery codes 재생성(채팅 노출분 무효화) + NPM_KEY revoke.
2. (선택) 릴리스 판단 — 이번 세션은 새 안전 동작(bypassPermissions·wrapper) 추가라 semver상 minor(0.2.0→0.3.0)
   후보. 릴리스하려면 plugin.json+package.json 동기 bump → README Release Notes(한/영) → push → 터미널 `npm publish`(OTP). 미결정.
3. product beta 준비 (concierge n≥5, moderated n≥20) — PRD §완료 기준.
4. (선택) 문서화한 설치 채널 실측 검증 — settings.json 자동 설치·`--plugin-url`은 문서 기반.

## Blockers
- 없음

## Watch Out
- **wrapper 정규화 = 옵션 없는 단순 prefix만**: `env`/`command`/`sudo` 뒤 첫 토큰이 `-`로 시작하면 null(위임).
  복잡한 wrapper 옵션은 의도적으로 안 잡음 — [[novice-safety-minimalism]] 이분법의 연장(확실치 않으면 위임).
- **ask 티어 없음이 확정 설계**: 애매하면 위임이지 질문이 아님. ask 재도입 제안 금지. [[novice-safety-minimalism]]
- `bypassPermissions`면 게이트 즉시 stand down — 파괴 명령·MCP 포함 어떤 판정도 안 냄(사용자 전 리스크 인수).
- config의 `delegate` 값 = "novice 의견 없음, CC 네이티브가 처리". 코드는 `=== 'deny'`만 분기.
- 파이프 낀 파괴 명령은 novice가 안 잡음(의도된 트레이드오프, README 비보증에 명시).
- 릴리스 = plugin.json+package.json 동기 bump → Release Notes → push → 사용자 터미널 `npm publish`(OTP). [[npm-publish-flow]]
- `.env`는 gitignore됨 — 커밋 절대 금지 (NPM_KEY 등 시크릿).

## Files Touched
- 코드: scripts/lib/grammar.js(unwrapCommandArgv), scripts/lib/manifest.js, scripts/lib/safety.js,
  scripts/pre-tool-use.js, scripts/bootstrap-engine.js, config/safety-rules.json
- 테스트: tests/unit/{grammar,bootstrap,secrets}.test.js, tests/integration/{safety-corpus,hooks-contract}.test.js
- 문서: README.md, docs/PRD.md, docs/QUALITY.md, docs/harness/maturity-framework.md, AGENTS.md
