---
name: novice-capsule-injection-invariants
description: capsule 주입 불변식 3가지 — revision은 identity 집합 해시, 상한 초과 시 산문부터 폐기(지시 목록 불가침), 다이얼별 네임스페이스·tombstone + 공유 skip 핸드셰이크
type: project
created: 2026-08-02
---

`scripts/lib/capsule.js`가 매 turn 주입하는 capsule은 세 불변식을 공유한다.
0.4.0의 focus 다이얼로 이 패턴이 세 번째 반복됐다(우연이 아니라 설계). 네 번째 다이얼도 따라야 한다.

**1. revision = identity 집합의 해시이지 내용의 해시가 아니다.**
- `focusRevision` → 규칙 **id 목록**만 (`rules.map(r => r.id)`)
- `glossaryRevision` → **term 이름** 정렬 목록만
- `capsuleRevision` → level · faded terms · schema_version

문구·오탈자를 고쳐도 revision이 유지돼 **재주입이 없다**. 규칙을 추가·삭제할 때만 1회 재주입된다.
"JSON 전체를 해시하는 게 정확하다"는 개선은 회귀다 — 오탈자 수정 한 번이 전 세션 재주입 churn을 만든다.

**2. 상한(`*_max_chars`) 초과 시 폐기 순서가 정해져 있다.** 산문 부속(예외·우선순위 설명)을 통째로
먼저 버리고 **번호 붙은 지시 목록은 절대 자르지 않는다.** `slice()`는 그 뒤 마지막 수단이다.
목록 중간이 잘리면 모델이 규칙 절반만 따르는 최악 상태가 된다.

**3. 다이얼마다 네임스페이스·tombstone·supersession을 따로 갖는다.** `[NOVICE_STATE]` / `[NOVICE_FOCUS]`.
각 capsule은 "이전 turn의 같은 네임스페이스 지시를 대체한다"는 supersession 문장을 달고, off 전환 시
자기 tombstone을 **1회만** 낸다(`*_tombstone_emitted`). 반면 `skip_next_submit` 핸드셰이크는
**두 다이얼이 공유**한다 — 어느 한쪽 revision이라도 바뀌면 `changed`가 서고 둘 다 재주입된다.
두 capsule은 한 payload로 합성되므로 **한쪽만 스킵하는 최적화는 불가능**하다.

**Why:** capsule은 매 turn 컨텍스트 예산을 먹는다. 중복 억제(revision)와 상한(폐기 순서)이 그 예산을
지키는 두 장치인데, 둘 다 "더 정확해 보이는" 방향으로 고치면 조용히 망가진다 — 전체 해시는 churn을,
무지성 `slice`는 반쪽 규칙을 만든다. 테스트로 안 잡히고 런타임 토큰 낭비·규칙 미준수로만 드러난다.
**How to apply:** 새 다이얼·capsule 추가 시 (1) revision 입력은 id/이름 집합으로 한정,
(2) 상한 로직은 산문→목록 순 폐기, (3) 고유 네임스페이스 + 전용 tombstone 플래그,
(4) skip 핸드셰이크는 기존 `changed` 플래그에 합류. 관련: [[zero-dep-harness-approach]].
