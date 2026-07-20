---
status: pending approval
title: 비개발자 입문자용 Claude Code Novice 플러그인 PRD
date: 2026-07-20
revision: 3
mode: reviewed design (codex + claude cross-review 반영)
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
2. **Automate under guardrails** — 외부 서비스 설정을 CLI > 신뢰된 MCP > Claude in Chrome 순서로 시도하되, 외부 리소스 생성·결제·프로덕션 변경·삭제는 사용자 확인 없이 실행하지 않는다.
3. **Make state legible** — 진행 상태와 변경 결과를 레벨에 맞는 표 또는 체크리스트로 보여 준다. 매 응답에 표를 강제하지 않고, 긴 작업·분기·복구가 필요한 상황에 사용한다.
4. **Reversible where the boundary allows** — 로컬 파일은 Git 상태 확인과 체크포인트로 복구 가능성을 높인다. Git 밖의 DB·배포·브라우저 변경은 별도 검증과 rollback 절차를 둔다. “모든 변경을 되돌릴 수 있다”고 약속하지 않는다.
5. **User owns the dial** — Level 1·2·3과 novice off를 즉시 전환할 수 있다. off는 novice 톤·설명·시각화를 완전히 제거하며 사용자 output style을 건드리지 않는다.
6. **No silent security claims** — 안전 게이트의 위협 모델, 탐지 범위, 오탐·미탐 가능성을 사용자 문서와 테스트에 명시한다.

### 결정 요인

1. **완전 off와 기존 output style 보존이 최우선이다.** `force-for-plugin` output style은 플러그인이 활성화된 동안 사용자 설정을 계속 덮어쓰므로 novice off와 양립하지 않는다. 따라서 output style을 사용하지 않는다.
2. **강제 안전은 `PreToolUse`에서만 수행한다.** 파괴·시크릿·외부 부작용은 텍스트 권고가 아니라 `permissionDecision: deny|ask`로 막는다.
3. **가변 학습 동작은 현재 상태 capsule로 주입한다.** `UserPromptSubmit`은 짧은 현재 모드 지시만 주입하고, 각 capsule은 이전 novice 지시를 대체한다고 명시한다. `SessionStart`의 `startup|resume|clear|compact` 경로에서도 최신 상태를 다시 주입한다.
4. **플러그인 slash command는 namespace가 필수다.** 플러그인 이름을 `novice`, 제어 skill을 `mode`로 두고 실제 명령은 `/novice:mode 1|2|3|off`로 통일한다. 플랫폼이 지원하지 않는 unnamespaced `/novice`를 약속하지 않는다.

### 검토한 선택지

| 선택지 | 구성 | 장점 | 단점 | 판정 |
|---|---|---|---|---|
| **A. Hook-only 단일 플러그인** | `PreToolUse` 안전층 + `SessionStart`/`UserPromptSubmit`/`UserPromptExpansion`/`PostToolUse`/`Stop` novice층 | 완전 off, 기존 output style 무침해, 안전과 학습 상태 분리, 세션 중 전환 | hook 상태·충돌·성능을 직접 관리해야 함 | **채택** |
| B. 안전 플러그인 + 학습 플러그인 분리 | 안전 core와 novice UX를 별도 설치 | 책임과 비활성화 경계가 가장 명확 | 설치·배포·업데이트가 2배, 입문자 설치 UX 악화 | P1 재검토 |
| C. `force-for-plugin` output style + hooks | 시스템 프롬프트에 학습 규칙 고정 | 압축 후에도 규칙 유지 | novice off 불가능, 사용자 output style 강제 덮어쓰기, faded와 상위 지시 충돌 | 기각 |

### ADR

- **Decision:** Hook-only 단일 플러그인.
- **Safety seam:** `PreToolUse`는 플러그인이 활성화된 동안 novice level/off와 무관하게 동작한다.
- **Learning seam:** `SessionStart`·`UserPromptSubmit`·`UserPromptExpansion`·`Stop`은 novice mode와 세션별 용어 카운터를, `PostToolUse`는 비용·반복 루프 감지를 담당한다.
- **State seam:** 기계가 읽는 JSON을 SSOT로 사용한다. Markdown `SKILL.md`를 런타임 파싱하지 않는다.
- **Compaction:** `SessionStart(source=compact)`에서 현재 mode capsule을 다시 주입한다.
- **Off:** novice off에서는 학습 관련 `additionalContext`를 전혀 주입하지 않는다. 사용자 기존 output style은 처음부터 변경하지 않으므로 복원 단계가 없다.
- **Plugin disabled:** 사용자가 플러그인 자체를 disable/uninstall하면 `PreToolUse`를 포함한 모든 안전 게이트도 사라진다. “always-on”은 플러그인이 활성화된 동안만 의미한다.

---

## 사용자 원 요구와 커버리지

| # | 원 요구 | MVP 반영 | 상태 |
|---|---|---|---|
| 1 | 개발 용어·기술 스택을 모르는 비개발자용 | 페르소나, Level 1 기본값, 단계별 해설 | 충족 |
| 2 | 외부 서비스 설정을 AI가 대신, CLI > MCP > Chrome | Supabase·Vercel adapter와 작업별 capability matrix | 최소 충족 |
| 3 | 3단계 + 기본 Level 1 + off | `/novice:mode 1|2|3|off`, 자연어 전환, 완전 off | 충족 |
| 4 | 필요 없어진 입문자 설명 제외 | 세션별 faded 카운터, 개별 reset, 레벨 상승 | 충족 |
| 5 | 실제 용어를 대체하지 않고 설명 병기 | novice 활성 시 설명 level에 따라 실제 용어 + 설명 또는 실제 용어만 사용; off는 표준 동작 | 충족 |
| 6 | 순서·할 일을 표로 표시하고 완료 상태 구분 | 긴 작업·분기·복구 시 표/체크리스트 | 충족(완화) |
| 7 | 인터넷·YouTube 조사·반영 | 공식 문서, 커뮤니티, YouTube 조사와 1:1 출처 표 | 충족 |

> 요구 2의 “임의 서비스 자동화”는 MVP 범위가 아니다. MVP는 Supabase와 Vercel의 검증된 작업만 자동화하고, OAuth helper는 GitHub OAuth를 첫 provider로 지원한다.
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
- Supabase·Vercel·GitHub OAuth 설정을 안전한 human-in-the-loop 흐름으로 완료한다.
- 고정된 위협 모델 안에서 파괴·시크릿·외부 부작용을 실제 tool gate로 차단한다.
- novice mode를 세션 중 즉시 전환하고 off 시 표준 Claude Code 동작으로 돌아간다.

### MVP 성공 지표

제품 지표는 자동 원격 telemetry 없이 로컬 fixture와 동의한 moderated beta로 측정한다.

| 지표 | MVP 합격선 | 측정 방법 |
|---|---:|---|
| 첫 안내 작업 완수율 | 비개발자 beta 참가자 80% 이상 | n≥10, 새 프로젝트에서 45분 내 로컬 앱 실행 |
| 화이트리스트 설정 완수율 | Supabase 또는 Vercel 시나리오 70% 이상 | 로그인 시작부터 검증 명령 성공까지 |
| 핵심 용어 이해 | 참가자 70% 이상이 3개 중 2개 설명 | 작업 후 `commit`·환경변수·preview deployment 질문 |
| 위험 fixture 탐지율 | 알려진 파괴·시크릿 fixture 100% | 단위·통합 테스트 |
| benign fixture 오탐률 | 10% 이하 | 안전한 명령·가짜 키 fixture |
| mode 전환 정확도 | 1→2→3→off 전환 100% | hook 출력과 상태 파일 검사 |
| off 동작 일치 | baseline 대비 novice context 0건 | 동일 prompt의 plugin enabled/off transcript 비교 |
| hook 성능 | `UserPromptSubmit` p95 300ms 이하 | 1천 턴 상당 fixture, 로컬 benchmark |
| 응답 팽창 | Level 1 median 길이 baseline의 1.6배 이하 | 고정 prompt set A/B 비교 |

### 비목표

- Claude Code 자체를 포크하거나 사용자 output style을 변경하지 않는다.
- 임의 서비스·임의 MCP를 자동 설치·설정하지 않는다.
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
| 행동 해설 | 실행 전 무엇·왜, 실행 후 변경 결과 | 핵심 결정만 해설 | 아키텍처·유저플로우 중심 | 표준 Claude Code 동작 |
| 시각화 | 3단계 이상 작업·분기·복구 시 표 | 중요 분기에서 표 | 요청 또는 위험 시 표 | novice 시각화 없음 |
| 비용 루프 | 낮은 임계값에서 개입 | 반복 감지 시 개입 | 명시적 이상 징후만 | novice 개입 없음 |
| 강제 안전 gate | 파괴·시크릿·외부 부작용 | 동일 | 동일 | 동일, 단 플러그인 활성 시에만 |

### mode 전환 UX

- 플러그인 namespace: `novice`.
- 실제 slash command: `/novice:mode 1|2|3|off`.
- 조회: `/novice:mode`는 현재 level, 적용 범위, 안전 gate 유지 여부를 보여 준다.
- 자연어 별칭: “novice 2”, “더 쉽게 설명해 줘”, “이제 간단히”, “novice off”. 별칭은 고정 trigger 목록의 deterministic 매칭으로만 인식하며 자유 문장 해석을 하지 않는다. 전환 직후 “직전 mode로 되돌리기” 안내를 함께 출력해 오탐을 복구할 수 있게 한다.
- unnamespaced `/novice`는 Claude Code 플러그인 namespace 규칙상 제공하지 않는다.
- mode 변경은 현재 프로젝트에 지속된다. `/novice:mode`는 `UserPromptExpansion`이, 자연어 별칭은 `UserPromptSubmit`이 capsule 주입 전에 state를 갱신하므로 두 경로 모두 해당 turn부터 반영된다. `off`는 해당 turn부터 novice context를 주입하지 않는다.

## 4. 기능 명세

### 4.1 용어 스캐폴딩과 faded 카운터 [P0]

- 기계가 읽는 `config/terms.json`을 초기 용어 사전 SSOT로 사용한다. 각 항목은 `term`, 한국어 설명, aliases, category를 가진다.
- 설명이 활성화된 경우 `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`처럼 실제 용어 뒤에 설명을 병기한다.
- **novice 활성 규칙:** 쉬운 표현으로 실제 기술 용어를 대체하지 않는다. 설명이 활성화된 레벨에서만 실제 용어 + 설명을 병기하고, Level 3 또는 faded 이후에는 실제 용어만 쓴다. off에서는 novice가 용어 선택을 강제하지 않는다.
- `Stop` hook이 `last_assistant_message`에서 사전 용어의 “용어+설명” 패턴만 세어 세션 카운터를 갱신한다. 사용자 입력, 코드 블록 안의 우연한 단어, 설명 없는 단순 노출은 카운트하지 않는다.
- 세션 카운터는 `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`에 저장한다. 같은 session을 resume하면 유지하고, `/clear` 또는 30일 TTL 만료 시 정리한다. 서로 다른 session 사이에 카운터를 합치는 장기 학습 상태는 P1이다.
- “다시 설명”, “아직 어려워요” 같은 고정 reset trigger와 “X가 뭐예요” 형태의 질문은 해당 용어 또는 전체 세션 카운터를 reset한다. “X가 뭐예요”는 X가 `terms.json`의 term/alias와 일치할 때만 인식한다. reset trigger 매칭도 고정 목록 기반이며 자유 문장 해석을 하지 않는다.
- 초기 사전과 임계값은 beta 결과로 조정한다. 사전 밖 용어는 자동 fade 대상이 아니며 모델에 일반 설명 규칙만 적용한다.

### 4.2 현재 mode capsule과 context 충돌 방지 [P0]

- `UserPromptSubmit`은 off가 아닐 때만 800자 이하의 현재 mode capsule을 주입한다.
- capsule에는 `schema_version`, 현재 `level`, 설명 대상/제외 용어, 시각화 조건과 다음 문장을 포함한다.

  > 이 NOVICE_STATE capsule은 이전 turn의 모든 NOVICE_STATE 지시를 대체한다. 다른 과거 level 지시는 무시한다.

- mode가 off이면 hook은 학습 관련 `additionalContext` 없이 종료한다.
- `SessionStart`는 `startup`, `resume`, `clear`, `compact`에서 같은 현재 capsule을 주입해 resume·context compaction 후 상태를 복구하고, session state에 해당 `capsule_revision`과 `skip_next_submit=true`를 기록한다.
- 바로 이어지는 첫 `UserPromptSubmit`은 mode가 바뀌지 않았다면 중복 주입을 건너뛰고 flag를 해제한다. 이후 turn 또는 mode 변경 turn에는 최신 capsule을 주입한다. 한 model request에 같은 revision의 capsule을 두 번 넣지 않는다.
- 10,000자 hook 출력 상한은 개별 출력 상한으로만 취급한다. 과거 주입이 transcript에 남는다는 전제에서 capsule을 짧고 명시적으로 versioning한다.
- 현재 Claude Code의 `UserPromptSubmit` command hook timeout은 30초지만, hook 내부에서는 network call을 금지하고 제품 성능 목표인 p95 300ms를 적용한다.
- 매 turn 전체 transcript를 다시 파싱하지 않는다. 용어 카운터는 `Stop.last_assistant_message`와 세션 상태 파일로 증분 처리한다.

### 4.3 외부 서비스 설정 자동화 [P0]

#### 공통 원칙

- “CLI > MCP > Chrome”은 서비스 전체가 아니라 **개별 작업 capability**마다 적용한다.
- adapter는 작업별로 `cli`, `mcp`, `chrome`, `manual` 지원 여부와 검증·rollback 방법을 선언한다.
- CLI가 설치돼 있다는 이유만으로 그 CLI가 지원하지 않는 작업을 강행하지 않는다.
- 로그인, CAPTCHA, MFA, 약관 동의는 사용자가 직접 완료한다. 토큰·비밀번호를 대화창에 붙여넣도록 요구하지 않는다.
- 유료 리소스 생성, 조직·리전·요금제 결정, preview/production 배포, 삭제는 실행 직전 요약과 명시적 확인을 받는다.
- Chrome fallback은 공식 Claude in Chrome beta를 사용한다. 연결되지 않았거나 제3자 provider 환경이면 guided manual로 전환한다.
- 브라우저 자동화는 visible mode로만 수행하고 최종 Create/Delete/Deploy submit 직전에 멈춘다.
- MCP는 서비스 제공자가 공식 배포하고, version·권한·transport를 확인해 `service-capabilities.json` allowlist에 고정한 항목만 사용한다. 임의 검색 결과나 사용자 미검토 package를 자동 설치하지 않는다.
- allowlist MCP도 첫 사용 전 요청 scope와 전송 대상 host를 보여 주고, read-only probe를 먼저 수행한다.

#### 작업별 capability matrix

| 서비스/작업 | 1순위 | 2순위 | 3순위 | 최종 검증 |
|---|---|---|---|---|
| Supabase 로그인 | CLI | Chrome에서 token 생성 후 CLI prompt | manual | `supabase projects list` |
| Supabase 프로젝트 생성 | CLI | 신뢰된 공식 API/MCP가 검증된 경우만 | Claude in Chrome | 프로젝트 ref와 상태 확인 |
| Supabase link/API key 조회 | CLI | MCP | Chrome | local config + key 이름 확인 |
| Vercel 로그인 | CLI | Claude in Chrome | manual | `vercel whoami` |
| Vercel project 생성/link | CLI | MCP | Claude in Chrome | `vercel project inspect` |
| Vercel env 설정 | CLI | MCP | Claude in Chrome | 이름·environment 확인, 값 미출력 |
| GitHub OAuth app 생성 | `gh api` 지원 가능 시 CLI | 신뢰된 GitHub MCP | Claude in Chrome | callback URI와 app id 확인 |

#### Supabase E2E acceptance scenario

1. CLI 설치 여부와 version을 확인하고, 미설치 시 공식 package 경로를 제안한다.
2. 로그인 여부를 검사한다. 인증은 CLI의 보안 입력 또는 사용자가 브라우저에서 생성한 token을 CLI prompt에 직접 넣는 방식으로 수행한다.
3. 조직, 리전, 인스턴스 크기와 예상 비용을 보여 주고 생성 직전 확인한다.
4. 프로젝트 생성 후 local project를 link한다.
5. 필요한 public/server key의 용도를 구분해 `.env.local`에 기록하고 `.gitignore` 포함 여부를 먼저 확인한다. 값은 응답·로그에 재출력하지 않는다.
6. `supabase projects list`, link 상태, 애플리케이션 연결 smoke test로 성공을 검증한다.
7. 실패 시 생성됨/미생성/부분 연결 상태를 구분한다. 원격 삭제는 자동 rollback하지 않고 별도 파괴 gate를 거친다.

#### Vercel E2E acceptance scenario

1. CLI 설치와 로그인 상태를 확인한다.
2. 계정/team scope, project 이름, framework 감지 결과를 보여 준다.
3. project 생성 또는 기존 project link를 사용자가 선택한다.
4. 환경변수는 preview/development/production 범위를 분리하고 값은 화면에 재출력하지 않는다.
5. MVP 기본 검증은 local build 또는 preview deployment다. production promotion은 비목표다.
6. `vercel project inspect`, env 이름 목록, preview URL health check로 성공을 검증한다.
7. 실패 시 local link와 remote project 상태를 각각 보고하고 자동 삭제하지 않는다.

#### OAuth redirect URI helper

- MVP provider는 GitHub OAuth App이다.
- local, preview, production URL을 구분해 callback URI 후보와 근거를 보여 준다.
- terminal에서 실제 버튼을 약속하지 않는다. 한 줄짜리 copy-ready code block과 대상 입력란 이름을 제공한다.
- 등록 후 실제 authorization round trip과 error URI를 검증한다. production credential이나 client secret은 응답에 출력하지 않는다.

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
| 로컬 파괴 명령 | `PreToolUse(Bash)` command | 알려진 고위험 패턴 deny/ask | shell 난독화·새 명령·플러그인 밖 실행 |
| Git history 파괴 | `git push --force`, reset/clean 계열 | protected branch·범위에 따라 deny/ask | 다른 Git client에서 실행한 작업 |
| DB/원격 리소스 삭제 | CLI 및 `mcp__.*` tool name/input | 대상·환경 표시 후 ask, production 고위험은 deny 기본 | 외부 콘솔에서 직접 수행한 작업 |
| 시크릿 commit | commit 직전 index/worktree scan | known-secret scanner와 fixture로 deny | 미지원 포맷, 암호화·난독화된 시크릿 |
| 시크릿 deploy | deploy tool/CLI 인자와 대상 파일 scan | known pattern이면 deny/ask | 이미 원격에 저장된 값, 모델 provider·transcript 노출 |
| 비용·반복 루프 | `PostToolUse`가 갱신하는 세션 tool/edit fingerprint | 임계값에서 novice 대화 개입(`additionalContext`) | 정확한 과금 계산·hard billing cap |

#### 정책

- `ask`: 사용자가 대상·영향·복구 방법을 보고 합리적으로 승인할 수 있는 가역 또는 제한적 작업.
- `deny`: 홈·프로젝트 전체 삭제, production DB destructive query, raw secret 포함 commit/deploy처럼 초보자 플러그인이 안전하게 승인시킬 수 없는 작업.
- P0의 `ask` 승인은 해당 tool call 한 번에만 유효하다. session-wide allow 또는 패턴 영구 예외는 제공하지 않는다.
- non-interactive 실행(`claude -p`)에서는 `ask`를 사용자에게 물을 수 없으므로 `ask` 대상 작업을 `deny`로 상향 처리한다. `permissionDecision`의 네 번째 값 `defer`(일반 권한 흐름 위임)는 사용하지 않는다.
- 고정 패턴 목록, protected branch 목록, secret fixture와 benign fixture를 version 관리한다.
- MVP secret detector는 `safety-rules.json`의 고정 패턴과 entropy 보조 규칙으로 구현하며 새 외부 dependency를 추가하지 않는다. 전문 secret scanner 연동은 P1 후보로 둔다.
- commit 시 시크릿 스캔은 명령 인자 문자열만 보지 않는다. hook이 `git diff --cached`를 직접 실행해 출력에 패턴을 매치하고, `git commit -am`과 `git commit <path>`는 `--cached`만으로 놓칠 수 있으므로 `git diff HEAD`를 병행한다.
- `PreToolUse` sibling hooks는 함께 실행될 수 있으므로 다른 hook의 deny가 side effect hook 실행을 막는다고 가정하지 않는다.
- novice off에서도 위 정책은 유지된다. 플러그인을 disable/uninstall하면 유지되지 않는다.

#### Git 안전 시작

- 첫 file write 전 `git rev-parse`, `git status --short`, repository root를 확인한다.
- Git이 없으면 `git init`의 효과를 설명하고 실행 전 확인한다. 자동 initial commit은 하지 않는다.
- `.gitignore`와 known-secret scan을 통과한 뒤에만 초기 checkpoint를 제안한다.
- 이미 변경이 있는 repository에서는 사용자 변경을 임의 stage/commit/stash하지 않는다.
- Git은 tracked local files만 보호한다. untracked/ignored 파일, 외부 DB, 배포 리소스는 별도 rollback 대상으로 표시한다.

### 4.6 상태와 privacy [P0]

- 설치 기본값은 `plugin.json userConfig`의 `default_level=1`, `novice_enabled=true`다. custom option인 `novice_enabled`와 플러그인 자체 enable/disable을 구분한다. userConfig는 사용자 범위 기본값으로만 사용한다.
- 프로젝트별 override는 `${CLAUDE_PLUGIN_DATA}/projects/<project-root-hash>.json`에 저장한다.
- 세션별 용어 카운터는 `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`에 저장한다.
- 상태 파일은 symlink 거부, 경로 검증, size cap, atomic write, `0600`을 적용한다.
- `${CLAUDE_PLUGIN_ROOT}`에는 상태를 저장하지 않는다.
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
      SKILL.md                # allowlisted service workflow
  config/
    levels.json               # level별 기계 규칙 SSOT
    terms.json                # 용어 사전 SSOT
    safety-rules.json         # 위험 패턴·정책 SSOT
    service-capabilities.json # 작업별 CLI/MCP/Chrome capability
  scripts/
    session-start.*
    user-prompt-submit.*
    user-prompt-expansion.*
    pre-tool-use.*
    post-tool-use.*
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
| `UserPromptSubmit` | 자연어 전환, reset, 중복 방지 후 현재 capsule | project/session state 갱신 + 필요 시 `additionalContext` |
| `UserPromptExpansion` | `command_name`(`novice:mode`) 매칭으로 plugin 명령 판별 후 `command_input` args를 deterministic하게 처리 | project state 갱신, invalid args 처리(block 가능 여부는 Phase 0 검증) |
| `PreToolUse` | 파괴·시크릿·외부 부작용 gate | `permissionDecision: deny|ask` |
| `PostToolUse` | 세션 tool/edit fingerprint 증분 갱신, 비용·반복 루프 감지 | session state 갱신 + 임계값 초과 시 `additionalContext` 개입 문구 |
| `Stop` | 최종 응답의 설명 패턴을 증분 count | session counter 갱신 |
| `SessionEnd` | session cache lifecycle 관리 | `clear`면 삭제, resume 가능한 session은 TTL까지 보존 |

### 설정 우선순위

`project override in CLAUDE_PLUGIN_DATA → userConfig default → built-in default(Level 1)`

- project/local `settings.json`의 `pluginConfigs`를 우선순위에 넣지 않는다. 최신 Claude Code에서 plugin userConfig는 user/managed settings 경로만 읽는다는 제약을 따른다.
- 자연어 전환과 `/novice:mode`는 동일한 state writer를 사용한다.

## 6. 구현 단계와 완료 기준

### Phase 0 — 플랫폼 contract spike

**산출물**

- 최소 `plugin.json`, hook fixture harness, `config/*.json` schema.
- Claude Code 최소 지원 version과 공식 문서 snapshot 링크.

**완료 기준**

- plugin skill이 `/novice:mode` namespace로 노출된다.
- `UserPromptExpansion`에서 `command_name`, `command_input`, `expanded_prompt`를 받아 `command_name` namespace(`novice:mode`) 매칭으로 plugin 명령을 판별하고 state를 갱신한다. `command_source` 필드는 존재하지 않으므로 사용하지 않는다.
- `UserPromptExpansion`이 invalid args를 실행 없이 block할 수 있는지 실측한다. block이 불가능하면 skill 안내문 기반 validation으로 fallback하고 Phase 1 완료 기준을 그에 맞게 갱신한다.
- `SessionStart(source=compact)`가 현재 state를 다시 주입한다.
- novice mode on/off와 plugin enable/disable 모든 경로에서 사용자 output style 설정이 변경되지 않는다.
- `${CLAUDE_PLUGIN_DATA}`에 project/session state가 생성되고 plugin root에는 쓰지 않는다.

### Phase 1 — mode·용어 core

**완료 기준**

- `/novice:mode 2`와 자연어 “novice 2”가 같은 state writer를 호출한다.
- invalid args는 실행 없이 사용 가능한 값만 보여 준다(Phase 0에서 확정한 block 또는 fallback 방식 사용).
- 자연어 별칭·reset trigger fixture에서 고정 목록 밖 문장은 mode·카운터를 변경하지 않는다.
- 1→2→3→off 전환 후 다음 turn capsule이 정확하고, off에서는 novice context가 0건이다.
- 각 capsule은 이전 NOVICE_STATE를 대체한다고 명시하며 800자 이하다.
- 한 model request에 같은 `capsule_revision`이 중복 주입되지 않는다.
- compact/resume 후 현재 level만 재주입된다.
- `Stop.last_assistant_message`로 용어+설명 노출만 count하고 전체 transcript는 재파싱하지 않는다.
- reset, session cleanup, 사전 밖 용어, code block 오탐 fixture가 통과한다.
- session 종료 후 같은 session을 resume하면 카운터가 유지되고, `/clear` 또는 TTL 만료 시 정리된다.
- state 파일 symlink, oversized input, concurrent write test가 통과한다.

### Phase 2 — 안전 gate

**완료 기준**

- 위험 fixture는 `PreToolUse` 반환값으로 실제 deny/ask된다.
- novice off에서도 동일하게 동작하고 plugin disable 시 hook이 사라짐을 문서화한다.
- `git commit`, `git commit -am`, path commit, deploy CLI, `mcp__.*` destructive tool fixture를 포함한다.
- secret fixture 탐지율 100%, benign fixture 오탐률 10% 이하를 충족한다.
- Git 미초기화/dirty/untracked/ignored 상태별 안내와 동작이 다르다.
- Git 밖의 변경은 checkpoint로 보호된다고 표시하지 않는다.
- 동일·유사 수정 반복 fixture에서 `PostToolUse` fingerprint가 임계값을 넘으면 개입 문구가 주입되고, novice off에서는 주입되지 않는다.

### Phase 3 — Supabase·Vercel·GitHub OAuth E2E

**완료 기준**

- 각 adapter가 작업별 capability matrix를 읽고 CLI→MCP→Chrome→manual 경로를 선택한다.
- 로그인/CAPTCHA/MFA, 유료 생성, production, 삭제는 human gate를 통과해야 한다.
- Supabase와 Vercel acceptance scenario가 clean sandbox 계정에서 성공한다.
- 재실행해도 중복 project/env를 만들지 않는 idempotency test가 통과한다.
- 중간 실패 fixture마다 remote/local partial state와 다음 복구 행동을 보고한다.
- GitHub OAuth callback URI 생성과 authorization round trip을 검증한다.
- Chrome 미지원 환경에서 guided manual로 정상 downgrade한다.

### Phase 4 — product beta

**완료 기준**

- n≥10 비개발자 moderated beta를 수행한다.
- 2장의 성공 지표를 산출하고 합격선 미달 지표마다 원인·수정·재측정 계획을 기록한다.
- raw prompt/code/secret을 수집하지 않았음을 점검한다.
- Level 1 응답 팽창과 hook latency가 합격선을 충족한다.

### P1/P2 후보

- P1: 교차 세션 용어 학습, statusline nudge, 비용 preview, 안전 core 분리 플러그인 실험, 추가 OAuth provider.
- P2: spaced repetition, 오개념 추적, 예제 discovery, 장기 학습 진도.

## 7. 리스크와 완화

| 리스크 | 영향 | 완화·검증 |
|---|---|---|
| 과거 `additionalContext`와 현재 level 충돌 | 잘못된 톤·설명 | 짧은 versioned capsule, 명시적 supersession, 전환 transcript fixture |
| hook context 누적 비용 | 긴 세션 비용 증가 | 800자 cap, 동일 prompt baseline 비교, p95 latency 측정 |
| 안전 패턴 우회 | 과신과 실제 사고 | 위협 모델·미보장 범위 공개, deny fixture 지속 확장 |
| secret scanner 오탐 | 정상 commit/deploy 방해 | benign fixture와 10% 오탐 상한, 이유와 override 절차 표시 |
| Git checkpoint 과신 | 외부/미추적 데이터 손실 | tracked 범위 표시, 외부 adapter별 rollback 상태 |
| 브라우저 beta/계정 제약 | Chrome fallback 불가 | prerequisite 검사, guided manual downgrade |
| MCP prompt injection | 악성 지시·데이터 유출 | allowlist, 출처·권한 표시, 임의 MCP 자동 설치 금지 |
| 서비스 CLI 변경 | workflow 파손 | 최소 지원 version, adapter contract test, 공식 문서 재검증 |
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
- P0 external service는 Supabase·Vercel, OAuth provider는 GitHub다.
- hook 구현 언어는 Node.js로 통일한다. JSON schema, 안전한 file I/O, Windows 호환성을 한 언어로 테스트한다.
- 초기 용어 사전은 32개로 시작한다: Git 8, terminal/filesystem 6, web/app 6, database/auth 6, deploy/security 6.
- fade 기본값은 Level 1 설명 3회, Level 2 설명 1회, Level 3 자동 설명 0회다.
- project key는 Git repository이면 canonical top-level path, 아니면 symlink를 해소한 canonical cwd의 SHA-256으로 만든다.
- Chrome을 사용할 수 없는 환경도 MVP 대상에 포함하되 guided manual로 downgrade한다.
- 안전 gate의 사용자 승인은 tool call 1회로 제한하고 session-scoped approval은 제공하지 않는다.

### 후속 결정 사항 — Phase 0~3 planning을 막지 않음

- beta 모집 채널과 성공 지표의 신뢰구간 보고 방식.
- moderated beta에서 Level 1 응답 길이 합격선을 1.6배보다 더 낮출 수 있는지.
- 공식 provider MCP의 배포·권한 모델이 바뀔 때 allowlist 갱신 주기.

## 부록 A. 리서치 출처와 반영 사항

### 공식 제품 문서

| 확인 항목 | 출처 | PRD 반영 |
|---|---|---|
| output style은 session start에 로드되고 `force-for-plugin`은 사용자 설정을 덮어씀 | [Claude Code Output styles](https://code.claude.com/docs/en/output-styles) | output style 제거, 완전 off 보장 |
| `PreToolUse`의 allow/deny/ask와 hook event schema | [Hooks reference](https://code.claude.com/docs/en/hooks) | 안전 gate와 `/novice:mode`의 `UserPromptExpansion` 처리 |
| hook context 저장, hook timeout과 matcher | [Hooks guide](https://code.claude.com/docs/en/hooks-guide) | versioned capsule, 성능 기준, 누적 위험 |
| plugin userConfig, namespace, `${CLAUDE_PLUGIN_DATA}` | [Plugins reference](https://code.claude.com/docs/en/plugins-reference) | 상태 경로·설정 우선순위·namespace |
| plugin skills는 `plugin-name:skill-name` namespace 사용 | [Agent Skills](https://code.claude.com/docs/en/slash-commands) | `/novice:mode`로 명령 교정 |
| Chrome extension의 visible automation과 login/CAPTCHA 수동 처리 | [Claude Code with Chrome](https://code.claude.com/docs/en/chrome) | Chrome stack 확정, human gate |
| Supabase 프로젝트 생성·조회·API key CLI | [Supabase CLI](https://supabase.com/docs/reference/cli/install) | Supabase E2E와 capability matrix |
| Vercel project·env·preview CLI | [Vercel CLI](https://vercel.com/docs/cli) | Vercel E2E와 production 비목표 |

### 사용자·커뮤니티·YouTube 조사

| 발견 | 출처 | 반영 |
|---|---|---|
| 초보자는 CLI basics부터 skills·MCP로 단계적으로 확장할 때 부담이 낮음 | [Claude Code from Zero YouTube playlist](https://youtube.com/playlist?list=PL5OZs3jMgGKQK6vsdADO5iO2hEEAjo6CP) | Level 1→3 progressive disclosure |
| 비개발자는 slash command를 UI의 버튼처럼 이해하며, Git checkpoint·수준별 설명이 진입에 도움 | [So What? Introduction to Claude Code](https://youtu.be/OlB0ZCO2VMw) 및 [transcript](https://www.trustinsights.ai/blog/2026/01/so-what-introduction-to-claude-code/) | novice namespace 고지, Git 범위 설명, 레벨 UX |
| 80% 이후 수정 붕괴와 시스템 이해 부족 | [HN 46228104](https://news.ycombinator.com/item?id=46228104), [HN 46851700](https://news.ycombinator.com/item?id=46851700) | 아키텍처·유저플로우 중심 Level 3 |
| OAuth callback과 외부 설정이 입문자 병목 | [HN 44869331](https://news.ycombinator.com/item?id=44869331) | GitHub OAuth helper와 round-trip 검증 |
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
