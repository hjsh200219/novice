---
name: setup-service
description: 외부 서비스 CLI 부트스트랩 — 탐지·설치·로그인·인증 확인까지 2-tier 승인 흐름
---

# setup-service — 외부 서비스 CLI 부트스트랩

manifest 기반 상태 머신 `resolve → preflight → plan → approve → apply → verify → recover`로
외부 서비스 CLI를 준비한다. 엔진은 `scripts/bootstrap-engine.js` 라이브러리이고,
provider별 차이는 전부 `config/bootstrap-manifests/*.json` 데이터에 있다.

## 자동화 경계 (절대 넘지 않는다)

- 자동화하는 것: **CLI 탐지 → 설치 → 로그인 실행 → 인증 상태 확인**까지.
- 자동화하지 않는 것: 리소스 생성·연결, env/secret 값 입력, 배포, 결제, 삭제, 약관 동의.
  이후 단계는 무엇을·왜·어느 명령으로 하는지 단계별로 안내하고 **사용자가 직접 실행**한다.
- credential 값을 절대 요청·보관·전달·자동입력하지 않는다. 브라우저·device flow·MFA는
  사용자가 직접 완료한다. 값을 대화·명령 인자·shell history에 넣지 않도록 경고한다.

## 2-tier 규칙

| | Tier 1 | Tier 2 |
|---|---|---|
| 대상 | 검토된 manifest (vercel, gh, supabase) | 그 외 모든 CLI |
| 근거 | repo 동봉 version 관리 manifest | engine이 조사한 공식 docs URL·package coordinate |
| 실행 조건 | 표준 승인 (설치 1회 + 로그인 1회) | **근거 출처와 실행 argv를 화면에 그대로 제시**하고 사용자가 승인한 경우에만 |
| 근거 미확인 시 | — | guided manual로 낮춤 (설치·로그인 진행 안 함) |
| 위험 verb 차단 | provider-aware (manifest 등재분) | generic grammar 보증만 — 이 차이를 승인 UI에 표시 |

## 진행 절차 (모델 지침)

1. **resolve**: 서비스명을 Tier 1 manifest에 매핑. 미등재면 공식 문서·registry를 조사해
   ad-hoc manifest(같은 schema, `tier: 2`)를 만들고 근거를 표로 제시한다.
2. **preflight** (read-only): 설치 여부, version, 기존 인증, credential 저장 방식, 대화형 여부.
   이미 인증돼 있으면 로그인을 재실행하지 않는다.
3. **plan/approve**: 설치 위치·전역 변경·인증 저장 위치·실행 argv·되돌리기(logout/uninstall)를
   표로 보여 주고 **설치와 로그인 각각 1회씩** 승인받는다. 승인은 해당 실행 1회에만 유효하다.
4. **apply**: 승인된 manifest argv만 exec-form으로 한 명령씩 실행. `curl | bash`·shell 문자열 조립 금지.
5. **verify**: version check와 auth status로 각각 검증한다.
6. **recover** (실패 시): 완료 단계, 남은 전역 파일·credential 위치, 재시도·logout·uninstall
   명령을 보고만 한다. **자동 logout/uninstall은 하지 않는다.**

## capability 라우터 (CLI → MCP → Chrome → guided manual)

경로 선택·검증·다운그레이드는 `scripts/lib/capability-router.js`가 결정한다.
`scripts/bootstrap-engine.js`의 `setupService(engine, serviceId, capability, ctx)`가 진입점이며,
`cli` 경로만 manifest 엔진을 직접 실행하고 나머지는 **plan(안내)만 반환**한다.

- **경로 결정**: `resolveCapability`가 `capability_priority`(CLI→MCP→Chrome→guided manual) 순으로
  각 경로의 가용성을 검사해 첫 사용 가능 경로를 고른다. provisioning·deploy·env_setup처럼
  service-capabilities에서 `guided_manual`로 고정된 capability는 즉시 guided manual로 간다.
- **MCP 검증(`validateMcpCandidate`)**: `mcp_allowlist`에 server·transport·publisher가 정확히
  일치하고, provenance가 hook input에서 verified이며, 요청 tool이 전부 allowlist 안이고,
  해당 capability를 담당하는 엔트리일 때만 허용한다. 하나라도 어긋나면 그 경로를 건너뛴다.
  **allowlist 기본값은 비어 있어 아무 MCP도 자동 실행되지 않는다.** MCP tool 실제 호출은 모델이
  하고 PreToolUse 안전 게이트가 계속 검사한다.
- **Chrome 판정(`chromeDecision`)**: 공식 Claude in Chrome이 연결되고 제3자 provider가 아닐 때만
  visible mode로 사용한다. login/CAPTCHA/MFA·최종 submit은 항상 사용자가 직접 완료한다.
- **한계(정직 표기)**: 라우터는 경로 결정·검증·다운그레이드·plan 생성까지다. 플러그인은 MCP 서버를
  spawn하거나 MCP tool을 호출하거나 Chrome을 조작하지 않는다(비목표: 임의 MCP 자동 설치 금지).

## 중단·다운그레이드 조건

- secure credential storage가 없어 **평문 저장**으로 떨어지는 환경(manifest
  `credential_store.abort_auto_login_on_plaintext: true`) → 자동 로그인 중단,
  저장 위치·위험·logout/삭제 방법 안내.
- 비대화형 환경(`claude -p`, CI) → manifest `noninteractive_policy.login`에 따라
  deny 또는 guided manual (예: `GH_TOKEN`/`SUPABASE_ACCESS_TOKEN`은 사용자가 직접 설정).
- 사용자가 CLI 설치를 거부하거나 preflight 실패 → 위 라우터가 allowlisted 공식 MCP →
  visible Chrome → guided manual 순으로 낮춘다. login/CAPTCHA/MFA·최종 submit은 항상 사용자 몫.

## GitHub OAuth App (guided manual)

GitHub OAuth App 생성·callback 등록은 자동화하지 않고 콘솔 단계로 안내한다.
OAuth App은 callback URL을 하나만 지원하므로 local·preview·production 동시 등록을 약속하지 않고,
환경별 app 분리 또는 GitHub App 전환을 옵션으로 제시한다. Client ID/Secret 값은 사용자가
직접 콘솔에서 확인·입력하며 플러그인은 값을 받지 않는다.

## 부트스트랩 이후 (guided manual 예시)

- env 설정: 어떤 변수가 왜 필요한지 설명하고 `vercel env add NAME` 같은 **대화형 명령** 또는
  콘솔 화면을 안내한다. 실제 값은 사용자가 그 프롬프트/화면에 직접 입력한다.
- 리소스 생성·배포·삭제: 명령과 영향을 안내하고 사용자가 실행한다. 유료·production·삭제는
  특히 사용자 실행 원칙.
