---
created: 2026-08-02T12:00:00+09:00
project: novice
summary: 0.4.0 — /novice:focus 응답 형태 규칙 다이얼 포팅(ayghri/i-have-adhd, MIT) + evals 하네스, 160→195 tests
---

## Session Digest
외부 repo [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd)(MIT, 15.3k★) 기능 포팅 세션.
사용자 결정: **전체 포팅(evals 포함)** + **충돌 시 focus 우선, 용어 병기는 유지**.

- **`/novice:focus` 다이얼 신설** — 응답 형태 규칙 10개(행동 우선·번호 목록·하나의 next action·
  곁가지 억제·상태 재진술·구체적 시간 추정·완료 결과 가시화·담담한 에러 서술·목록 5개 상한·
  서론/요약/맺음말 금지)를 `NOVICE_FOCUS` capsule로 주입. 규칙 SSOT는 `config/focus-rules.json`.
- **level과 독립된 다이얼** — `novice off`에서도 살아 있음. `NOVICE_STATE`/`NOVICE_FOCUS`로
  네임스페이스 분리, 각자 tombstone·supersession 보유. 프로젝트 스코프 저장 + userConfig
  `focus_default`.
- **evals 하네스**(`evals/`) — 케이스 16 + 결정적 형태 검사 13종 + 가중 루브릭.
  upstream Python 러너 대신 `node:test`로 재작성(외부 dependency 0·네트워크 0 유지).
- 160 → 195 tests. PRD rev 12→13(§4.4b 신설). 0.4.0 bump + README Release Notes(한/영).

## Progress
- 완료: focus capsule·tombstone·revision·segment 판정(`capsule.js`), `focus_enabled` override +
  `setProjectFocus`(`state.js`), 훅 3종 두 capsule 합성(session-start/submit/expansion)
- 완료: `/novice:focus on|off` slash + 자연어 `novice focus on|off`, `skills/focus/SKILL.md`
- 완료: evals 코퍼스·checker·runner + `npm run evals`, contract fixture 1건(derived)
- 완료: 문서 전량 동기화(README 한/영, PRD rev 13, AGENTS 제약 6번, ARCHITECTURE, QUALITY,
  mode/front-door 스킬, marketplace)
- 완료: **0.4.0 릴리스** — commit `fe96dfc`, push `e251fef..fe96dfc`,
  `claude-novice@0.4.0` npm 게시(latest, 39 files, 66.8kB, shasum `bd075d1a…`)
- 완료: **이전 세션의 잘못된 기록 정정** — `.env`의 NPM 키는 죽은 토큰이 **아니다**.
  bypass-2FA granular 토큰(id `11e994`, 2026-07-22 생성)이고 살아 있다. 아래 Watch Out 참조
- 미완: product beta(사람 참가자), 실제 CLI 설치·로그인 E2E (carryover)
- 미완: **evals 판단 축 미실행** — 정확성·자율성·안전은 `rubric.md`로 분리돼 CI가 안 잡는다.
  focus on/off 두 조건 응답을 실제로 수집해 채점한 적 없음.

## Next Steps
1. evals 판단 축 1회 실행 — `cases.jsonl` 프롬프트를 focus on/off로 각각 받아
   `node evals/run.js <responses.json>` + `rubric.md` 수동 채점. 형태 검사만 CI에 있다.
2. product beta 준비 (concierge n≥5, moderated n≥20) — PRD §완료 기준.
3. (선택) 문서화한 설치 채널 실측 검증 — settings.json 자동 설치·`--plugin-url`은 문서 기반.

## Blockers
- 없음

## Watch Out
- **focus는 level과 별개 다이얼이 확정 설계** — `novice off`가 focus에 전파되면 안 된다.
  off 전파 제안 금지. [[novice-safety-minimalism]] 계열의 "재도입 금지" 항목과 같은 성격.
- **충돌 시 focus 우선, 단 용어 괄호 병기는 유지** — `commit(…)`은 인라인이지 서론이 아니다.
  용어 보존은 제품의 존재 이유라 focus가 이 부분은 못 이긴다.
- **`tests/unit/output-style.test.js`는 손대지 말 것** — `scripts/hooks/skills/config` 트리에
  `output style`·`outputStyle`·`force-for-plugin` 문자열 0건을 강제한다. PRD가 기각한 설계안 C의
  재유입 가드. upstream SKILL.md 프론트매터의 `tags: [ADHD, Output Style]`를 그대로 복사하면 깨진다.
- **focus capsule revision은 규칙 id로만 계산** — 문구만 고치면 rev 유지(재주입 없음),
  규칙 추가·삭제 시에만 1회 재주입. 오탈자 수정이 매 세션 재주입을 유발하지 않게 한 의도적 설계.
- **capsule 상한 초과 시 산문 부속(예외·우선순위)을 먼저 버리고 규칙 목록은 절대 자르지 않는다.**
- **`skip_next_submit` 핸드셰이크는 두 다이얼 공유** — `changed` 플래그로 판정한다. 어느 한쪽
  revision이 달라지면 둘 다 재주입. 한쪽만 스킵하는 로직 넣지 말 것.
- **evals는 두 겹** — 형태 규칙 13종만 CI(`npm test`)가 잡는다. 정확성·자율성·안전은 사람/LLM
  judge 몫(`evals/rubric.md`). "evals 통과 = 품질 검증 완료"라고 말하면 안 된다.
- **checker에 새 check 추가 시 `SAMPLES` good/bad 쌍 필수** — `focus-evals.test.js`가 강제한다.
  샘플 없는 check는 "항상 통과"로 조용히 썩는다.
- 릴리스 = plugin.json+package.json 동기 bump → Release Notes → push → publish. [[npm-publish-flow]]
- **`npm login`을 실행하지 말 것 (publish 인증)** — 2026-08-02에 이걸로 한 번 막혔다.
  `~/.npmrc`의 granular 토큰을 **웹 세션 토큰으로 덮어쓰고**, 세션 토큰은 bypass-2FA가 없어
  publish가 `E403 Two-factor authentication ... required`로 죽는다. 401을 보면 로그인부터
  하지 말고 **`.env`의 NPM 키를 먼저 테스트**한다:
  `npm whoami --userconfig=<임시파일>` (임시파일에 `//registry.npmjs.org/:_authToken=<키>`).
- **`.env`의 NPM 키는 살아 있는 bypass-2FA granular 토큰이다 — 지우지 말 것.**
  (id `11e994`, 2026-07-22 생성, `claude-novice` read+write.) 이전 HANDOFF의 "죽은 `.env`
  NPM_KEY(401) 제거" 항목은 **오기**였다. 401을 냈던 건 `~/.npmrc`에 있던 별개의 옛 토큰이다.
  복구법: `npm config set //registry.npmjs.org/:_authToken=$(grep -m1 NPM .env | cut -d= -f2-)`
- `.env`는 gitignore됨 — 커밋 절대 금지. 시크릿·토큰·recovery code는 채팅에도 붙이지 말 것.
  (토큰 동일성 확인은 값 출력 없이 접두어·접미어 `case` 매칭으로 한다.)

## Files Touched
- 신규: config/focus-rules.json, skills/focus/SKILL.md,
  evals/{cases.jsonl,checker.js,run.js,rubric.md,README.md},
  tests/unit/{focus,focus-evals}.test.js, tests/fixtures/contract/user-prompt-expansion-focus.json
- 코드: scripts/lib/{capsule,state}.js, scripts/{session-start,user-prompt-submit,user-prompt-expansion}.js
- 테스트: tests/integration/hooks-contract.test.js
- 문서: README.md, docs/PRD.md, docs/QUALITY.md, AGENTS.md, ARCHITECTURE.md,
  skills/{mode,novice}/SKILL.md, .claude-plugin/{plugin,marketplace}.json, package.json
