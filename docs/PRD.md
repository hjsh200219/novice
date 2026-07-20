---
status: pending approval
title: 비개발자 입문자용 Claude Code Novice 플러그인 PRD
date: 2026-07-20
revision: 8
mode: runtime 바이너리 검증 통과 + 2-tier 부트스트랩 절충 (manifest 자동 / 확인 후 진행, 개수 제한 없음)
owner: planner
reviewers: [architect, critic]
---

# 비개발자 입문자용 Claude Code Novice 플러그인 PRD

> 비개발자 입문자가 Claude Code로 바이브 코딩을 시작할 때 실제 개발 용어와 학습 기회를 보존하고,
> 외부 서비스 설정을 안전한 범위에서 대신하며, CLI 공포와 파괴·비용·시크릿 노출 위험을 줄이는
> 3단계 학습 동반자 플러그인.

---

## Executive Decision

### 설계 원칙

1. **Scaffold, don't substitute** — `commit`, `branch`, `environment variable` 같은 실제 기술 용어를 쉬운 말로 대체하지 않는다. 설명이 활성화된 레벨에서는 실제 용어 뒤에 한국어 설명을 병기하고, 익숙해지면 설명만 걷어낸다.
2. **Bootstrap with provenance, don't broker credentials** — 외부 서비스는 CLI의 탐지 → 설치 → 로그인까지만 AI가 돕고 CLI 개수는 제한하지 않는다. 검토된 manifest가 있는 CLI는 표준 승인 흐름으로, 그 외 CLI는 공식 근거(문서 URL·package coordinate)를 화면에 제시하고 사용자가 확인한 뒤에만 같은 engine으로 진행한다. 리소스 생성·env/secret 값 입력·배포는 사용자가 직접 하거나 guided manual로 안내한다. 플러그인은 credential 값을 요청·보관·전달·자동입력하지 않지만, 로컬 secret scanner는 유출 방지를 위해 후보 바이트를 메모리에서 검사할 수 있고 provider CLI는 자체 credential store에 인증 정보를 저장할 수 있다.
3. **Make state legible** — 진행 상태와 변경 결과를 레벨에 맞는 표 또는 체크리스트로 보여 준다. 매 응답에 표를 강제하지 않고, 긴 작업·분기·복구가 필요한 상황에 사용한다.
4. **Reversible where the boundary allows** — 로컬 파일은 Git 상태 확인과 체크포인트로 복구 가능성을 높인다. Git 밖의 DB·배포·브라우저 변경은 별도 검증과 rollback 절차를 둔다. “모든 변경을 되돌릴 수 있다”고 약속하지 않는다.
5. **User owns the dial** — Level 1·2·3과 novice off를 즉시 전환할 수 있다. off는 novice 톤·설명·시각화를 완전히 제거하며 사용자 output style을 건드리지 않는다.
6. **No silent security claims** — 안전 게이트의 위협 모델, 탐지 범위, 오탐·미탐 가능성을 사용자 문서와 테스트에 명시한다.
7. **Fail closed only where enforceable** — 안전 관련 hook은 지원 문법 안에서 오류·모호성·입력 상한 초과를 deny한다. 단, Claude Code가 hook timeout·프로세스 강제 종료를 non-blocking으로 처리하는 플랫폼 한계 때문에 절대적 fail-closed를 약속하지 않는다.

### 결정 요인

1. **완전 off와 기존 output style 보존이 최우선이다.** `force-for-plugin` output style은 플러그인이 활성화된 동안 사용자 설정을 계속 덮어쓰므로 novice off와 양립하지 않는다. 따라서 output style을 사용하지 않는다.
2. **강제 안전은 `PreToolUse`에서만 수행한다.** 파괴·시크릿·외부 부작용은 텍스트 권고가 아니라 `permissionDecision: deny|ask`로 막는다.
3. **가변 학습 동작은 현재 상태 capsule로 주입한다.** `UserPromptSubmit`은 짧은 현재 모드 지시만 주입하고, 각 capsule은 이전 novice 지시를 대체한다고 명시한다. off 전환 시에는 과거 capsule을 무효화하는 1회성 OFF tombstone을 주입한다. `SessionStart`의 `startup|resume|clear|compact` 경로에서도 최신 상태를 복구한다.
4. **플러그인 slash command는 namespace가 필수다.** 플러그인 이름을 `novice`, 제어 skill을 `mode`로 두고 실제 명령은 `/novice:mode 1|2|3|off`로 통일한다. 플랫폼이 지원하지 않는 unnamespaced `/novice`를 약속하지 않는다.
5. **외부 자동화는 코드 adapter가 아니라 declarative bootstrap manifest이며, 2-tier로 개수 제한을 없앤다.** Tier 1(검토된 manifest: 초기 vercel·gh·supabase)은 공통 engine이 설치 좌표·버전 확인·로그인·인증 상태 확인·logout/uninstall 절차를 표준 승인 흐름으로 실행한다. Tier 2(그 외 CLI)는 engine이 공식 문서 URL·package coordinate·credential 정책을 조사해 ad-hoc manifest로 화면에 제시하고, 사용자가 근거를 확인·승인한 경우에만 동일 engine·동일 grammar로 설치·로그인을 진행한다. 공식 근거를 확인할 수 없으면 guided manual로 낮춘다. 자동화 경계는 두 tier 모두 "설치·로그인까지"다.

### 검토한 선택지

| 선택지 | 구성 | 장점 | 단점 | 판정 |
|---|---|---|---|---|
| **A. Hook 단일 플러그인 + 2-tier manifest 부트스트랩** | hook 기반 학습·안전층 + 공통 engine + 검토 manifest(Tier 1)·사용자 확인 ad-hoc manifest(Tier 2) | 기존 output style 무침해, CLI 개수 무제한, 설치 좌표·인증 차이는 명시적 검증, credential broker 불필요 | manifest 등재·갱신 비용, Tier 2는 사용자가 근거를 판단해야 함 | **채택** |
| B. 안전 플러그인 + 학습 플러그인 분리 | 안전 core와 novice UX를 별도 설치 | 책임과 비활성화 경계가 가장 명확 | 설치·배포·업데이트가 2배, 입문자 설치 UX 악화 | P1 재검토 |
| C. `force-for-plugin` output style + hooks | 시스템 프롬프트에 학습 규칙 고정 | 압축 후에도 규칙 유지 | novice off 불가능, 사용자 output style 강제 덮어쓰기, faded와 상위 지시 충돌 | 기각 |

### ADR

- **Decision:** Hook 단일 플러그인 + 2-tier manifest 부트스트랩(credential broker 없음, CLI 개수 무제한).
- **Platform seam:** 최소 지원 버전은 Claude Code `2.1.215`다. 해당 runtime의 공식 hook 문서와 캡처 fixture를 계약 SSOT로 삼고, Agent SDK 타입 snapshot은 보조 증거로만 사용한다.
- **Safety seam:** `PreToolUse`는 플러그인이 활성화된 동안 novice level/off와 무관하게 동작한다.
- **Learning seam:** `SessionStart`·`UserPromptSubmit`·`UserPromptExpansion`·`Stop`은 novice mode와 세션별 용어 카운터를 담당한다. `PostToolUse`·`PostToolUseFailure`는 tool별 성공·실패 fingerprint를 기록하고, `PostToolBatch`는 병렬 batch 전체를 기준으로 개입 여부를 한 번만 판정·주입한다.
- **State seam:** 기계가 읽는 JSON을 SSOT로 사용한다. Markdown `SKILL.md`를 런타임 파싱하지 않는다.
- **Compaction:** `SessionStart(source=compact)`에서 현재 mode capsule을 다시 주입한다.
- **Off:** novice off 전환 turn에는 300자 이하 OFF tombstone을 한 번 주입해 과거 NOVICE_STATE·NOVICE_GLOSSARY를 무효화한다. 이후 turn부터 novice context를 새로 주입하지 않는다. 과거 transcript 자체는 삭제할 수 없으므로 같은 session의 출력이 fresh baseline과 완전히 같다고 보증하지 않는다.
- **Secret seam:** 플러그인은 credential 값을 요청·보관·전달·자동입력하지 않는다. 로컬 scanner는 commit/deploy 차단을 위해 후보 파일·인자를 메모리에서 읽되 원문을 로그·state·metric에 남기지 않는다. provider CLI가 저장하는 인증 정보는 manifest의 credential-store 정책으로 별도 검증하며 plaintext fallback이면 자동 로그인을 중단한다.
- **External bootstrap seam:** `setup-service` skill이 manifest-driven `resolve → preflight → plan → approve → apply → verify → recover` 흐름을 소유한다. `PreToolUse`는 실행 직전 안전 gate, `PostToolUse`는 출력 redaction과 결과 관찰, `PostToolBatch`는 batch 단위 개입을 담당한다. 그 이후 provisioning은 자동 실행하지 않는다.
- **Plugin disabled:** 사용자가 플러그인 자체를 disable/uninstall하면 `PreToolUse`를 포함한 모든 안전 게이트도 사라진다. “always-on”은 플러그인이 활성화된 동안만 의미한다.

---

## 사용자 원 요구와 커버리지

| # | 원 요구 | MVP 명세 | 검증 상태 |
|---|---|---|---|
| 1 | 개발 용어·기술 스택을 모르는 비개발자용 | 페르소나, Level 1 기본값, 단계별 해설 | 명세됨, beta 미검증 |
| 2 | 외부 서비스 설정을 AI가 대신, CLI > MCP > Chrome | 2-tier 부트스트랩(Tier 1 manifest 자동, Tier 2 근거 확인 후 진행 — 개수 무제한), 이후는 사용자 직접/guided manual | 명세됨, E2E 미검증 |
| 3 | 3단계 + 기본 Level 1 + off | `/novice:mode 1`, `2`, `3`, `off`; 명시적 자연어 별칭; OFF tombstone | 명세됨, contract test 미실행 |
| 4 | 필요 없어진 입문자 설명 제외 | 세션별 faded 카운터, 명시적 reset, 레벨 상승 | 명세됨, 학습 효과 미검증 |
| 5 | 실제 용어를 대체하지 않고 설명 병기 | canonical glossary와 level별 fade | 명세됨, 출력 일관성 미검증 |
| 6 | 순서·할 일을 표로 표시하고 완료 상태 구분 | 긴 작업·분기·복구 시 표/체크리스트 | 완화 명세, beta 미검증 |
| 7 | 인터넷·YouTube 조사·반영 | 공식 문서, 커뮤니티, YouTube 조사와 출처 표 | 조사 반영, 대표성 미검증 |

> 요구 2에서 MVP가 자동화하는 것은 CLI 부트스트랩(탐지·설치·로그인·인증 확인)이며 **CLI 개수 제한은 없다**. Tier 1(검토 manifest: Vercel·GitHub CLI·Supabase CLI)은 표준 승인으로, Tier 2(그 외)는 공식 근거를 사용자가 확인·승인한 뒤 같은 engine으로 진행한다. 공식 근거를 못 찾으면 guided manual. 리소스 생성·env 설정·배포 같은 provisioning은 사용자 직접 또는 guided manual로 남긴다. 즉 "AI가 설정을 전부 대신"이 아니라 "AI가 검증 가능한 설치·로그인 경로를 진행하고 나머지를 안내"하는 정직한 축소다.
>
> 요구 6의 “상시 표 표시”는 응답 팽창 상한(1.6배)과 초보자 피로를 이유로 “3단계 이상 작업·분기·위험·복구 시”로 의도적으로 완화했다. 원문(부록 B)과 다른 해석이며 beta 결과로 재검토한다.

---

## 1. 문제 정의

비개발자 입문자는 코딩 자체보다 다음 경계에서 더 자주 막힌다.

- 터미널에서 현재 위치·변경 상태·복구 방법을 알기 어렵다.
- DB·배포·OAuth 설정은 여러 서비스와 비밀값을 오가며 실패 지점을 찾기 어렵다.
- AI가 생성한 코드를 실행은 해도 아키텍처·유저플로우·비즈니스 로직을 이해하지 못해 후반 수정에서 멈춘다.
- 시크릿 커밋, 프로덕션 삭제, 반복 수정과 과도한 사용량을 사전에 판단하기 어렵다.

Novice는 Claude Code의 코딩 능력을 대체하지 않는다. 현재 상태를 설명하고, 학습에 필요한 실제 용어를 남기고, 알려진 위험 동작을 gate하며, 외부 설정의 검증 가능한 경로를 제공하는 보조층이다.

## 2. 목표, 성공 지표, 비목표

### 목표

- 비개발자가 첫 대화부터 현재 상태와 다음 행동을 이해한다.
- 기술 용어를 제거하지 않으면서 설명 의존도를 점진적으로 낮춘다.
- 외부 서비스 CLI 부트스트랩(탐지·설치·로그인·인증 확인)을 2-tier human-in-the-loop으로 완료하고, 이후 provisioning은 사용자가 직접 하도록 명확히 안내한다.
- 고정된 위협 모델 안에서 파괴·시크릿·외부 부작용을 실제 tool gate로 차단한다.
- novice mode를 세션 중 즉시 전환하고 off 시 표준 Claude Code 동작으로 돌아간다.

### MVP 성공 지표

제품 지표는 자동 원격 telemetry 없이 로컬 fixture와 동의한 moderated beta로 측정한다.

| 지표 | MVP 합격선 | 측정 방법 |
|---|---:|---|
| 사전 문제 적합성 | 주요 막힘 3개 중 2개 이상 재현 | 구현 전 n≥5 concierge test, baseline Claude Code 관찰 |
| 첫 안내 작업 효과 | baseline 대비 완료 시간 20% 이상 감소 또는 도움 요청 25% 이상 감소 | n≥20, 난이도가 비슷한 과제를 counterbalanced within-subject로 비교하고 paired difference·bootstrap CI 보고 |
| CLI 부트스트랩 완수율 | 참가자 80% 이상이 탐지·설치·로그인·인증 확인까지 완료 | Tier 1은 Vercel·`gh`·Supabase 중 2개 이상, Tier 2는 미등재 CLI 1개 시나리오로 측정; 기존 설치/로그인 상태 재실행 포함 |
| guided provisioning 완수율 | 참가자 70% 이상이 안내에 따라 env 이름·대상 환경 설정까지 완료 | bootstrap과 분리 측정; credential 값이 대화·argv·history·plugin data에 남지 않았는지 점검 |
| 핵심 용어 이해 | 즉시·24시간 후 정답률의 paired 차이 CI가 0을 넘고 사전 정의 효과크기 `d≥0.3` | `commit`·환경변수·preview deployment의 동형 문항, 효과크기와 bootstrap CI 보고 |
| 지원 문법 위험 fixture 탐지율 | 100% | versioned finite grammar의 단위·통합·mutation fixture |
| 지원 문법 benign 오탐률 | 10% 이하 | 지원 grammar 안의 안전한 명령·가짜 키 fixture |
| 미지원 문법 fallback 비율 | 대표 benign command corpus의 15% 이하 | 미지원 문법 ask/deny 건수와 이유를 별도 보고; 탐지율 분모에서 숨기지 않음 |
| mode 전환 정확도 | 1→2→3→off 전환 100% | hook 출력과 상태 파일 검사 |
| fresh off 구조 일치 | 새 session이 off로 시작하면 novice context 0건 | hook payload·transcript 구조 검사 |
| same-session off 억제 | 전환 turn OFF tombstone 1건, 이후 novice context 0건 | 전환 transcript fixture + 고정 prompt set의 novice artifact 검사; 출력 완전 동일은 비보장 |
| blocking hook 성능 | `UserPromptSubmit` p95 300ms, `PreToolUse` p95 250ms 이하 | 1천 turn fixture와 diff size 경계 benchmark; 초과 입력은 scan 대신 deny |
| 응답 팽창 | Level 1 median 길이 baseline의 1.6배 이하 | 각 prompt 반복 실행 후 분포 비교 |

### 비목표

- Claude Code 자체를 포크하거나 사용자 output style을 변경하지 않는다.
- 공식 근거 제시와 사용자 승인 없이는 어떤 CLI도 설치·로그인하지 않는다. 임의 MCP는 사용자 승인과 무관하게 자동 설치·설정하지 않는다.
- 사용자 대신 결제, 프로덕션 배포, 리소스 삭제, 약관 동의를 완료하지 않는다.
- Git을 전체 백업 또는 외부 서비스 rollback 수단으로 표현하지 않는다.
- 완전한 DLP, 시크릿 관리자, 악성 MCP 방어, shell parser를 제공한다고 주장하지 않는다.
- 장기 오개념 추적과 spaced repetition은 MVP에 포함하지 않는다.
- 사용자의 명시적 동의 없이 원격 usage telemetry를 수집하지 않는다.

## 3. 페르소나와 레벨

### 주 사용자

- 아이디어와 원하는 화면은 설명할 수 있지만 코드·Git·터미널·배포 용어는 모르는 기획자·디자이너·1인 창업자·학생.
- 목표는 문법 암기가 아니라 아키텍처, 유저플로우, 비즈니스 로직의 관계를 이해하며 수정 요청을 판단하는 상태다.

### 레벨별 동작

| 축 | Level 1 기본 | Level 2 | Level 3 | Off |
|---|---|---|---|---|
| 용어 설명 | 세션 첫 노출부터 임계값까지 병기 | 첫 1회 병기 | 요청 시만 설명 | novice 설명 없음 |
| 행동 해설 | 실행 전 무엇·왜, 실행 후 변경 결과 | 핵심 결정만 해설 | 아키텍처·유저플로우 중심 | novice 지시 억제; 과거 transcript 영향의 완전 제거는 비보장 |
| 시각화 | 3단계 이상 작업·분기·복구 시 표 | 중요 분기에서 표 | 요청 또는 위험 시 표 | novice 시각화 없음 |
| 비용 루프 | 낮은 임계값에서 개입 | 반복 감지 시 개입 | 명시적 이상 징후만 | novice 개입 없음 |
| 강제 안전 gate | 파괴·시크릿·외부 부작용 | 동일 | 동일 | 동일, 단 플러그인 활성 시에만 |

### mode 전환 UX

- 플러그인 namespace: `novice`.
- 실제 slash command: `/novice:mode 1|2|3|off`.
- `mode/SKILL.md`는 `disable-model-invocation: true`로 선언해 사용자가 직접 호출하는 제어 명령으로만 노출한다.
- 조회: `/novice:mode`는 현재 level, 적용 범위, 안전 gate 유지 여부를 보여 준다.
- 지속 상태를 바꾸는 자연어 별칭은 prompt 전체가 정확히 `novice 1|2|3|off`와 일치할 때만 인식한다(앞뒤 공백·마침표만 정규화). “더 쉽게 설명해 줘”, “이제 간단히” 같은 일반 문장은 현재 답변 요청으로만 취급하고 project mode를 바꾸지 않는다.
- unnamespaced `/novice`는 Claude Code 플러그인 namespace 규칙상 제공하지 않는다.
- mode 변경은 현재 프로젝트에 지속된다. `UserPromptSubmit`은 raw prompt가 `/novice:mode` exact command이면 기존 capsule 주입을 건너뛴다. 이어지는 `UserPromptExpansion`이 args를 검증·갱신하고 새 capsule 또는 OFF tombstone을 주입한다. 자연어 별칭은 `UserPromptSubmit`이 직접 갱신·주입한다. 따라서 hook 순서와 무관하게 같은 turn에 old/new capsule을 함께 넣지 않는다.

## 4. 기능 명세

### 4.1 용어 스캐폴딩과 faded 카운터 [P0]

- 기계가 읽는 `config/terms.json`을 초기 용어 사전 SSOT로 사용한다. 각 항목은 `term`, canonical 한국어 설명, aliases, category를 가진다.
- `SessionStart`가 novice active일 때 `terms.json`에서 생성한 5,000자 이하 `NOVICE_GLOSSARY`를 한 번 주입한다. off에서 active로 전환하거나 compaction 후에도 최신 glossary를 다시 주입한다. config 파일 자체를 모델이 임의로 읽는다고 가정하지 않는다.
- 설명이 활성화된 경우 glossary의 canonical 문구로 `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`처럼 실제 용어 뒤에 설명을 병기한다. glossary 밖 용어는 일반 설명은 가능하지만 자동 fade 카운터에는 포함하지 않는다.
- **novice 활성 규칙:** 쉬운 표현으로 실제 기술 용어를 대체하지 않는다. 설명이 활성화된 레벨에서만 실제 용어 + 설명을 병기하고, Level 3 또는 faded 이후에는 실제 용어만 쓴다. off에서는 novice가 용어 선택을 강제하지 않는다.
- `Stop` hook이 Claude Code 2.1.215에서 제공하는 `last_assistant_message`에서 canonical “용어+설명” 패턴만 세어 세션 카운터를 갱신한다. 방어적으로 필드가 없거나 `stop_hook_active=true`이면 갱신하지 않는다. 한 최종 응답에서 같은 용어는 여러 번 나와도 1회만 증가시키고, 직전 응답 hash로 즉시 중복 실행을 막는다. 사용자 입력, 코드 블록, 설명 없는 단순 노출은 카운트하지 않는다. 사용자 interrupt와 중간 assistant message는 P0 카운터에 반영되지 않는 한계로 공개한다.
- 세션 카운터는 `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>/state.json`에 저장한다. 같은 session을 resume하면 유지하고, `/clear` 또는 30일 TTL 만료 시 정리한다. 서로 다른 session 사이에 카운터를 합치는 장기 학습 상태는 P1이다.
- persistent reset은 prompt 전체가 `novice reset all` 또는 `novice reset <term|alias>`와 일치할 때만 수행한다. “X가 뭐예요”는 해당 turn에 설명을 다시 보여 주되 카운터를 영구 변경하지 않는다.
- fade 카운터는 **설명 노출량을 줄이는 휴리스틱일 뿐 숙달 판정이 아니다.** 이해도 성공 지표는 별도 회상 문항으로 측정하고, 사용자가 질문·혼란을 표시하면 faded 여부와 무관하게 현재 turn에서 다시 설명한다.
- 초기 사전과 임계값은 beta 결과로 조정한다. 사전 밖 용어는 자동 fade 대상이 아니며 모델에 일반 설명 규칙만 적용한다.

### 4.2 현재 mode capsule과 context 충돌 방지 [P0]

- `UserPromptSubmit`은 off가 아닐 때만 800자 이하의 현재 mode capsule을 주입한다. 단, raw prompt가 exact `/novice:mode` command이면 `UserPromptExpansion`에 처리를 넘기고 기존 capsule을 주입하지 않는다. glossary는 매 turn 반복하지 않는다.
- capsule에는 `schema_version`, 현재 `level`, 설명 대상/제외 용어, 시각화 조건과 다음 문장을 포함한다.

  > 이 NOVICE_STATE capsule은 이전 turn의 모든 NOVICE_STATE 지시를 대체한다. 다른 과거 level 지시는 무시한다.

- active→off 전환 turn에는 300자 이하 `NOVICE_STATE: OFF` tombstone을 주입해 이전 NOVICE_STATE·NOVICE_GLOSSARY를 무시하라고 명시한다. 이후 off turn에는 학습 관련 `additionalContext` 없이 종료한다.
- `SessionStart`는 `startup`, `resume`, `clear`, `compact`에서 active이면 현재 capsule과 glossary를, off이면 아무 novice context도 주입하지 않는다. resume 시 transcript에 active capsule이 남아 있는데 project state가 off라면 첫 model request에 OFF tombstone을 1회 주입한다. session state에 해당 `capsule_revision`, `glossary_revision`, `skip_next_submit=true`를 기록한다.
- 바로 이어지는 첫 `UserPromptSubmit`은 mode가 바뀌지 않았다면 중복 주입을 건너뛰고 flag를 해제한다. 이후 turn 또는 mode 변경 turn에는 최신 capsule을 주입한다. 한 model request에 같은 revision의 capsule을 두 번 넣지 않는다.
- runtime fixture에서 `UserPromptSubmit`과 `UserPromptExpansion`의 실제 호출 순서를 캡처한다. 순서가 바뀌어도 slash prompt skip + expansion-owned injection contract가 유지돼야 한다.
- 10,000자 hook 출력 상한은 개별 출력 상한으로만 취급한다. capsule 800자, OFF tombstone 300자, glossary 5,000자 상한을 각각 적용한다. 과거 주입이 transcript에 남고 삭제할 수 없다는 전제에서 각 payload를 짧고 명시적으로 versioning한다.
- 현재 Claude Code의 `UserPromptSubmit` command hook timeout은 30초지만, hook 내부에서는 network call을 금지하고 제품 성능 목표인 p95 300ms를 적용한다.
- 매 turn 전체 transcript를 다시 파싱하지 않는다. 용어 카운터는 `Stop.last_assistant_message`와 세션 상태 파일로 증분 처리한다.

### 4.3 외부 서비스 CLI 부트스트랩 [P0]

provider별 executable adapter는 두지 않는다. 공통 engine이 version 관리되는 **bootstrap manifest**를 읽으며, CLI 개수 제한 없이 2-tier로 동작한다. 자동화 경계는 두 tier 모두 **"CLI 탐지 → 설치 → 로그인 → 인증 상태 확인"까지**이고, 그 이후(리소스 생성·env/secret 설정·배포)는 사용자가 직접 하거나 guided manual로 안내한다.

- **Tier 1 — 검토된 manifest** (`vercel`, `gh`, `supabase`로 시작): repo에 동봉된 version 관리 manifest로 표준 승인 흐름 실행.
- **Tier 2 — 사용자 확인 ad-hoc manifest** (그 외 모든 CLI): engine이 공식 문서 URL·package coordinate·credential 정책을 조사해 같은 schema의 ad-hoc manifest를 만들고, **근거 출처와 실행할 argv를 화면에 그대로 보여 준 뒤 사용자가 승인한 경우에만** 동일 engine·동일 grammar로 실행한다. 공식 근거(공식 docs 도메인, 공식 registry 게시자)를 확인할 수 없으면 설치·로그인을 진행하지 않고 guided manual로 낮춘다.

#### bootstrap manifest contract

각 manifest는 다음 필드를 가진다.

| 필드 | 의미 |
|---|---|
| `service_id`, `binary`, `docs_url` | 서비스 식별자, 실제 실행 파일, 공식 근거 |
| `installers[]` | OS·package manager별 고정 package coordinate, 설치 명령 argv, 최소/검증 version |
| `detect`, `version_check` | read-only 설치·version 확인 argv와 성공 판정 |
| `auth_status`, `login`, `logout` | provider별 인증 확인·대화형 로그인·복구 argv와 성공 판정 |
| `credential_store` | secure storage 전제, 알려진 plaintext fallback, 자동화 중단 조건 |
| `uninstall`, `side_effects` | 설치·로그인이 남기는 전역 변경과 되돌리기 안내 |
| `noninteractive_policy` | `claude -p`·CI에서 login을 금지하거나 guided manual로 낮추는 규칙 |

- manifest는 공식 문서 URL과 검토 일자를 포함해 version 관리한다. runtime에서 모델이 임의 package 이름·로그인 명령을 만들어 자동 실행하지 않는다.
- `curl | bash`, 원격 script 직접 실행, shell string 조립은 금지한다. exec-form argv로 한 명령씩 실행한다.
- Tier 2 CLI는 read-only 탐지는 자유롭게 수행하되, 설치·로그인은 ad-hoc manifest(근거 URL·coordinate·argv)를 사용자에게 보여 주고 승인받기 전에는 실행하지 않는다. 사용자 승인 없이 자동 실행되는 것은 Tier 1 manifest의 표준 승인 흐름뿐이며, 그 승인도 설치·로그인 각 1회씩 받는다.

#### 공통 실행 상태 머신

1. **resolve** — 서비스 요청을 Tier 1 manifest에 deterministic하게 매핑한다. 미등재면 Tier 2 ad-hoc manifest 조사로 전환하고, 공식 근거를 확인할 수 없거나 사용자가 승인하지 않으면 guided manual로 낮춘다.
2. **preflight** — 설치 여부·version·기존 인증 상태·credential store 지원·interactive 환경을 read-only로 확인한다. 이미 인증됐으면 login을 재실행하지 않는다.
3. **plan/approve** — 설치 위치, 전역 변경, 인증 저장 위치, 실행할 argv, logout/uninstall 복구 방법을 보여 주고 설치와 로그인 각각 한 번의 사용자 승인을 받는다.
4. **apply** — 승인된 manifest argv만 실행한다. 브라우저·device flow·MFA는 사용자가 직접 완료하며 credential 값을 대화·tool argv·shell history에 입력하도록 요구하지 않는다.
5. **verify** — manifest의 version check와 auth status로 설치·로그인 결과를 각각 검증한다.
6. **recover** — 실패 시 완료된 단계, 남은 전역 파일·credential, 재시도·logout·uninstall 명령을 보고한다. 자동 logout/uninstall은 하지 않는다.

#### 부트스트랩 이후 (사용자 직접 / guided manual)

- **리소스 생성·연결·배포·삭제:** 자동 실행하지 않는다. 무엇을·왜·어느 명령으로 하는지 단계별로 안내하고 사용자가 실행한다. 유료·production·삭제는 특히 사용자 실행을 원칙으로 한다.
- **env/secret 설정:** 플러그인이 credential 값을 받지 않는다. 어떤 변수가 왜 필요한지, 어느 CLI 대화형 명령(`vercel env add …`)이나 어느 콘솔 화면에 넣는지 안내하고, 실제 값 입력은 사용자가 직접 한다. 값을 대화·tool argv·shell history에 넣지 않도록 경고한다.
- local secret scanner는 유출 방지를 위해 후보 바이트를 메모리에서 검사할 수 있지만 원문을 저장·출력하지 않는다. provider CLI 자체 credential 저장은 bootstrap manifest의 `credential_store` 정책과 미보장 범위에 포함한다.
- 이 경계 덕분에 provider별 secret broker와 executable adapter는 필요 없지만, provider별 명령·저장 방식 검증은 manifest에서 사라지지 않는다.

#### 공통 engine의 한계 (정직 표기)

- 실행 engine은 공통이지만 package coordinate·로그인·검증·credential storage는 provider별 manifest 데이터다. "모든 CLI 서비스로 자동 일반화"를 주장하지 않는다.
- `vercel rm`, `supabase db reset` 같은 위험 verb도 manifest/safety rule에 등재된 것만 provider-aware하게 차단한다. Tier 2 CLI는 유한 shell grammar와 일반 위험 패턴 범위만 보증하며, 이 차이를 승인 UI에 표시한다.
- credential broker를 제거해 플러그인이 env 값을 직접 다루는 면적은 줄지만, CLI가 인증 토큰을 생성·저장하는 위험까지 0이 되지는 않는다.
- **"AI가 대신"의 축소:** 원 요구 2 대비, 부트스트랩까지만 자동이고 provisioning은 사용자 몫이다.

#### MCP·Chrome 경로 (선택)

- capability별 우선순위는 CLI → allowlisted 공식 MCP → visible Chrome → guided manual이다. CLI 설치를 사용자가 거부하거나 manifest preflight가 실패하면 다음 경로로 낮춘다.
- MCP는 서비스 제공자가 공식 배포하고 runtime에서 식별 가능한 server·tool schema·권한·transport만 `service-capabilities.json` allowlist에 고정한 것만 사용한다. provenance를 hook input에서 검증할 수 없으면 자동 실행 대상에서 제외한다.
- Chrome fallback은 공식 Claude in Chrome beta를 visible mode로만 사용하고, 미연결·제3자 provider 환경이면 guided manual로 낮춘다. login/CAPTCHA/MFA와 최종 submit은 사용자가 직접 한다.

#### CLI 부트스트랩 acceptance scenario (Vercel 예시)

1. Vercel manifest로 `vercel` 존재·version과 `vercel whoami`를 read-only 확인한다.
2. 미설치면 manifest의 공식 package coordinate, 전역 변경, uninstall 경로를 보여 주고 승인 후 설치한다.
3. 미인증이면 credential 저장 정책과 `vercel logout` 복구 경로를 보여 주고 승인 후 `vercel login`을 실행한다. 사용자가 인증을 완료한 뒤 `vercel whoami`로 확인한다.
4. 중간 실패 시 완료 단계와 잔여 상태를 보고하고 자동 삭제·logout하지 않는다. 재실행 시 완료된 설치·로그인 단계를 건너뛴다.
5. 이후 project 생성·env 설정·배포는 안내만 하고 **사용자가 실행**한다. env 값은 사용자가 직접 입력하며 플러그인은 값을 받지 않는다.
6. 같은 engine이 코드 변경 없이 `gh` manifest의 `gh auth login`/`gh auth status`와 Supabase manifest의 로그인·저장소 정책을 수행함을 확인한다. plaintext credential fallback 환경에서는 자동 로그인을 중단한다.

#### GitHub OAuth 안내 (guided manual)

- GitHub OAuth App 생성·callback 등록은 자동화하지 않고 콘솔 단계 안내로 처리한다.
- GitHub OAuth App은 callback URL을 하나만 지원하므로 local·preview·production 동시 등록을 약속하지 않고, 환경별 app 분리나 GitHub App 전환을 안내 옵션으로 제시한다.

### 4.4 진행 시각화 [P0]

- Level 1에서는 3단계 이상 작업, 외부 서비스 설정, 위험 작업, 실패 복구에 표 또는 체크리스트를 사용한다.
- 짧은 답변이나 단일 명령에는 표를 강제하지 않는다.
- 상태 기호는 `[x]` 완료, `[~]` 진행, `[ ]` 대기로 통일한다.
- 경로가 중요한 경우 현재 project root와 변경 대상 파일을 보여 준다. 파일이 없는 개념 설명에는 “지금 어디에 무슨 파일”을 억지로 출력하지 않는다.
- 수정 요청 후에는 “무엇이 왜 바뀌었나”를 한 줄로 설명한다.

### 4.5 안전 게이트와 위협 모델 [P0]

#### 보호 범위

| 위협 | 관찰 지점 | P0 동작 | 보증하지 않는 범위 |
|---|---|---|---|
| 로컬 파괴 명령 | `PreToolUse`의 Bash·PowerShell command | 유한 grammar로 해석한 고위험 패턴 deny/ask | 난독화·새 명령·플러그인 밖 실행 |
| Git history 파괴 | `git push --force`, reset/clean 계열 | protected branch·범위에 따라 deny/ask | 다른 Git client에서 실행한 작업 |
| DB/원격 리소스 삭제 | CLI 및 `mcp__.*` tool name/input | 대상·환경 표시 후 ask, production 고위험은 deny 기본 | 외부 콘솔에서 직접 수행한 작업 |
| 시크릿 commit | commit 직전 index/worktree scan | known-secret scanner와 fixture로 deny | 미지원 포맷, 암호화·난독화된 시크릿 |
| 시크릿 deploy | deploy tool/CLI 인자와 대상 파일 scan | known pattern이면 deny/ask | 이미 원격에 저장된 값, 모델 provider·transcript 노출 |
| 비용·반복 루프 | `PostToolUse`·`PostToolUseFailure` tool별 fingerprint + `PostToolBatch` batch 판정 | batch당 최대 1회 novice 개입(`additionalContext`) | 정확한 과금 계산·hard billing cap |

#### 정책

- `ask`: 사용자가 대상·영향·복구 방법을 보고 합리적으로 승인할 수 있는 가역 또는 제한적 작업.
- `deny`: 홈·프로젝트 전체 삭제, production DB destructive query, raw secret 포함 commit/deploy처럼 초보자 플러그인이 안전하게 승인시킬 수 없는 작업.
- P0의 `ask` 승인은 해당 tool call 한 번에만 유효하다. session-wide allow 또는 패턴 영구 예외는 제공하지 않는다.
- `claude -p`에서 사용자 입력이 필요한 작업은 guided manual 또는 deny로 낮춘다. hook input의 `permission_mode`만으로 비대화형 여부를 단정하지 않는다. `permissionDecision: defer`는 Claude Code 2.1.215에 존재하지만 P0 상태 머신에 필요하지 않아 사용하지 않는다.
- 안전 hook의 JSON 오류·예외·입력 상한 초과는 exit 2/deny로 처리한다. 미지원 문법은 일반 명령이면 ask, 파괴·deploy·secret 관련 token이 섞이면 deny한다. 플랫폼이 timeout·강제 종료를 non-blocking으로 처리하는 경우는 제품 보증 범위에서 제외한다.
- 고정 패턴 목록, protected branch 목록, secret fixture와 benign fixture를 version 관리한다.
- MVP secret detector는 `safety-rules.json`의 고정 패턴과 entropy 보조 규칙으로 구현하며 새 외부 dependency를 추가하지 않는다. 후보 바이트는 process memory에서만 검사하고 원문을 stdout/stderr/state/metric에 남기지 않는다. 전문 secret scanner 연동은 P1 후보로 둔다.
- commit 시 시크릿 스캔은 지원하는 commit 문법별 candidate tree를 계산한다. 일반 commit은 index, `-a`는 tracked worktree, pathspec commit은 resolved pathspec만 검사하며 unborn HEAD·binary·복잡한 옵션은 deny/ask로 낮춘다. 무조건 `git diff HEAD`를 전체 스캔하는 방식은 사용하지 않는다.
- `PreToolUse` sibling hooks는 함께 실행될 수 있으므로 다른 hook의 deny가 side effect hook 실행을 막는다고 가정하지 않는다.
- novice off에서도 위 정책은 유지된다. 플러그인을 disable/uninstall하면 유지되지 않는다.

#### 지원 command grammar와 입력 상한

- P0는 범용 shell parser를 제공하지 않는다. Bash와 PowerShell 각각에 대해 **단일 command + argv**의 유한 lexical grammar만 지원한다: 공백 분리, 따옴표 literal, escape, flag, `--`, 명시적 path argument.
- shell control operator(`;`, newline, `&&`, `||`, pipe, redirect), command/process substitution, heredoc, `eval`, nested shell, unescaped glob은 미지원이다. bootstrap engine은 항상 exec-form argv와 한 번에 한 명령을 사용하므로 이 grammar 안에 머문다.
- Git은 `commit`, `push`, `reset`, `clean`의 versioned subgrammar를 별도 정의한다. 일반 commit, `-a`, resolved pathspec만 candidate tree를 계산하고 그 밖의 조합은 ask/deny로 낮춘다.
- shell command 입력은 64 KiB, scan 대상 단일 파일은 1 MiB, 한 tool call의 총 candidate bytes는 5 MiB로 제한한다. 상한을 넘으면 일부만 scan하지 않고 deny하며 이유와 안전한 분할 방법을 보여 준다.
- fixture corpus는 지원 grammar, 미지원 benign, 미지원 dangerous를 분리한다. 미지원 문법을 탐지율 분모에서 제외하더라도 fallback 비율은 별도 제품 지표로 공개한다.

#### target·environment 분류

- 외부 target은 `development | preview/staging | production | unknown`으로 분류한다. 신뢰 입력은 manifest의 target flag, 검증된 project metadata, project override의 고정 resource ID, protected branch뿐이다. 자연어의 “아마 dev”만으로 등급을 낮추지 않는다.
- built-in protected branch는 `main`, `master`, `production`, `release/*`이며 project override로 추가만 할 수 있다. 제거는 P0에서 지원하지 않는다.
- destructive operation은 production과 unknown에서 deny, preview/staging과 local development에서 대상·영향·복구 경로가 계산될 때만 ask다. 분류 불가한 외부 write는 guided manual로 낮춘다.
- provider-aware 위험 verb와 target flag는 bootstrap manifest 또는 `service-capabilities.json`에 version 관리한다. Tier 1 manifest 밖 CLI에는 generic grammar 보증만 적용됨을 승인 UI에 표시한다.

#### Git 안전 시작

- 첫 file write 전 `git rev-parse`, `git status --short`, repository root를 확인한다.
- Git이 없으면 `git init`의 효과를 설명하고 실행 전 확인한다. 자동 initial commit은 하지 않는다.
- `.gitignore`와 known-secret scan을 통과한 뒤에만 초기 checkpoint를 제안한다.
- 이미 변경이 있는 repository에서는 사용자 변경을 임의 stage/commit/stash하지 않는다.
- Git은 tracked local files만 보호한다. untracked/ignored 파일, 외부 DB, 배포 리소스는 별도 rollback 대상으로 표시한다.

### 4.6 상태와 privacy [P0]

- 설치 기본값은 `plugin.json userConfig`의 `default_level=1`, `novice_enabled=true`다. custom option인 `novice_enabled`와 플러그인 자체 enable/disable을 구분한다. userConfig는 사용자 범위 기본값으로만 사용한다.
- 프로젝트별 override는 `${CLAUDE_PLUGIN_DATA}/projects/<project-root-hash>.json`에 저장한다.
- 세션별 용어 카운터는 `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>/state.json`에 저장한다. 병렬 tool hook은 공유 파일을 갱신하지 않고 `events/<tool_use_id>.json`을 atomic create하며, `PostToolBatch`가 이를 한 번 집계·삭제한다.
- 상태 파일은 symlink 거부, 경로 검증, size cap, atomic write, `0600`을 적용한다.
- `${CLAUDE_PLUGIN_ROOT}`에는 상태를 저장하지 않는다.
- bootstrap audit state에는 service ID, manifest revision, 완료 단계, exit status만 저장한다. argv 원문, tool output, credential 값은 저장하지 않는다. provider CLI의 자체 credential store는 plugin data와 별개이며 manifest preflight에서 위치·fallback 위험을 사용자에게 보여 준다.
- MVP는 원격 telemetry를 보내지 않는다. beta 지표는 참가자 동의 후 익명 aggregate로 별도 수집한다.
- raw prompt, source code, secret 값은 metric payload에 포함하지 않는다.

## 5. 플러그인 아키텍처

### 디렉토리 구조

```text
novice/
  .claude-plugin/
    plugin.json
  hooks/
    hooks.json
  skills/
    mode/
      SKILL.md                # /novice:mode 1|2|3|off 안내와 결과 메시지
    setup-service/
      SKILL.md                # manifest-driven bootstrap state machine
  config/
    levels.json               # level별 기계 규칙 SSOT
    terms.json                # 용어 사전 SSOT
    safety-rules.json         # 위험 패턴·정책 SSOT
    service-capabilities.json # 작업별 CLI/MCP/Chrome capability
    bootstrap-manifests/
      vercel.json             # install/auth/status/recover declarative contract
      github-cli.json
      supabase.json
  scripts/
    bootstrap-engine.*
    session-start.*
    user-prompt-submit.*
    user-prompt-expansion.*
    pre-tool-use.*
    post-tool-use.*
    post-tool-use-failure.*
    post-tool-batch.*
    stop.*
    session-end.*
    state.*
  tests/
    fixtures/
    unit/
    integration/
    e2e/
```

### hook 책임

| hook | 책임 | 주요 출력/부작용 |
|---|---|---|
| `SessionStart` | startup/resume/clear/compact에서 현재 상태 복구 | active일 때 mode capsule |
| `UserPromptSubmit` | 자연어 전환, reset, 중복 방지; exact slash prompt는 capsule skip | 자연어 경로 state 갱신 + 필요 시 `additionalContext` |
| `UserPromptExpansion` | `command_name`(`novice:mode`)과 args를 deterministic하게 처리 | valid면 state 갱신 + 새 capsule/tombstone, invalid면 `decision: block` + 허용 값 안내 |
| `PreToolUse` | 파괴·시크릿·외부 부작용 gate | `permissionDecision`의 deny·ask |
| `PostToolUse` | 성공 fingerprint 기록 + Bash/MCP output secret redaction | `updatedToolOutput`로 모델 전달 전 출력 대체, tool ID별 임시 event 기록 |
| `PostToolUseFailure` | 실패 fingerprint와 오류 유형 기록 | tool ID별 임시 event 기록 |
| `PostToolBatch` | 성공·실패가 섞인 batch 전체 반복 판정 | single-writer 집계, batch당 최대 1회 `additionalContext` 개입 |
| `Stop` | 최종 응답의 설명 패턴을 증분 count | session counter 갱신 |
| `SessionEnd` | session cache lifecycle 관리 | `clear`면 삭제, resume 가능한 session은 TTL까지 보존 |

### 설정 우선순위

`project override in CLAUDE_PLUGIN_DATA → userConfig default → built-in default(Level 1)`

- project/local `settings.json`의 `pluginConfigs`를 우선순위에 넣지 않는다. 최신 Claude Code에서 plugin userConfig는 user/managed settings 경로만 읽는다는 제약을 따른다.
- 자연어 전환과 `/novice:mode`는 동일한 state writer를 사용한다.

## 6. 구현과 완료 기준

> 구현은 단계를 나누지 않고 **전체 기능을 한 번에 개발**한다(사용자 결정, revision 5). 아래 완료 기준은 순차 gate가 아니라 배포 판정용 단일 체크리스트이며 영역별로 묶었을 뿐이다. 단, 플랫폼 contract fixture 캡처(A)는 나머지 구현의 전제이므로 착수 직후 가장 먼저 수행한다.

**산출물 (일괄)**

- `plugin.json`, `hooks/hooks.json`, 전체 hook scripts, `config/*.json` schema, 2-tier bootstrap engine(Tier 2 ad-hoc manifest 생성·승인 UI 포함)·검토 manifest 3개, `skills/`, `tests/` 전부.
- Claude Code 최소 지원 version `2.1.215`, 공식 문서 링크, 해당 runtime에서 캡처한 hook payload/output fixture, 보조 SDK 타입 snapshot.

### 완료 기준 A — 플랫폼 contract

- plugin skill이 `/novice:mode` namespace로 노출된다.
- Claude Code 2.1.215에서 `UserPromptExpansion`의 `expansion_type`, `command_name`, `command_args`, `command_source`, `prompt` payload fixture를 캡처한다. `command_name=novice:mode`를 매칭하고 valid args만 state에 반영한다.
- `UserPromptSubmit`과 `UserPromptExpansion`의 실제 순서를 캡처하고, exact slash prompt에서 submit hook은 old capsule을 생략하며 expansion hook만 새 capsule/tombstone을 주입함을 검증한다.
- invalid args는 state를 변경하지 않고 `decision: block`과 허용 값 안내를 반환해 expansion 자체가 모델에 도달하지 않음을 검증한다.
- `PostToolBatch`가 병렬 batch마다 한 번 호출되고, `PostToolUse.updatedToolOutput`이 Bash와 MCP output을 모델 전달 전에 대체함을 runtime fixture로 검증한다.
- `SessionStart(source=compact)`가 현재 state를 다시 주입한다.
- novice mode on/off와 plugin enable/disable 모든 경로에서 사용자 output style 설정이 변경되지 않는다.
- `${CLAUDE_PLUGIN_DATA}`에 project/session state가 생성되고 plugin root에는 쓰지 않는다.

### 완료 기준 B — mode·용어 core

- `/novice:mode 2`와 자연어 “novice 2”가 같은 state writer를 호출한다.
- `mode/SKILL.md`는 model invocation이 비활성화되어 있고, 사용자 직접 slash 경로만 상태를 바꾼다.
- invalid args는 state 변경 없이 expansion이 block되고 사용 가능한 값만 사용자에게 보여 준다.
- 자연어 별칭·reset trigger fixture에서 고정 목록 밖 문장은 mode·카운터를 변경하지 않는다.
- 1→2→3→off 전환 후 다음 turn capsule이 정확하고, off 전환 turn에는 OFF tombstone 1건 이후 novice context가 0건이다.
- slash 전환 turn에는 old/new capsule이 동시에 존재하지 않고 새 revision만 1건이다.
- 각 capsule은 이전 NOVICE_STATE를 대체한다고 명시하며 800자 이하다.
- 한 model request에 같은 `capsule_revision`이 중복 주입되지 않는다.
- compact/resume 후 현재 level만 재주입된다.
- `Stop.last_assistant_message`로 용어+설명 노출만 count하고 전체 transcript는 재파싱하지 않는다. 필드 부재나 `stop_hook_active=true`의 방어 fixture에서는 카운터를 건드리지 않는다.
- reset, session cleanup, 사전 밖 용어, code block 오탐 fixture가 통과한다.
- session 종료 후 같은 session을 resume하면 카운터가 유지되고, `/clear` 또는 TTL 만료 시 정리된다.
- state 파일 symlink, oversized input, concurrent write test가 통과한다.

### 완료 기준 C — 안전 gate

- 위험 fixture는 `PreToolUse` 반환값으로 실제 deny/ask된다.
- hook 예외·잘못된 JSON·oversized input은 deny되고, 미지원 shell 문법은 위험 token 유무에 따라 ask/deny로 낮아지며 timeout 한계는 보증 범위에 표시된다.
- novice off에서도 동일하게 동작하고 plugin disable 시 hook이 사라짐을 문서화한다.
- Bash·PowerShell 유한 grammar와 Git subgrammar의 versioned corpus에서 `git commit`, `git commit -am`, path commit, deploy CLI, `mcp__.*` destructive tool fixture를 포함한다.
- secret fixture 탐지율 100%, 지원 grammar benign 오탐률 10% 이하, 미지원 benign fallback 15% 이하를 충족한다.
- production/unknown destructive deny, staging/development ask, protected branch 추가-only override fixture가 통과한다.
- Bash·MCP tool output에 known secret fixture가 있으면 `updatedToolOutput`으로 모델 전달 전 redaction되고 원문이 state·metric에 남지 않는다.
- Git 미초기화/dirty/untracked/ignored 상태별 안내와 동작이 다르다.
- Git 밖의 변경은 checkpoint로 보호된다고 표시하지 않는다.
- 성공·실패가 섞인 병렬 tool 결과와 반복 수정 fixture에서 `PostToolUse`·`PostToolUseFailure` event가 tool ID로 기록되고 `PostToolBatch`가 single-writer로 한 번 집계한다. 임계값을 넘겨도 batch당 개입 문구는 1건이며 novice off에서는 주입되지 않는다.

### 완료 기준 D — 외부 서비스 CLI 부트스트랩

- bootstrap manifest schema가 공식 URL, 고정 package coordinate, detect/version/auth/login/logout/uninstall, credential-store, noninteractive policy를 필수로 검증한다.
- 공통 engine이 Vercel·`gh`·Supabase manifest에서 `resolve→preflight→plan→approve→apply→verify→recover`를 코드 변경 없이 수행한다.
- 기존 설치·인증 상태에서는 side effect 없이 완료 단계를 건너뛰며, 부분 실패 후 재실행도 중복 설치·로그인을 하지 않는다.
- 부트스트랩 이후 리소스 생성·env 설정·배포는 플러그인이 자동 실행하지 않고 사용자 실행을 안내한다.
- 플러그인이 credential 값을 요청·저장·전달·자동입력하지 않음을 확인한다. env 설정 시나리오에서 값이 대화·tool argv·shell history·plugin data에 남지 않고 scanner 원문도 로그되지 않는다.
- secure credential store가 없거나 provider가 plaintext fallback을 선택하려는 fixture에서는 자동 로그인을 중단하고 저장 위치·logout·삭제 안내를 보여 준다.
- Tier 2 fixture: 미등재 CLI에서 ad-hoc manifest(근거 URL·coordinate·argv)가 화면에 제시되고, 사용자 승인 시에만 동일 engine으로 설치·로그인이 진행되며, 승인 거부·공식 근거 미확인 시 guided manual로 넘어간다.
- 로그인/CAPTCHA/MFA는 사용자가 직접 완료한다.
- MCP allowlist 밖 server와 미검증 provenance는 자동 실행되지 않는다. Chrome 미지원 환경에서 guided manual로 정상 downgrade한다.

### 검증 — product beta (구현 완료 후)

- 사전 문제 적합성 concierge test(n≥5)를 먼저 수행하고, 이후 n≥20 moderated beta를 수행한다.
- baseline 대비 효과크기·paired difference·bootstrap CI를 산출하고 합격선 미달 지표마다 원인·수정·재측정 계획을 기록한다.
- raw prompt/code/secret을 수집하지 않았음을 점검한다.
- Level 1 응답 팽창과 hook latency가 합격선을 충족한다.

### P1/P2 후보

- P1: 교차 세션 용어 학습, statusline nudge, 비용 preview, 안전 core 분리 플러그인 실험, 추가 OAuth provider.
- P2: spaced repetition, 오개념 추적, 예제 discovery, 장기 학습 진도.

## 7. 리스크와 완화

| 리스크 | 영향 | 완화·검증 |
|---|---|---|
| 과거 `additionalContext`와 현재 level 충돌 | 잘못된 톤·설명 | 짧은 versioned capsule, 명시적 supersession, 전환 transcript fixture |
| off 전환 후 과거 capsule 잔존 | fresh baseline과의 출력 차이 | 전환 turn OFF tombstone, same-session 완전 동일성은 비보장으로 명시 |
| hook context 누적 비용 | 긴 세션 비용 증가 | 800자 cap, 동일 prompt baseline 비교, p95 latency 측정 |
| 안전 패턴 우회 | 과신과 실제 사고 | 위협 모델·미보장 범위 공개, deny fixture 지속 확장 |
| hook crash/timeout fail-open | 위험 tool 실행 | 지원 문법·입력 크기 제한, 예외 exit 2, timeout 한계를 안전 보증에서 제외 |
| model secret 노출 | credential 유출 | 값 요청·전달·저장 금지, `updatedToolOutput` redaction, env 입력은 사용자 직접, 원문 없는 scanner 로그 |
| provider CLI plaintext credential fallback | 로컬 credential 노출 | manifest preflight에서 storage 지원 확인, plaintext fallback이면 자동 login 중단, 위치·logout·삭제 안내 |
| package name·설치 경로 환각/typosquat | 공급망 침해 | Tier 1은 versioned manifest의 고정 coordinate만 실행. Tier 2는 공식 근거 출처·coordinate·argv를 사용자에게 그대로 제시하고 승인 없이는 실행하지 않음. 초보자가 근거를 판단 못 할 위험은 잔존 리스크로 문서화 |
| secret scanner 오탐 | 정상 commit/deploy 방해 | benign fixture와 10% 오탐 상한, 탐지 이유·안전한 수정 경로·false-positive 보고 절차 표시 |
| Git checkpoint 과신 | 외부/미추적 데이터 손실 | tracked 범위 표시, 외부 리소스는 별도 rollback 대상으로 표시 |
| 브라우저 beta/계정 제약 | Chrome fallback 불가 | prerequisite 검사, guided manual downgrade |
| MCP prompt injection | 악성 지시·데이터 유출 | allowlist, 출처·권한 표시, 임의 MCP 자동 설치 금지 |
| 서비스 CLI 변경 | 부트스트랩 파손 | manifest 검토 일자·최소 version·contract test, 공식 문서 기반 update |
| Tier 1 밖 CLI 파괴 명령 누락 | 위험 명령 미차단 | provider-aware 차단은 Tier 1 manifest만, Tier 2는 generic grammar 보증 범위와 미보장을 승인 UI에 표시 |
| 반복 실패·병렬 state race | 비용 증가·counter 손상 | tool ID event 기록 + `PostToolBatch` single-writer 집계와 concurrency fixture |
| namespace 혼동 | `/novice`가 안 됨 | 설치 직후 `/novice:mode`를 보여 주고 자연어 별칭 제공 |
| 상태 파일 손상·경쟁 | 잘못된 mode | atomic write, schema validation, lock/concurrency test |
| 자연어 전환·reset trigger 오탐 | 의도치 않은 mode 변경, 설명 재활성화 | 고정 trigger 목록 deterministic 매칭, 전환 직후 되돌리기 안내, 목록 밖 문장 무반응 fixture |
| 응답 과잉 시각화 | 초보자 피로·비용 | 3단계 이상/분기/위험 시에만 표, beta에서 길이 측정 |
| 플러그인 disable 시 안전 gate 소멸 | always-on 오해 | UI·문서에 활성 범위 명시, mode off와 plugin disable 구분 |

## 8. 결정된 사항과 Open Questions

### 결정됨

- output style과 `force-for-plugin`을 사용하지 않는다.
- novice off는 즉시 novice context 0건이며 기존 output style 복원이 필요 없다.
- 명령은 `/novice:mode 1|2|3|off`로 통일한다.
- `${CLAUDE_PLUGIN_DATA}`는 공식 영속 상태 경로로 사용한다.
- userConfig는 사용자 기본값으로만 사용하고 project override는 plugin data에 둔다.
- `UserPromptSubmit`은 전체 transcript를 매 turn 파싱하지 않는다.
- Chrome stack은 공식 Claude in Chrome beta다.
- 최소 지원 runtime은 Claude Code 2.1.215다. `UserPromptExpansion` block, `PostToolBatch`, 범용 `updatedToolOutput`을 사용한다.
- 외부 자동화는 2-tier manifest 부트스트랩(탐지·설치·로그인·인증 확인)까지이며 CLI 개수 제한이 없다. Tier 1은 검토 manifest 3개(Vercel·GitHub CLI·Supabase CLI)로 시작하고, Tier 2는 공식 근거 제시 + 사용자 승인 후 동일 engine으로 진행한다. executable adapter는 두지 않는다.
- 플러그인은 credential broker가 아니며 credential 값을 요청·저장·전달·자동입력하지 않는다. local scanner와 provider CLI credential store의 처리 경계는 별도로 공개한다.
- hook 구현 언어는 Node.js로 통일한다. JSON schema, 안전한 file I/O, Windows 호환성을 한 언어로 테스트한다.
- 초기 용어 사전은 32개로 시작한다: Git 8, terminal/filesystem 6, web/app 6, database/auth 6, deploy/security 6.
- fade 기본값은 Level 1 설명 3회, Level 2 설명 1회, Level 3 자동 설명 0회다.
- project key는 Git repository이면 canonical top-level path, 아니면 symlink를 해소한 canonical cwd의 SHA-256으로 만든다.
- Chrome을 사용할 수 없는 환경도 MVP 대상에 포함하되 guided manual로 downgrade한다.
- 안전 gate의 사용자 승인은 tool call 1회로 제한하고 session-scoped approval은 제공하지 않는다.
- 안전 gate는 Bash·PowerShell 유한 grammar, 추가-only protected branch, `development|preview/staging|production|unknown` target 분류를 사용한다.

### 후속 결정 사항 — 구현 착수를 막지 않음

- beta 모집 채널과 성공 지표의 신뢰구간 보고 방식.
- moderated beta에서 Level 1 응답 길이 합격선을 1.6배보다 더 낮출 수 있는지.
- 공식 provider MCP의 배포·권한 모델이 바뀔 때 allowlist 갱신 주기.
- 부트스트랩 이후 provisioning을 어디까지 guided manual 템플릿으로 표준화할지.

## 부록 A. 리서치 출처와 반영 사항

### 공식 제품 문서

| 확인 항목 | 출처 | PRD 반영 |
|---|---|---|
| output style은 session start에 로드되고 `force-for-plugin`은 사용자 설정을 덮어씀 | [Claude Code Output styles](https://code.claude.com/docs/en/output-styles) | output style 제거, 완전 off 보장 |
| `PreToolUse` allow/deny/ask/defer, `UserPromptExpansion` block, `PostToolBatch`, 범용 `PostToolUse.updatedToolOutput`, `Stop.last_assistant_message` | [Hooks reference](https://code.claude.com/docs/en/hooks), 로컬 설치 version 2.1.215 확인; payload 실측은 완료 기준 A에서 캡처 | §4.1·§5·§6 플랫폼 계약 교정 |
| hook context 저장, hook timeout과 matcher | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) | versioned capsule, 성능 기준, 누적 위험 |
| plugin userConfig, namespace, `${CLAUDE_PLUGIN_DATA}` | [Plugins reference](https://code.claude.com/docs/en/plugins-reference) | 상태 경로·설정 우선순위·namespace |
| plugin skills는 `plugin-name:skill-name` namespace 사용 | [Agent Skills](https://code.claude.com/docs/en/slash-commands) | `/novice:mode`로 명령 교정 |
| Agent SDK snapshot과 Claude Code runtime 계약은 version에 따라 다를 수 있음 | `@anthropic-ai/claude-agent-sdk` v0.2.117 `sdk.d.ts`는 historical 보조 자료로만 보존 | 최소 지원 runtime의 공식 문서·실측 fixture를 SSOT로 승격 |
| Chrome extension의 visible automation과 login/CAPTCHA 수동 처리 | [Claude Code with Chrome](https://code.claude.com/docs/en/chrome) | Chrome stack 확정, human gate |
| Vercel 설치·`login`·`whoami` | [Vercel CLI](https://vercel.com/docs/cli) | Vercel bootstrap manifest와 acceptance |
| GitHub CLI `auth login`·`auth status`와 credential storage fallback | [GitHub CLI manual](https://cli.github.com/manual/gh_auth_login) | GitHub CLI manifest의 auth/status/storage 정책 |
| Supabase `login`과 native credential storage/plaintext fallback | [Supabase CLI reference](https://supabase.com/docs/reference/cli/install) | Supabase manifest의 login/storage 중단 조건 |

### 사용자·커뮤니티·YouTube 조사

| 발견 | 출처 | 반영 |
|---|---|---|
| 초보자는 CLI basics부터 skills·MCP로 단계적으로 확장할 때 부담이 낮음 | [Claude Code from Zero YouTube playlist](https://youtube.com/playlist?list=PL5OZs3jMgGKQK6vsdADO5iO2hEEAjo6CP) | Level 1→3 progressive disclosure |
| 비개발자는 slash command를 UI의 버튼처럼 이해하며, Git checkpoint·수준별 설명이 진입에 도움 | [So What? Introduction to Claude Code](https://youtu.be/OlB0ZCO2VMw) 및 [transcript](https://www.trustinsights.ai/blog/2026/01/so-what-introduction-to-claude-code/) | novice namespace 고지, Git 범위 설명, 레벨 UX |
| 80% 이후 수정 붕괴와 시스템 이해 부족 | [HN 46228104](https://news.ycombinator.com/item?id=46228104), [HN 46851700](https://news.ycombinator.com/item?id=46851700) | 아키텍처·유저플로우 중심 Level 3 |
| OAuth callback과 외부 설정이 입문자 병목 | [HN 44869331](https://news.ycombinator.com/item?id=44869331) | GitHub OAuth console 안내, 단일 callback 제약, 환경별 app 분리 옵션 |
| Git 없는 시작과 시크릿 노출 위험 | [HN 43449271](https://news.ycombinator.com/item?id=43449271), [GitGuardian State of Secrets Sprawl](https://www.gitguardian.com/state-of-secrets-sprawl-report-2025) | Git preflight, known-secret gate |
| production과 개발 환경 혼합은 복구 비용을 키움 | [Replit incident 보도](https://fortune.com/2025/07/23/replit-ai-coding-tool-wiped-database/) | production deny 기본값, preview 우선 |

### 리서치 한계

- 커뮤니티와 YouTube 자료는 대표성 있는 사용자 연구가 아니다. 발견 가설을 만드는 용도로만 사용하고 moderated beta로 검증한다.
- 공식 문서의 기능과 version은 구현 착수·release 전 다시 확인한다.
- 출처의 사용량·사고 수치는 product KPI의 baseline으로 직접 사용하지 않는다.

## 부록 B. 사용자 원 요구 7개 (verbatim)

요구 해석 drift를 막기 위해 원문을 그대로 보존한다. 본문 커버리지표는 이 목록을 기준으로 판정한다.

1. 비개발자 입문자용 플러그인 (개발 용어·기술 스택을 모름)
2. 외부 서비스 설정을 AI가 대신 처리, 우선순위 CLI > MCP > 크롬 컨트롤
3. 3단계 수준 설정 + 기본 1단계(최고 초보) + 설정 자체를 off 가능
4. 더 이상 필요 없어진 입문자용 설명을 제외 가능
5. 용어 자체를 대체(순화)하지 않음 — 실제 용어 + 설명 병기로 학습 기회 보존
6. 리스트/순서를 테이블로 표시 + 완료/할 일을 시각적으로 구분
7. 인터넷·유튜브로 추가 고려사항을 조사·반영
