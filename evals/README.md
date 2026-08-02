# focus evals

`/novice:focus` 응답 형태 규칙이 실제로 지켜지는지 재는 코퍼스와 채점기.

## 구성

| 파일 | 역할 |
|---|---|
| `cases.jsonl` | 케이스 16개 — 프롬프트, 사람이 볼 기준(`criteria`), 자동 검사 목록(`checks`), 대응 규칙(`rules`) |
| `checker.js` | 결정적 형태 검사 13종. 모델을 호출하지 않는다 |
| `run.js` | 케이스 목록 출력 / 응답 파일 채점 |
| `rubric.md` | 판단이 필요한 축(정확성·자율성·안전 등) 가중 루브릭 |

## 두 겹으로 나눈 이유

형태 규칙(서론 금지, 번호 목록, 목록 5개 상한 …)은 **정규식으로 판정 가능**하다.
이건 `checker.js`가 하고 `npm test`에서 매번 돈다 — 모델 호출도, 네트워크도 없다.

정확성·자율성·안전은 판정에 모델이나 사람이 필요하다. 이건 `rubric.md`로 분리했다.
CI가 붙잡을 수 있는 절반만 CI에 넣고, 나머지는 릴리스 전 수동 판정으로 둔다.

## 사용

```bash
node evals/run.js                    # 케이스·규칙 커버리지 확인
node evals/run.js responses.json     # 형태 규칙 채점
```

`responses.json`은 `{ "<case id>": "<응답 전문>" }` 형식이다. 응답 수집은 이 하네스 밖의
일이다 — 재려는 모델에 `cases.jsonl`의 `prompt`를 그대로 넣고, focus on 상태와 off 상태를
따로 받아 비교한다.

```bash
# 예: focus on / off 두 조건을 각각 받아 비교
node evals/run.js responses.focus-on.json
node evals/run.js responses.baseline.json
```

## 케이스를 추가할 때

1. `cases.jsonl`에 한 줄 추가. `checks`는 `checker.js`의 `CHECKS` 키만 쓴다.
2. `rules`에 대응하는 `config/focus-rules.json`의 규칙 id를 적는다.
3. `npm test`를 돌린다 — `tests/unit/focus-evals.test.js`가 스키마·미지 check 이름·규칙
   커버리지(모든 규칙이 최소 1개 케이스에 매핑)를 강제한다.

## 출처

케이스·루브릭 원형은 [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd) (MIT).
한국어 프롬프트로 옮기고, 용어 보존·다이얼 독립성 케이스와 결정적 checker를 novice가 더했다.
upstream 러너는 Python + 실제 모델 호출이지만, novice는 외부 dependency 0 원칙에 따라
`node:test`와 오프라인 채점으로 다시 썼다.
