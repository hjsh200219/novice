---
status: pending approval
title: 바이브 코딩 입문자용 Claude Code 플러그인 PRD
date: 2026-07-20
mode: ralplan (non-interactive)
owner: planner
reviewers: [architect, critic]
---

# 바이브 코딩 입문자용 Claude Code 플러그인 PRD

> 비개발자 입문자가 Claude Code로 "바이브 코딩"을 시작할 때, 실제 개발 용어를 대체하지 않고 병기 설명하며,
> 외부 서비스 설정을 AI가 최대한 대신하고, CLI 공포와 입문자 재앙(파괴·비용·시크릿 노출)을 안전망으로 막아 주는
> 레벨화된 학습 동반자 플러그인.

---

## RALPLAN-DR 요약 (Architect/Critic 정렬용)

### Principles (설계 원칙)

1. **학습 기회 보존 (Scaffold, don't substitute)** — 기술 용어를 쉬운 말로 대체(순화)하지 않는다. 실제 용어(`commit`, `branch`, `environment variable` 등)를 그대로 쓰되 처음 노출 시 한국어 설명을 병기하고, 학습자가 익숙해지면 설명만 걷어낸다. 용어를 없애면 성장 경로도 사라진다.
2. **AI가 대신하되 안전이 우선 (Automate under guardrails)** — 외부 서비스 설정을 AI가 최대한 대신하지만, `bypassPermissions`는 절대 쓰지 않는다. 명령은 한 번에 하나씩, "무엇을·왜" 설명 후 실행하며, `curl | bash`류 위험 패턴을 회피한다.
3. **CLI 공포를 시각적 명료성으로 상쇄 (Make state legible)** — 입문자의 터미널 공포(시각 피드백 부재·명령 암기·파괴 위험감)를 완화하기 위해, 순서·할 일·완료 상태를 마크다운 테이블/체크리스트로 상시 시각화한다.
4. **되돌릴 수 있는 안전망 (Reversible by default)** — 첫 작업 전 `git init`/체크포인트를 자동 확보하고, 파괴·비용 루프·시크릿 노출 3종 게이트로 입문자가 흔히 겪는 재앙을 사전 차단한다.
5. **사용자 통제 (User owns the dial)** — 입문자 레벨 3단계 + 완전 off를 사용자가 언제든 조절하고, 필요 없어진 스캐폴드(용어 설명)를 제거할 수 있다.

### Decision Drivers (상위 3)

1. **가변 상태 유지가 hook을 필연화하고, 세션 중 전환은 그 공짜 부수효과다** — faded 용어 카운터와 레벨 플래그(요구 4·5)를 세션·재시작에 걸쳐 유지하려면 hook이 반드시 필요하다. hook을 이미 도입하는 이상, `/beginner 2` 같은 세션 중 레벨 전환(요구 3)은 플래그 파일만 갱신하면 되는 부수효과로 무료 획득된다.
2. **안전 게이트는 텍스트 권고가 아니라 실제 tool 호출 차단이어야 한다** — `UserPromptSubmit`/`SessionStart` hook은 컨텍스트를 주입할 뿐 tool 호출을 막지 못한다(공식 문서 확인). 파괴·시크릿을 실제로 강제 차단하려면 `PreToolUse` hook의 `permissionDecision`(deny/ask)이 필연이다.
3. **불변 학습보증이 컨텍스트 압축에도 살아남아야 한다** — "용어 대체 금지"라는 핵심 보증은 긴 세션의 컨텍스트 압축에 잘리면 안 된다. 시스템 프롬프트로 주입되는 output-style은 압축에 저항하므로 이 불변 메타규칙의 자리가 된다.

### Viable Options (아키텍처 선택)

핵심 분기는 세 가지를 어디에 담느냐다: (a) 안전 게이트의 **강제 차단**, (b) 제거 가능한 **입문자 톤·레벨 가변 동작·용어 카운터**, (c) 압축에 저항해야 하는 **불변 학습보증**.

| 옵션 | 구성 | 장점 | 단점 |
|------|------|------|------|
| **A. 3층 하이브리드 (권장)** | ① `PreToolUse` hook = 파괴·시크릿 **강제 차단**(`permissionDecision` deny/ask), 레벨/off 무관 always-on ② `UserPromptSubmit` hook = **제거 가능한** 입문자 톤 + 레벨 가변 동작 + 용어 카운터 갱신, `Stop` hook = 카운터 증가 ③ output-style = 압축에 안 잘리는 **불변 메타규칙만**(용어 대체 금지 + `keep-coding-instructions`) | 안전을 텍스트 권고가 아닌 실제 차단으로 강제, 세션 중 무붕괴 전환, faded 카운터·되돌림 구현 가능, 불변 보증은 압축 저항. hook 패턴은 caveman에서 이식 검증(단 caveman엔 output-style 없음) | hook 4종(PreToolUse·UserPromptSubmit·SessionStart·Stop) 유지보수, output-style 1개가 사용자 기존 스타일 덮어씀(고지 필요), 복잡도 상승 |
| **B. 순수 output-style 3파일** | 레벨별 output-style 파일 + `plugin.json userConfig`로 설치 시 선택 | hook 0줄, 최소 유지보수 | **세션 중 전환 불가**(세션당 1회 로드 → `/clear` 필요) → 요구 3 위반. 카운터·faded 상태 추적 불가 → 요구 4 위반. **안전 게이트를 강제 차단 불가**(output-style은 텍스트 지시일 뿐) |
| **C. 순수 hook** | output-style 없이 hook만으로 톤·상태·안전을 전부 주입/차단 | 사용자 기존 output-style 무침해, 전부 동적, 안전은 `PreToolUse`로 여전히 강제 가능 | 불변 학습보증(용어 대체 금지)이 시스템 프롬프트에 없어 **컨텍스트 압축에 잘릴 수 있음**(`SessionStart` 주입도 압축 대상). 핵심 보증의 지속성이 A보다 약함 |

**선택: 옵션 A (3층 하이브리드).**
- **1순위 근거(Driver 1):** faded 용어 카운터가 stateful하려면(요구 4·5) 어차피 hook이 필요하다. hook을 이미 도입하는 이상, 세션 중 레벨 전환(요구 3)은 플래그 파일만 갱신하면 되는 **공짜 부수효과**로 따라온다. 옵션 B는 hook이 없어 둘 다 불가능하다.
- **2순위 근거(Driver 2, 안전):** `UserPromptSubmit`/`SessionStart`는 컨텍스트를 주입할 뿐 tool 호출을 **차단하지 못한다**(공식 문서 확인). 파괴·시크릿을 실제로 막으려면 `PreToolUse`의 `permissionDecision`이 필수다. 옵션 B는 이 강제 차단 자체가 불가능하다.
- **3순위 근거(Driver 3, 압축 저항):** 옵션 C의 기각 근거는 흔히 오해되는 "매 턴 톤 재주입 비용"이 **아니다** — 채택안 A도 제거 가능한 톤은 `UserPromptSubmit`으로 매 턴 주입하므로 그 비용은 A·C 공통이다. C의 진짜 약점은 output-style이 없어 **불변 보증(용어 대체 금지)마저 컨텍스트 압축에 잘릴 수 있다**는 점이다. A는 그 한 줄만 시스템 프롬프트(output-style)에 고정해 압축에 살아남게 한다.

seam 규율: **레벨/off로 변하는 것은 절대 output-style에 넣지 않는다.** output-style에는 압축에 잘리면 안 되는 불변 메타규칙만 최소로 둔다.

### ADR (Architecture Decision Record, 압축본)

- **Decision:** 3층 하이브리드 — ① `PreToolUse`(안전 강제 차단, always-on) ② `UserPromptSubmit`+`Stop`(제거 가능 톤·레벨 가변·용어 카운터) ③ output-style(불변 메타규칙만). seam은 "강제 차단이 필요한가 / 제거 가능한가 / 압축에 잘리면 안 되는가"로 3분한다.
- **Drivers:** 가변 상태 유지 → hook 필연(세션 중 전환은 공짜 부수효과) / 안전은 텍스트 권고 아닌 tool 차단이어야 함(PreToolUse) / 불변 보증은 압축 저항(output-style).
- **Alternatives considered:** 순수 output-style 3파일(세션 중 전환·상태 추적·강제 차단 모두 불가로 기각), 순수 hook(불변 보증이 압축에 잘릴 위험으로 기각).
- **Why chosen:** 안전 강제는 PreToolUse에만 가능. 가변 상태는 hook을 필연화하고 그 덕에 세션 중 전환이 무료. 불변 한 줄만 output-style에 고정해 압축에 살아남게 함.
- **Consequences:** hook 4종 유지보수 부담. output-style 1개가 사용자 기존 스타일을 덮어쓰므로 활성 시 고지 필요하되 **off 시 자동 복원 여부는 미검증**(리스크표 참조). `UserPromptSubmit` `additionalContext` 10,000자 상한 안에서 활성 레벨 행만 주입. 용어 탐지는 SKILL.md 고정 사전에 있는 용어로 한정.
- **Follow-ups:** stateful vs stateless 카운터 분기 결정, faded 임계값 튜닝, 크롬 컨트롤 스택 확정, 외부 서비스 화이트리스트 초기 범위, `CLAUDE_PLUGIN_DATA` 실 환경변수명 확인(Open Questions 참조).

---

## 사용자 원 요구 7개 (verbatim) 및 커버리지 매핑

원 요구를 손실 없이 고정하기 위해 그대로 열거한다. PRD 본문은 이 7개를 우선 충족한다.

1. 비개발자 입문자용 플러그인 (개발 용어·기술 스택을 모름)
2. 외부 서비스 설정을 AI가 대신 처리, 우선순위 CLI > MCP > 크롬 컨트롤
3. 3단계 수준 설정 + 기본 1단계(최고 초보) + 설정 자체를 off 가능
4. 더 이상 필요 없어진 입문자용 설명을 제외 가능
5. 용어 자체를 대체(순화)하지 않음 — 실제 용어 + 설명 병기로 학습 기회 보존
6. 리스트/순서를 테이블로 표시 + 완료/할 일을 시각적으로 구분
7. 인터넷·유튜브로 추가 고려사항을 조사·반영

### 커버리지 매핑표

| # | 원 요구 (요약) | 커버 섹션 | 우선순위 | 상태 |
|---|----------------|-----------|----------|------|
| 1 | 비개발자 입문자용 | 3(페르소나)·4.1 | P0 | 충족 |
| 2 | 외부 설정 AI 대신 (CLI>MCP>크롬) | 4.2 | **P0=화이트리스트 1~2개(Supabase+Vercel)+OAuth 헬퍼**, 임의 서비스 전체 자동화=P1 | 부분(MVP 최소충족) |
| 3 | 3단계+기본1+off | 3(레벨표)·4.5 | P0 | 충족 |
| 4 | 필요없어진 설명 제외 | 4.1(faded)·4.5 | P0 | 충족 |
| 5 | 용어 대체 금지(병기) | 4.1·5.2(output-style) | P0 | 충족 |
| 6 | 테이블 표시+완료/할일 시각구분 | 4.3 | P0 | 충족 |
| 7 | 인터넷·유튜브 조사·반영 | 부록 A(출처)·리서치 A/B | P0 | 충족 |

> 요구 2만 "부분"이다. 사용자 명시 요구이므로 완전 강등은 불가하되, MVP에서는 화이트리스트 1~2개 서비스 + OAuth 헬퍼로 **최소 충족**하고, 임의 서비스 자동 설치는 P1로 확장한다(4.2·Open Questions 참조).

---

## 1. 개요

바이브 코딩(자연어로 의도를 말하면 AI가 코드를 짜 주는 방식)에 입문하는 **비개발자**는 개발 용어와 기술 스택을 모른다. 이들은 (a) 외부 서비스(DB·배포·인증) 설정 미로에서 막히고, (b) 터미널의 시각 피드백 부재에 겁먹으며, (c) 시크릿 노출·프로덕션 DB 삭제·무한 수정 비용 폭탄 같은 재앙에 무방비다. 동시에 리서치가 보여 주듯, 용어를 쉬운 말로 **대체**해 버리면 학습 기회가 사라져 "80%→100% 구간 붕괴"(AI가 짠 코드를 이해 못 해 후반에 포기)로 이어진다.

이 플러그인은 Claude Code의 빌트인 output style "Learning"/"Explanatory"를 **한국어화 + 레벨화 + 안전 게이트**로 확장한 입문자 동반자다. 실제 용어를 쓰되 설명을 병기하고(성장하면 걷어냄), 외부 설정을 AI가 대신하며(CLI > MCP > 크롬 우선순위), 진행 상태를 테이블로 상시 시각화하고, 3종 안전 게이트로 재앙을 막는다.

## 2. 목표 / 비목표

### 목표 (Goals)

- 비개발자가 첫 대화부터 겁먹지 않고 진행하도록 톤·설명·시각화를 제공한다.
- 실제 개발 용어를 학습 기회로 남기되(대체 금지, 병기), 익숙해지면 자동으로 설명을 페이드한다.
- 외부 서비스 설정을 AI가 CLI > MCP > 크롬 우선순위로 최대한 대신 처리한다.
- 파괴·비용 루프·시크릿 노출 3종 재앙을 게이트로 사전 차단한다.
- 입문자 모드를 3단계 + off로 사용자가 완전히 통제하게 한다.

### 비목표 (Non-Goals)

- 코드를 대신 "완성"해 주는 것이 목표가 아니다 (Claude Code 본연의 코딩 능력에 얹는 레이어일 뿐).
- 용어를 쉬운 말로 순화·대체하지 않는다 (원칙 1 위반).
- Claude Code 자체를 포크하거나 시스템 프롬프트를 전역 개조하지 않는다 (플러그인 경계 안에서만).
- 초보 튜터의 전 과정(스페이스드 리피티션·오개념 장기 추적)을 MVP에 넣지 않는다 (P2).
- 자동 배포·프로덕션 운영을 대행하지 않는다 (안전상 사용자 확인 지점 유지).

## 3. 페르소나 & 레벨 3단계 정의

### 페르소나

- **주 사용자:** 아이디어는 있으나 코드·터미널·개발 용어를 모르는 비개발자 (기획자·디자이너·1인 창업자·학생). "만들고 싶은 것"은 명확하나 "어떻게"가 백지.
- **목표 상태(F2):** 문법 암기가 아니라 **아키텍처 · 유저플로우 · 비즈니스 로직** 3층을 이해하며 자립하는 것.

### 레벨 정의 — 각 레벨에서 무엇이 달라지나

레벨은 **`UserPromptSubmit` hook이 주입하는 제거 가능·가변 동작**으로 구현한다(불변 메타규칙 "용어 대체 금지"만 output-style, 안전 강제는 `PreToolUse`). 아래 4개 축이 레벨에 따라 변한다.

| 축 | Level 1 (완전 초보, 기본) | Level 2 (기초 이해) | Level 3 (자립 준비) | Off |
|----|--------------------------|---------------------|---------------------|-----|
| **용어 설명 병기** | 첫 노출마다 한국어 설명 병기, 임계값까지 반복 | faded — 처음 1~2회만 설명, 이후 용어만 | 요청 시에만 설명, 기본은 용어만 | 없음 (표준 동작) |
| **단계 해설** | 매 행동 전 "지금 무엇을·왜" 1줄 + 실행 후 "무엇이 바뀌었나" 1줄 | 핵심 결정만 해설, 사소한 것은 요약 | 아키텍처·유저플로우 관점 코칭 위주, 세부 해설 생략 | 없음 |
| **진행 시각화** | 매 턴 진행 테이블 + "지금 어디에 무슨 파일" 상시 노출 | 중요 분기·요청 시 테이블 | 필요 시에만 | 표준 |
| **게이트 민감도** | 파괴·비용 루프·시크릿 전부 최고 민감, 실행 전 확인 | 파괴·시크릿 유지, 비용 루프는 감지 시 개입 | 파괴·시크릿만 유지 (안전은 레벨 무관 최저선) | 파괴·시크릿 최저선은 유지(안전은 off 불가), 톤·설명만 off |

> **안전의 최저선은 레벨/off와 무관하다.** 파괴 작업 이중 확인과 시크릿 스캔 게이트는 레벨 3와 off에서도 유지된다. off는 "입문자 톤·설명·시각화"만 끄는 것이지 안전망을 끄는 것이 아니다. (비용 루프 개입만 레벨에 따라 완화)

- **기본값 = Level 1** (요구 3: 기본은 최고 초보).
- **스캐폴드 제거(요구 4)** = 레벨을 올리거나(전역), 특정 용어를 "이제 됐어요"로 개별 페이드하거나, off로 전체 제거.

## 4. 기능 명세

우선순위: **P0 = MVP (사용자 명시 요구 7개 전부 포함)**, P1 = 다음, P2 = 이후.

### 4.1 용어 스캐폴딩 + faded 카운터 [P0]

- 응답에 기술 용어가 처음 등장하면 `용어(한국어 설명)` 형태로 병기한다. 예: `commit(지금까지의 변경을 하나의 저장 지점으로 묶는 것)`.
- 용어별 노출 횟수를 레벨별 임계값(예: L1=3회, L2=1회)까지만 병기하고, 초과하면 설명을 생략하고 용어만 쓴다(faded worked example, F12).
- **MVP(stateless):** `UserPromptSubmit`이 `transcript_path`에서 **세션 내** 용어 노출 횟수를 세어(상태 파일 없음) 페이드를 결정한다(transcript 파싱 선례: `caveman-mode-tracker.js:50`). 재시작하면 카운트가 리셋되어 다시 병기 — 요구 4를 세션 단위로 충족. (crux 결정: Open Questions 참조)
- **P1(stateful 승격):** 교차 세션 지속 카운터 = `explained-terms.json` + `Stop` hook(직전 어시스턴트 메시지를 고정 사전으로 스캔해 +1) + 보안 하드닝. 재시작을 넘어 페이드 유지.
- **한계(명시):** 자유 서술된 임의 용어는 탐지 불가 — **SKILL.md 고정 사전에 등재된 용어만** 카운트·페이드 대상이다. 사전 커버리지가 곧 스캐폴딩 커버리지다(사전 확장은 Open Questions).
- **되돌림:** 사용자가 "아직 어려워요" / "다시 설명" / "그게 뭐예요"라고 하면 해당 용어(또는 전체) 카운터를 리셋해 설명을 되살린다.
- **불변 규칙(output-style):** 용어를 쉬운 말로 대체·순화하지 않는다. 항상 실제 용어 + 설명 병기. (원칙 1, 요구 5)

### 4.2 외부 서비스 설정 자동화 — CLI > MCP > 크롬

입문자가 가장 막히는 지점. 다만 "임의 서비스를 AI가 CLI/MCP로 자동 설치·설정"은 검증·유지보수 부담이 크므로 범위를 나눈다.

**범위 재조정 (요구 2는 사용자 명시 요구라 완전 강등 불가 → MVP 최소충족):**
- **P0 (MVP):** 초기 화이트리스트 **1~2개 서비스만**(권장: **Supabase + Vercel**, 바이브 코딩 입문자 사용 빈도 최상) + **OAuth 콜백/redirect URI 헬퍼**(F7, 리서치 갭 = 차별화 지점). 이 범위 안에서 CLI > MCP > 크롬 우선순위 폴백을 완성한다.
- **P1:** 임의 서비스로의 자동 설치·설정 일반화. 화이트리스트 확장 항목·검증 기준은 Open Questions.

**우선순위 폴백 플로우 (화이트리스트 서비스 대상):**

1. **서비스 식별** — 무엇이 필요한지(예: Supabase, Vercel, GitHub OAuth) "무엇을·왜"로 먼저 설명.
2. **CLI 우선** — 해당 서비스 CLI가 있으면 설치(한 번에 한 명령, 설명 첨부, `curl|bash` 회피) → AI가 로그인·프로젝트 생성·키 설정을 대신 수행.
3. **MCP 차선** — CLI가 없고 신뢰할 수 있는 MCP가 있으면, **신뢰 검증 + 프롬프트 인젝션 위험 고지** 후 설치해 AI가 설정.
4. **크롬 컨트롤 최후** — 둘 다 없으면 브라우저 컨트롤로 대신 처리하되, 단계별로 무엇을 클릭하는지 보여 준다.
5. **OAuth 콜백/redirect URI 특별 취급 [P0] (F7)** — 입문자 최악의 미로. 단계별 안내 + 붙여넣을 값 "클릭 복사" 제공. 화이트리스트와 무관하게 P0.
- **불변 규칙:** `bypassPermissions` 금지. 모든 설치·설정은 한 번에 한 명령 + 사전 설명.

### 4.3 진행 시각화 규칙 [P0]

- 리스트·순서·할 일은 **마크다운 pipe 테이블 또는 체크리스트**로 출력한다(코드 블록 아님).
- 완료/진행/대기를 유니코드 기호로 시각 구분: 완료 `[x]` 또는 `✓`, 진행중 `[~]` 또는 `▸`, 대기 `[ ]` 또는 `·`. (이모지 미사용)
- "지금 어디에 무슨 파일"을 상시 노출한다 (F4: 터미널 공포 완화).
- 재프롬프트(수정 요청) 시 "무엇이 왜 바뀌었나" 1줄을 노출한다 (F3: 학습 단락 방지).
- 진행 시각화의 1차 채널은 모델 출력의 테이블/체크리스트다. statusline은 2차이며 플러그인이 직접 탑재 불가 → 사용자 `settings.json`에 추가를 제안하는 nudge만 가능 [P1].

### 4.4 안전 게이트 3종 [P0]

> **핵심:** 파괴·시크릿 게이트는 텍스트 권고가 아니라 `PreToolUse` hook의 실제 **강제 차단**이다. `UserPromptSubmit`/`SessionStart`는 tool 호출을 막지 못하므로(공식 문서 확인), 게이트를 스타일 지시문에만 두면 모델이 무시할 때 막을 방법이 없다. 따라서 파괴·시크릿은 `PreToolUse`가 `tool_name`+`tool_input` 패턴을 매치해 `permissionDecision`으로 처리하며, **레벨/off와 무관하게 always-on**이다. 비용/루프 게이트는 tool 차단이 아니라 대화 개입이므로 hook 텍스트 주입으로 구현한다.

| 게이트 | 강제 수단 | 트리거 | 동작 | always-on? | 근거 |
|--------|-----------|--------|------|-----------|------|
| **파괴 게이트** | `PreToolUse` `permissionDecision: ask`(또는 deny) | `Bash(rm -rf …)`, `git push --force`, DB DROP/삭제 등 `tool_name`+`tool_input` 고정 위험 패턴 | 실행 전 강제 확인 + dev/prod 분리 안내. 되돌리기 체감 | 예(off 무관) | F4·F17 (Replit prod DB 삭제 사례) |
| **시크릿 게이트** | `PreToolUse` `permissionDecision: deny/ask` | 커밋/배포 tool 호출의 diff·인자에 시크릿(키·토큰·비밀번호) 패턴 매치 | 노출 차단 + just-in-time 교육 | 예(off 무관) | F15 (배포 앱 절반 이상 크리덴셜 노출) |
| **비용/루프 게이트** | hook 텍스트 개입(차단 아님) | 동일·유사 수정 N회 반복 감지 | "접근을 바꿀까요?" 개입 + 작게 쪼개기 제안 | 레벨 가변(L3는 감지 시만) | F16·F18 |

- **시크릿 diff 스캔 구현 방식:** `PreToolUse`의 `tool_input`에는 실행할 명령 문자열만 있고 스테이징 diff는 담기지 않는다. 따라서 커밋 tool 호출 시 시크릿 스캔은 hook이 **능동적으로 `git diff --cached`를 실행**해 그 출력에 시크릿 패턴을 매치하는 방식으로 구현한다(인자 문자열만 보는 것으로는 부족). 단 `git commit -am`(커밋 시점 스테이징)·`git commit <path>`(인덱스 우회)는 `--cached`만으로 놓칠 수 있으므로 `git diff HEAD`를 병행하고, Phase 2 시크릿 fixture에 이 두 경로를 포함한다.
- **패턴 커버리지 한계(정직 표기):** 파괴·시크릿 게이트는 고정 패턴 목록 기반이므로 **패턴 밖의 파괴 명령·신종 시크릿 형식은 차단하지 못한다**. 게이트는 최저 안전선이지 완전 방어가 아니며, 이 한계를 사용자 문서에도 명시한다(과신 방지).
- **추가 안전망 [P0]:** 첫 프롬프트 전 `git init` / 체크포인트 자동 확보 (F14: git 없이 시작 = 재앙). Plan Mode 기본 권장 + `/rewind` 안내 (F9).

### 4.5 on/off · 레벨 전환 UX [P0]

- **설치 시 1회 질문 (`plugin.json userConfig`):** 기본 레벨(1/2/3, 기본 1) + 활성화 여부. `CLAUDE_PLUGIN_OPTION_*` env로 hook에 전달.
- **세션 중 레벨 전환:** `/beginner 1|2|3`, 그리고 자연어 트리거("더 쉽게 설명해 줘"→레벨 하향, "이제 알겠어요/간단히"→상향). 명령/트리거가 플래그 파일을 갱신하면 다음 턴부터 `/clear` 없이 반영(hook 가변층이므로).
- **off의 정확한 동작(정직화):** 세션 중 `/beginner off`는 **hook 가변층(입문자 톤·설명·시각화 주입)을 즉시 중단**한다. 그러나 output-style 페르소나의 **완전 제거와 사용자 기존 스타일 복원은 새 대화(`/clear`)에서** 적용된다(output-style은 세션당 1회 로드). **안전 게이트(`PreToolUse` 파괴·시크릿)는 off와 무관하게 유지**된다.
- **고지:** 활성화 시 "이 플러그인은 output style 1개를 사용하며, 기존에 설정하신 output style을 덮어씁니다. off 시 hook 주입은 즉시 멈추고, output-style 원복은 새 대화에서 적용됩니다"를 1회 안내. (자동 복원 여부는 미검증 — 리스크표 참조)

### 4.6 이후 기능 [P1/P2]

- **P1:** statusline 배지 nudge / 명세 브리프 템플릿(기능·유저·화면·저장데이터 4칸) / 인간 에스컬레이션 지점("여기서부턴 사람에게 물어보세요") / AI 주장 독립 검증("정말 됐는지 실제로 확인") / 비용 프리뷰·상한 / dev-prod 분리 배지("나만 봄 vs 공개됨").
- **P2:** 진도 기억 + 스페이스드 리피티션(yarikleto/claude-teacher류) / 오개념 장기 추적 / 가능성 발견(작동 예제 템플릿 discovery, F11) / 오프닝 워크드 예제(빈 캔버스 금지).

## 5. 플러그인 아키텍처

### 5.1 디렉토리 구조 (제안)

```
vibe-beginner/
  .claude-plugin/
    plugin.json          # userConfig: default_level(1|2|3), enabled(bool)
  output-styles/
    beginner-base.md     # 불변 메타규칙만(용어 대체 금지). keep-coding-instructions:true, force-for-plugin:true
  hooks/
    pre-tool-use.*       # 파괴·시크릿 강제 차단(permissionDecision deny/ask). always-on, 레벨/off 무관
    session-start.*      # SSOT(SKILL.md) 읽어 활성 레벨 행 초기 주입
    user-prompt-submit.* # 매 턴 재강화 + 제거 가능 톤·레벨 가변 + MVP 카운터(transcript_path 세션 내 카운트, 파일 없음)
    stop.*               # [P1, stateful 승격 시] last_assistant_message 스캔해 교차 세션 카운터 증가
  skills/
    beginner-mode/
      SKILL.md           # SSOT: 레벨 정의·게이트 목록·시각화 규칙·고정 용어 사전 (런타임에 읽음)
  commands/
    beginner.md          # /beginner 1|2|3|off 파싱 → 플래그 파일 갱신
  scripts/
    flag.*               # 플래그 파일 read/write (보안 하드닝)
```

### 5.2 역할 분담 (seam = "강제 차단 / 제거 가능 / 압축 불가침")

| 요소 | 담는 내용 | 근거 |
|------|-----------|------|
| **`PreToolUse` hook** | 파괴·시크릿 **강제 차단**: `tool_name`+`tool_input` 위험 패턴 매치 → `permissionDecision`(deny/ask). 레벨/off 무관 always-on | 텍스트 주입 hook은 tool 호출을 못 막음(공식 문서). 안전은 권고가 아니라 차단이어야 함 |
| **`UserPromptSubmit` hook** | **제거 가능 + 레벨 가변**: 입문자 톤, 설명 상세도, 비용/루프 개입, faded 임계값 + 레벨 플래그. **MVP 카운터**: `transcript_path`에서 세션 내 용어 노출 카운트(파일 없음) | 매 턴 재강화로 드리프트 방어. `additionalContext` 10,000자 상한 → 활성 레벨 행만 주입. transcript 파싱 선례: `caveman-mode-tracker.js:50`(`src/hooks/`) |
| **`Stop` hook [P1]** | (stateful 승격 시) 직전 어시스턴트 메시지를 SKILL.md 고정 사전으로 스캔해 **교차 세션 카운터 증가** | MVP는 stateless라 미탑재. stateful 승격 시 카운터 증가 주체 |
| **`SessionStart` hook** | SSOT(SKILL.md)에서 활성 레벨 행을 세션 초기 주입 | caveman 이식 hook 패턴. 단 **SessionStart 주입은 컨텍스트 압축에 잘림**(`caveman-activate.js:27-31`(`src/hooks/`) 주석) → 불변 보증을 여기 두면 안 됨 |
| **output-style (`beginner-base.md`)** | **불변 메타규칙만**: "용어 대체 금지(병기)" + `keep-coding-instructions` | **채택 근거: 압축 저항.** output-style은 시스템 프롬프트라 컨텍스트 압축에 안 잘림. SessionStart hook 주입은 압축 대상이므로 불변 보증은 반드시 여기. (caveman엔 output-style이 없어 이 부분은 이식이 아닌 신규 설계) |
| **SKILL.md (SSOT)** | 레벨 정의·게이트 목록·시각화 규칙·고정 용어 사전의 단일 진실 원천 | 로직 중복 방지, hook이 런타임에 참조 |
| **상태 파일** | 5.3 표 | `CLAUDE_PLUGIN_ROOT`는 업데이트 시 경로 변경 → 상태 저장 금지 |

### 5.3 상태 저장 위치

| 상태 | 위치 | 보안 |
|------|------|------|
| 기본 레벨 · on/off | `plugin.json userConfig` → `CLAUDE_PLUGIN_OPTION_*` env | 설치 시 1회 |
| 세션 중 가변 레벨 플래그 | `$CLAUDE_CONFIG_DIR/.beginner-active` | 심링크 거부(O_NOFOLLOW), 64바이트 상한, atomic write, 0600 |
| 용어 노출 카운터 **[P1, stateful]** | `$CLAUDE_PLUGIN_DATA/explained-terms.json` (MVP는 파일 없이 세션 내 카운트) | `CLAUDE_PLUGIN_ROOT`에 저장 금지(업데이트 시 소실) |

### 5.4 계층적 설정 우선순위

`env(CLAUDE_PLUGIN_OPTION_*) → repo-local → XDG user config → 기본값(레벨 1)` (caveman 이식 패턴 ⑤).

## 6. 구현 단계 (Phase)

각 Phase의 완료 기준은 **관찰 가능한 기계적 출력**으로 검증한다(톤은 수동 스팟체크로만 보조 확인).

### Phase 0 — 스캐폴드 (P0 기반)
- **산출물:** `plugin.json`(userConfig), `output-styles/beginner-base.md`(불변 메타규칙), `skills/beginner-mode/SKILL.md`(SSOT 초안).
- **완료 기준:** 설치 시 output-style이 활성화되고, 새 대화 1턴에서 기술 용어가 `용어(설명)` 병기 형태로 출력됨. userConfig 질문이 설치 시 노출됨.
- **완료 기준(복원 실측):** 플러그인 off/삭제 후 새 대화에서 **사용자 기존 output-style이 자동 복원되는지 실측** — 미복원 시 수동 복원 문구를 고지에 반영(리스크표 대응).
- **테스트:** 플러그인 설치 → 대화 1턴 → 병기 형식 육안 확인. `plugin.json` 스키마 유효성. off/삭제 → 기존 스타일 상태 확인.

### Phase 1 — 레벨·상태 코어 (P0, stateless)
- **산출물:** `session-start`/`user-prompt-submit` hook, `commands/beginner.md`, `scripts/flag.*`, SKILL.md 고정 용어 사전, transcript 기반 세션 내 카운트 로직. (`stop` hook·`explained-terms.json`은 Phase 3/P1)
- **완료 기준(관찰 가능):**
  - `/beginner 2` 입력 → `.beginner-active` 플래그가 0600·O_NOFOLLOW·atomic으로 갱신됨.
  - 다음 `UserPromptSubmit`의 `additionalContext`에 레벨 2 행이 포함되고 총 길이 < 10,000자 (`/clear` 없이 반영).
  - **세션 내 카운트:** 같은 용어가 세션에서 N회 노출된 뒤 다음 턴부터 설명이 생략됨(`UserPromptSubmit`이 `transcript_path`에서 계산). (사전 밖 용어는 카운트되지 않음 — 한계 확인)
  - **상태 파일 부재 확인:** MVP는 `explained-terms.json`을 생성하지 않음(디스크에 카운터 파일 없음).
  - "다시 설명" 입력 시 세션 카운트가 리셋되어 설명이 되살아남. **리셋 구현 방식:** 상태 파일 없이 구현하므로 "리셋" = transcript에서 **마지막 되돌림 트리거 발화 이후** 구간만 카운트(트리거 이전 노출은 무시).
  - 자연어 트리거("더 쉽게")가 레벨 하향 플래그를 씀.
  - `/beginner off` → 다음 `UserPromptSubmit`에 톤/설명 주입이 사라짐(가변층 즉시 중단). (output-style 원복은 Phase 0 + `/clear`로 별도 확인)
- **테스트:** 각 레벨 전환 후 플래그 파일 내용·권한 검사, `additionalContext` 덤프 길이·레벨 행 검사, 세션 내 카운트 페이드/리셋·사전 밖 용어 무카운트, 상태 파일 미생성 확인, 심링크 공격 시 write 거부 확인.

### Phase 2 — 안전 게이트 + 외부 설정 (P0)
- **산출물:** `hooks/pre-tool-use.*`(파괴·시크릿 강제 차단), 비용/루프 개입(hook 텍스트), `git init`/체크포인트 자동, **화이트리스트(Supabase+Vercel) 대상** CLI>MCP>크롬 외부 설정 플로우, OAuth 콜백/redirect URI 헬퍼.
- **완료 기준(관찰 가능):**
  - `PreToolUse` hook이 고정 위험 패턴(`Bash(rm -rf …)`, `git push --force`, DB DROP/삭제)의 tool 호출을 `permissionDecision: ask`(또는 deny)로 **실제 차단**한다 — 스타일 지시가 아니라 hook 반환값으로 검증.
  - 커밋/배포 tool 호출의 인자·diff에 알려진 시크릿 패턴(API 키·토큰)이 있으면 `PreToolUse`가 deny/ask.
  - 이 두 게이트는 `/beginner off` 상태에서도 동일하게 발동(always-on 검증).
  - 동일 수정 N회 반복 시뮬레이션에서 비용 루프 개입 메시지 출력.
  - git 미초기화 상태에서 첫 작업 시 `git init` 제안 발동.
  - 화이트리스트 서비스(Supabase/Vercel) 설정 요청 시 CLI 존재 여부 확인 → CLI 우선 경로 선택(드라이런 로그로 확인). OAuth redirect URI 헬퍼가 복사용 값 출력.
- **테스트:** `PreToolUse` 반환값 단위 테스트(위험 패턴별 deny/ask, off에서도 발동), 시크릿 스캔 fixture, 비용 루프 트리거 시나리오, 외부 설정 드라이런에서 CLI>MCP>크롬 순서 준수 확인.

### Phase 3 — P1 확장
- **산출물:** **교차 세션 stateful 카운터(`stop` hook + `explained-terms.json` + 보안 하드닝)**, statusline nudge, 명세 브리프 템플릿, 인간 에스컬레이션·독립 검증·비용 프리뷰·dev/prod 배지.
- **완료 기준:** `Stop` hook이 고정 사전 용어를 `explained-terms.json`에 +1 하고 **재시작을 넘어** 페이드 유지, 파일 0600·경로 하드닝·사전 밖 용어 무카운트 검증. 그 외 각 기능이 해당 트리거에서 출력됨(스팟체크 + 존재 검증).

### Phase 4 — P2 확장
- **산출물:** 진도 기억·스페이스드 리피티션, 오개념 추적, 예제 discovery.
- **완료 기준:** 별도 설계 후 착수(본 PRD 범위 밖 상세).

## 7. 리스크와 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| output-style이 사용자 기존 스타일 덮어씀 | 사용자 설정 손실 체감 | 활성화 시 1회 고지. **off/삭제 시 기존 스타일 자동 복원 여부는 미검증** → Phase 0에서 실측 확인 필요. 미복원 시 수동 복원 안내를 고지에 포함 |
| off의 즉시성 오해(off 했는데 output-style 잔존) | 사용자가 "안 꺼졌다" 오인 | off는 hook 가변층만 즉시 중단, output-style 원복은 `/clear` 필요임을 off 응답에 명시(4.5) |
| 안전 게이트가 권고에 그쳐 무시됨 | 파괴·시크릿 재앙 미차단 | 파괴·시크릿은 output-style/UserPromptSubmit 텍스트가 아니라 `PreToolUse` `permissionDecision`로 강제 차단(4.4) |
| `additionalContext` 10,000자 상한 초과 | 파일 오프로드+프리뷰로 강등 → 모델이 해당 파일을 안 읽을 수 있음(주입 누락 효과) | 활성 레벨 행만 주입, 용어 카운터는 요약 형태로 |
| 톤 드리프트(긴 세션) | 입문자 모드 흐려짐 | 불변 톤은 output-style(시스템 프롬프트) + 매 턴 hook 재강화 |
| 플래그 파일 심링크 공격 | 임의 파일 덮어쓰기 | O_NOFOLLOW·64바이트 상한·atomic write·0600 |
| MCP 프롬프트 인젝션 | 악성 지시 주입 | 설치 전 신뢰 검증 + 위험 고지, 크롬은 최후 수단 |
| 용어 순화 유혹(요구 5 위반) | 학습 기회 소실 | SKILL.md·output-style에 "대체 금지, 병기 강제" 명문화 |
| 자동 설정 과잉 권한 | 위험 명령 무단 실행 | `bypassPermissions` 금지, 한 번에 한 명령 + 설명 |
| 세션 중 전환이 실제로 안 됨 | 요구 3 미충족 | 레벨 가변 내용을 output-style에 절대 넣지 않음(seam 규율) — Phase 1 완료 기준으로 강제 검증 |
| 다중 `force-for-plugin` output-style 플러그인 충돌 | first-wins로 한 개만 활성(본 플러그인이 밀릴 수 있음) | 발생 확률 낮아 수용. 설치 시 다른 output-style 플러그인 감지·고지로 완화(P1) |

## 8. Open Questions

- **[결정됨] 카운터 = stateless MVP (stateful=P1).** MVP는 상태 파일 없이 `UserPromptSubmit`이 `transcript_path`에서 **세션 내** 용어 노출을 세어 페이드(재시작 시 리셋) → 요구 4를 세션 단위로 충족. 교차 세션 지속(`explained-terms.json` + `Stop` hook + 보안 하드닝)은 P1로 승격. **결정 근거:** 교차 세션 fading의 학습 이점은 미검증인 반면 상태 파일 보안·복잡도 비용은 실재하며, 요구 4는 세션 내 페이드 + 레벨 조절로 최소 충족된다. 이 결정은 아키텍처 옵션 A를 흔들지 않는다(hook은 안전 강제·세션 중 레벨 전환으로 이미 과결정 — stateful/stateless는 상태 파일+`Stop` hook의 MVP 포함 여부만 좌우).
- 고정 용어 사전 커버리지 — SKILL.md 사전에 없는 용어는 스캐폴딩 대상이 아니다. 초기 사전 규모/우선 용어군과 확장 주기.
- 레벨별 용어 카운터 임계값 구체 수치(L1=3회? L2=1회?) — 실사용 튜닝 필요.
- `CLAUDE_PLUGIN_DATA` 실 환경변수명 확인 — 상태 저장 경로로 상정했으나 실제 노출 여부·정확한 명칭을 공식 문서/런타임으로 검증 필요(대안: `CLAUDE_CONFIG_DIR` 하위).
- 크롬 컨트롤 스택 확정: `claude-in-chrome` MCP vs computer-use vs gstack browse — 환경 의존.
- 외부 서비스 자동 설정 화이트리스트 확장 범위 — P0는 Supabase+Vercel. P1에서 추가할 서비스 목록과 "신뢰 가능 CLI/MCP" 판정 기준.
- statusline nudge를 사용자 `settings.json`에 자동 추가할지, 제안만 할지.
- 마켓플레이스 배포 여부 및 플러그인 공식 이름 확정.
- hook 구현 언어(Node vs bash) — caveman은 혼용, 보안 하드닝 난이도와 연동.
- transcript 매 턴 파싱 성능 — 긴 세션에서 O(transcript). hook 타임아웃(5s) 내이나 상한 측정·필요 시 tail-N 청크 파싱 등 상한 전략 검토.

## 부록 A. 리서치 출처 및 방법 (요구 7)

**수집 방법:** 웹·커뮤니티·공식 문서 교차 조사. **Reddit r/vibecoding은 Cloudflare WAF 차단으로 직접 수집 불가 → Hacker News 스레드의 1차 증언으로 대체 수집.** 아래는 페인포인트 발견(F1-F18)과 플러그인 메커니즘(리서치 A)을 출처 풀에 매핑한 표다(발견 클러스터 단위 근사 매핑).

| 발견 클러스터 | 출처 |
|---|---|
| F1 80%→100% 붕괴 · F2 아키텍처/유저플로우/비즈니스 3층 이해 · F3 재프롬프트 학습단락 | HN [46228104](https://news.ycombinator.com/item?id=46228104), [46851700](https://news.ycombinator.com/item?id=46851700) |
| F4 터미널 공포 3종 · F5 에러 해석 불가 | HN [45700656](https://news.ycombinator.com/item?id=45700656); DEV "5 mistakes vibe coders make" |
| F7 OAuth 콜백/redirect URI 미로(차별화 지점) | HN [44869331](https://news.ycombinator.com/item?id=44869331); code.claude.com/docs (설정 갭 영역) |
| F8 DB 데이터모델 vs 연결배관 · F9 플랜 먼저(Lovable ↔ Plan Mode) | a16z(vibe coding 분석); Zapier / Altar vibe-coding 가이드 |
| F11 progressive disclosure(작동 예제 수정) · F12 faded worked examples | Andy Matuschak(progressive disclosure); HMH(just-in-time scaffolding) |
| F14 git 없이 시작=재앙 · F15 시크릿 노출(배포 앱 절반 이상 크리덴셜 노출) | Cybernews(크리덴셜 노출 조사); HN [43449271](https://news.ycombinator.com/item?id=43449271) |
| F16 비용 폭탄·무한 수정 루프 · F18 배포 전 체크리스트 게이트 | HN [45968872](https://news.ycombinator.com/item?id=45968872); Zapier |
| F17 Replit 프로덕션 DB 삭제 사례 | Fortune / Cybernews(Replit 사고 보도) |
| 리서치 A: 플러그인 메커니즘(hook·output-style·plugin.json userConfig) | code.claude.com/docs — hooks / output-styles / plugins-reference; 로컬 caveman 플러그인 |

> 이 매핑은 팀리드 제공 출처 풀에 대한 발견 클러스터 근사 대응이며, HN item ID가 1차 증언의 앵커다. 개별 F항목의 정밀 1:1 출처는 확정이 아니라 구현 착수 시 재확인 대상이다.
