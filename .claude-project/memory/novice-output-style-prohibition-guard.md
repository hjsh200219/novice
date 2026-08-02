---
name: novice-output-style-prohibition-guard
description: output style 미사용은 PRD 확정 설계(설계안 C 기각). 가드가 scripts·hooks·skills·config 트리의 .js/.json/.md 전부에서 관련 문자열 0건을 강제 — 문서에 써도 깨진다
type: project
created: 2026-08-02
---

PRD가 **설계안 C(`force-for-plugin` output style + hooks)를 기각**했다. 이유: output style은 플러그인이
활성인 동안 사용자 설정을 계속 덮어써 **`novice off`와 양립 불가**이고, faded 상태와 상위 지시가 충돌한다.
채택된 설계 A는 hook 주입만 쓴다 — 그래서 `novice off`가 "기존 output style 복원"이라는 개념 자체를
필요로 하지 않는다.

이 결정은 `tests/unit/output-style.test.js`가 자동 가드로 못 박아 뒀다:
- **정적**: `scripts`·`hooks`·`skills`·`config` 트리의 **`.js`/`.json`/`.md` 전부**를 재귀 스캔해
  `/output[_-]?style|outputStyle|force-for-plugin/i` 매치가 1건이라도 있으면 실패.
- **동적**: mode 1/2/3/off 전환 + submit 경로에서 어느 hook 출력에도 output-style 계열 **키**가 없음을 확인.

**함정: 정적 검사가 `.md`까지 본다.** 코드가 아니라 **스킬 문서·프론트매터·주석에 문자열로만 써도 깨진다.**
0.4.0에서 외부 repo(ayghri/i-have-adhd) 규칙 체계를 포팅할 때 upstream SKILL.md 프론트매터의
`tags: [ADHD, Output Style]`가 여기 걸리는 것이 확인돼 해당 표기를 의도적으로 제외했다.

**Why:** "output style을 쓰지 않는다"는 novice의 제품 정체성(완전 off 보장)에 직결된 결정이라 문서 한 줄로는
못 지킨다. 가드가 문서 트리까지 스캔하는 것도 의도적이다 — 문서에 등장하기 시작하면 다음 단계는 구현이다.
반대로 이 넓은 스캔 범위 때문에 악의 없는 문서 작업이 테스트를 깨는 오해가 생기기 쉽다.
**How to apply:** 이 테스트가 깨지면 "테스트가 과하다"고 완화·예외 추가하지 말고 **해당 문자열을 쓰지 않는
쪽으로 고친다.** 외부 자료를 포팅·인용할 때 output style 언급을 먼저 제거한다. 설명이 꼭 필요하면
`docs/`(가드 스캔 범위 밖)에서 한다. 관련: [[novice-safety-minimalism]] — 둘 다 "기각된 설계의 재유입 금지" 계열.
