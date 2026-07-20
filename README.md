# novice — 비개발자 입문자용 Claude Code 플러그인

*[English README](./README.en.md)*

비개발자 입문자가 Claude Code로 바이브 코딩을 시작할 때 실제 개발 용어와 학습 기회를 보존하고,
외부 서비스 CLI 설정을 안전한 범위에서 돕고, CLI 공포와 파괴·비용·시크릿 노출 위험을 줄이는
3단계 학습 동반자 플러그인입니다.

- 스펙: `docs/PRD.md` (revision 9)
- 최소 지원 런타임: Claude Code `2.1.215`
- 상태: MVP 구현 완료 — 테스트 123개 통과 (unit 8 + integration 3, 외부 dependency 0).
  실제 2.1.215 runtime에서 hook payload 캡처 + `--plugin-dir` live E2E 검증 완료.
  남은 것은 사람 참가자가 필요한 product beta 검증(concierge/moderated).

## 사용법

| 명령 | 동작 |
|---|---|
| `/novice:mode` | 현재 level, 적용 범위, 안전 게이트 유지 여부 표시 |
| `/novice:mode 1` | Level 1 (기본값) — 모든 용어에 설명 병기, 실행 전·후 해설 |
| `/novice:mode 2` | Level 2 — 첫 1회만 설명, 핵심 결정만 해설 |
| `/novice:mode 3` | Level 3 — 요청 시만 설명, 아키텍처·유저플로우 중심 |
| `/novice:mode off` | novice 톤·설명·시각화 완전 제거 (안전 게이트는 유지) |

자연어 별칭: 프롬프트 전체가 정확히 `novice 1|2|3|off`일 때만 모드가 바뀝니다.
`novice reset all` / `novice reset <용어>`로 설명 카운터를 초기화합니다.
"더 쉽게 설명해 줘" 같은 일반 문장은 현재 답변에만 영향을 주고 모드를 바꾸지 않습니다.

용어는 순화하지 않습니다. `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`처럼
실제 용어 뒤에 설명을 병기하고, 세션에서 충분히 노출된 용어(Level 1 기준 3회)는 설명을 걷어냅니다.

## 외부 서비스 CLI 부트스트랩 (2-tier)

자동화 경계는 두 tier 모두 **탐지 → 설치 → 로그인 → 인증 상태 확인까지**입니다.

- **Tier 1** (검토된 manifest: Vercel, GitHub CLI, Supabase): 고정 package coordinate로
  표준 승인 흐름 실행. 설치와 로그인은 각각 1회씩 승인받습니다.
- **Tier 2** (그 외 CLI): 공식 문서 URL·package coordinate·실행 argv를 화면에 그대로
  제시하고, 사용자가 근거를 확인·승인한 경우에만 같은 engine으로 진행합니다.
  공식 근거를 확인할 수 없으면 guided manual로 낮춥니다.

리소스 생성·env/secret 값 입력·배포는 **사용자가 직접** 하거나 guided manual로 안내합니다.
플러그인은 credential 값을 요청·보관·전달·자동입력하지 않습니다.
secure 저장소를 지원하는 CLI(gh, supabase)가 plaintext fallback으로 떨어지는 환경에서는
자동 로그인을 중단합니다. 파일 저장이 공식 기본 동작인 CLI(vercel)는 저장 위치와
logout 경로를 로그인 승인 전에 고지합니다 — provider별 정책은 manifest의
`credential_store`에 명시되어 있습니다.

## 안전 게이트 위협 모델

| 위협 | 동작 | 보증하지 않는 범위 |
|---|---|---|
| 로컬 파괴 명령 (`rm -rf`, PowerShell `Remove-Item` 등) | Bash·PowerShell 각각 유한 grammar 해석 후 deny/ask | 난독화, 새 명령, 플러그인 밖 실행 |
| Git history 파괴 (`push --force`, `reset --hard`, `clean`) | protected branch·범위 기준 deny/ask | 다른 Git client 작업 |
| DB/원격 리소스 삭제 (CLI·MCP) | 대상·환경 표시 후 ask, production 고위험 deny | 외부 콘솔 직접 작업 |
| 시크릿 commit | commit candidate tree 스캔 후 deny | 미지원 포맷, 암호화·난독화된 시크릿 |
| 시크릿 deploy·출력 노출 | 인자·파일 스캔 deny/ask, 출력 redaction | 이미 원격에 저장된 값 |
| 비용·반복 루프 | batch당 최대 1회 개입 안내 | 정확한 과금 계산, hard billing cap |

### 명시적 비보증 (No silent security claims)

- **범용 shell parser가 아닙니다.** Bash와 PowerShell 각각에 대해 단일 command + argv
  유한 grammar만 해석합니다 (Bash는 backslash escape, PowerShell은 backtick escape·backslash
  경로 규칙). pipe·리다이렉트·명령 치환·scriptblock 등 미지원 문법은 위험 token이 섞이면
  deny, 아니면 ask로 낮춥니다.
- **완전한 DLP·시크릿 관리자·악성 MCP 방어가 아닙니다.** 알려진 패턴 fixture 기준으로만 탐지합니다.
- **timeout fail-open 한계:** Claude Code가 hook timeout·강제 종료를 non-blocking으로
  처리하는 경우는 보증 범위 밖입니다. hook 내부 오류·모호성·입력 상한 초과는 deny(fail closed)합니다.
- **플러그인을 disable/uninstall하면 안전 게이트도 사라집니다.** "always-on"은 플러그인이
  활성화된 동안만 의미합니다. novice `off`는 학습층만 끄고 안전 게이트는 유지합니다.
- **Git은 tracked 로컬 파일만 보호합니다.** untracked/ignored 파일, 외부 DB, 배포 리소스는
  Git checkpoint로 복구되지 않습니다.

## 상태와 privacy

- 상태는 `${CLAUDE_PLUGIN_DATA}` 아래에만 저장합니다 (project override, 세션별 용어 카운터).
  plugin root에는 쓰지 않습니다.
- 상태 파일: atomic write, `0600`, symlink 거부, size cap. 세션 상태는 `/clear` 시 삭제, 30일 TTL.
- secret scanner는 후보 바이트를 메모리에서만 검사하고 원문을 로그·state·metric에 남기지 않습니다.
- bootstrap audit에는 service ID·manifest revision·단계·exit status만 저장합니다.
- 원격 telemetry를 보내지 않습니다.

## 개발

```bash
npm test                  # 전체 (unit + integration)
npm run test:unit
npm run test:integration
```

외부 runtime dependency 없음 (Node >= 18, node:test). 테스트 구성: unit 8개 파일
(config·state·mode·capsule·stop·grammar·secrets·batch·bootstrap), integration 3개 파일
(hooks-contract·safety-corpus·safety-mutation). 안전 gate는 mutation 하네스로도 검증합니다
— 위험 명령 35건을 106개 mutant로 변형해 detector 우회가 없음을 확인합니다.

`tests/fixtures/contract/`의 hook payload fixture는 Claude Code **2.1.215 실측 캡처**입니다
(provenance 필드로 캡처/파생/문서 구분 — 상세는 해당 디렉토리 README).
플러그인 자체도 같은 runtime에 `--plugin-dir`로 로드해 `/novice:mode` expansion →
상태 갱신 → capsule 주입까지 live E2E로 확인했습니다. 남은 미실측: `/clear`·compact의
SessionStart source 값, MCP destructive payload (headless로 트리거 불가).
