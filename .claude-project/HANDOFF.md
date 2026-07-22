---
created: 2026-07-22T12:30:00+09:00
project: novice
summary: 0.3.0 릴리스 완료 (npm 게시) — 안전 게이트 wrapper 정규화 + bypassPermissions + 부트스트랩 min_version/upgrade + 자체 리뷰 4건 수정, 147→160 tests
---

## Session Digest
안전 게이트·부트스트랩 하드닝 + 자체 리뷰·수정 세션. 3커밋:
- **c4bae6b** `feat`: `grammar.js` unwrapCommandArgv(선행 env assign + 옵션 없는 env/command/sudo wrapper
  정규화, 복잡 wrapper·미지원 shape는 null→위임), manifest FORBIDDEN_ARGV0 확장, safety analyzeBash
  wrapper 정규화, pre-tool-use `bypassPermissions` 즉시 exit 0, bootstrap installer min_version semver
  검증 + approval 누락 시 break + approve phase, secret 패턴 unquoted 매칭. 147→157 tests.
- **e3854a1** `fix`: 자체 리뷰 지적 4건 —
  (1) P2 upgrade 경로: installer `upgrade_argv`(brew/scoop/winget), installed-but-outdated면 사용
      (scoop install은 in-place 업그레이드 못함), disclosure '업그레이드:' 표기.
  (2) P3 버전 파싱: version_check.success.stdout_regex 매치에 anchor — 업데이트 배너의 다른 semver 오인 방지.
  (3) P3 min_version fallback: validateManifest가 installers 간 min_version 균일 강제.
  (4) P3 approve UX: 승인 판정을 apply **이전**으로 이동(PRD 상태머신 plan→approve→apply 정렬),
      미승인 approval-required 전체를 pending_approvals로 한 번에 노출, 전부 승인 전엔 아무것도 실행 안 함.
  manifest revision 1→2. 157→160 tests. 부수: audit 테스트 revision 하드코딩 제거.
- **667e7b9** `release`: 0.3.0 bump (plugin.json+package.json 동기) + README Release Notes(한/영).
  verify-docs + 160/160 통과, push 완료.
- **npm publish 완료**: `claude-novice@0.3.0` 레지스트리 게시(latest, 37 files, shasum 39e846da…).
  publish 과정에 인증 이슈 해소 — 기존 .npmrc/.env 토큰 401(죽음), OTP EOTP 거쳐, 최종적으로
  **새 Granular Access Token(claude-novice read+write)**으로 게시 성공.

## Progress
- 완료: 안전 게이트 wrapper 정규화 + bypassPermissions stand-down + secret unquoted 매칭 (c4bae6b)
- 완료: 부트스트랩 installer min_version semver 검증 + approve phase (c4bae6b)
- 완료: 자체 리뷰 4건 전부 수정 — upgrade_argv, 버전 anchor, min_version 균일 검증, approve 선행 게이트 (e3854a1)
- 완료: 문서 동기화(테스트 수 147→160, wrapper·bypassPermissions·위협모델), manifest revision 1→2
- 완료: **0.3.0 릴리스 + npm publish** (667e7b9, claude-novice@0.3.0 게시)
- 완료: npm recovery codes 재생성 (이전 채팅 노출분 포함 무효화)
- 미완: **보안 후속** — 채팅에 노출된 recovery codes 5건 재생성 확인 + 죽은 .env NPM_KEY 정리(파일에서 제거),
  publish용 Granular Access Token 안전 보관 확인 (carryover)
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E (carryover)

## Next Steps
1. **보안 정리**: (a) 이번 세션 채팅에 붙여넣은 recovery codes 5건이 재생성으로 무효화됐는지 확인,
   (b) 죽은 `.env` NPM_KEY(401) 제거, (c) 새 Granular Access Token은 채팅·커밋 밖에 안전 보관.
2. product beta 준비 (concierge n≥5, moderated n≥20) — PRD §완료 기준.
3. (선택) 문서화한 설치 채널 실측 검증 — settings.json 자동 설치·`--plugin-url`은 문서 기반.

## Blockers
- 없음

## Watch Out
- **manifest 스키마 불변식(신규)**: installers 간 `min_version` 균일 필수(validateManifest 강제).
  `upgrade_argv`는 선택 — install이 in-place 업그레이드 못하는 pm(scoop 등)만 필요. brew/winget도 명시함.
- **버전 파싱은 stdout_regex에 anchor**: version_check.success.stdout_regex 매치 부분에서만 semver 추출.
  새 manifest 추가 시 stdout_regex를 실제 버전 라인에 맞춰야 배너 오인 안 남.
- **부트스트랩 상태머신 = plan→approve→apply**: 승인 판정은 apply 이전. 전 승인 전엔 apply 미실행.
- **wrapper 정규화 = 옵션 없는 단순 prefix만**: env/command/sudo 뒤 첫 토큰이 `-`면 null→위임. [[novice-safety-minimalism]]
- **ask 티어 없음이 확정 설계**: 애매하면 위임이지 질문이 아님. ask 재도입 제안 금지. [[novice-safety-minimalism]]
- `bypassPermissions`면 게이트 즉시 stand down — 파괴·MCP 포함 어떤 판정도 안 냄(사용자 전 리스크 인수).
- 파이프 낀 파괴 명령은 novice가 안 잡음(의도된 트레이드오프, README 비보증에 명시).
- 릴리스 = plugin.json+package.json 동기 bump → Release Notes → push → publish. [[npm-publish-flow]]
  **publish 인증**: 2FA 등록됨 → 새 Granular Access Token(claude-novice read+write)이면 OTP 없이 게시.
  OTP 경로는 `--otp=<6자리>`(대화형 프롬프트는 `!` 셸에서 안 뜸). 죽은 토큰은 401(위장 E404).
- `.env`는 gitignore됨 — 커밋 절대 금지 (NPM_KEY 등 시크릿). 시크릿·토큰·recovery code는 채팅에도 붙이지 말 것.

## Files Touched
- 코드: scripts/lib/grammar.js, scripts/lib/manifest.js, scripts/lib/safety.js,
  scripts/pre-tool-use.js, scripts/bootstrap-engine.js, config/safety-rules.json
- config: config/bootstrap-manifests/{github-cli,supabase,vercel}.json (upgrade_argv, revision 2)
- 테스트: tests/unit/{grammar,bootstrap,secrets}.test.js, tests/integration/{safety-corpus,hooks-contract}.test.js
- 문서: README.md, docs/PRD.md, docs/QUALITY.md, docs/harness/maturity-framework.md, AGENTS.md
