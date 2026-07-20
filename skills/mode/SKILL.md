---
name: mode
description: novice 레벨 확인·전환 — /novice:mode 1|2|3|off
disable-model-invocation: true
---

# /novice:mode — novice 레벨 확인·전환

인자 없이 실행하면 현재 상태를 보여 주고, `1|2|3|off` 인자로 mode를 전환한다.
mode는 **현재 프로젝트에** 저장되어 세션이 바뀌어도 유지된다.

## 레벨별 동작

| 축 | Level 1 (기본) | Level 2 | Level 3 | off |
|---|---|---|---|---|
| 용어 설명 | 세션 첫 노출부터 3회까지 병기 | 3회까지 병기 | 요청 시만 설명 | novice 설명 없음 |
| 행동 해설 | 실행 전 무엇·왜, 실행 후 변경 결과 | 핵심 결정만 | 아키텍처·유저플로우 중심 | novice 지시 억제 |
| 시각화 | 3단계 이상 작업·분기·복구 시 표 | 중요 분기에서 표 | 요청 또는 위험 시 표 | novice 시각화 없음 |
| 안전 게이트 | 유지 | 유지 | 유지 | **유지** (플러그인 활성 동안) |

- 용어는 순화하지 않는다. `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`처럼
  실제 용어 뒤에 설명을 병기하고, 충분히 노출된 용어는 설명을 걷어낸다.
- `off`는 novice 톤·설명·시각화만 끈다. 파괴·시크릿·외부 부작용 안전 게이트는
  플러그인이 활성화된 동안 계속 동작한다. 플러그인 자체를 disable하면 게이트도 사라진다.

## 사용 예

```
/novice:mode        ← 현재 level, 적용 범위, 안전 게이트 상태 표시
/novice:mode 2      ← Level 2로 전환
/novice:mode off    ← novice 학습층 끄기
```

## 자연어 별칭 (프롬프트 전체가 정확히 일치할 때만)

- `novice 1` / `novice 2` / `novice 3` / `novice off` — mode 전환
- `novice reset all` — 모든 용어 설명 카운터 초기화
- `novice reset <용어>` — 해당 용어만 초기화 (예: `novice reset commit`) — 다시 처음부터 카운트
- `novice mute <용어>` — 해당 용어를 영구 제외 (노출 횟수와 무관하게 설명 중단, 예: `novice mute commit`)
- `novice unmute <용어>` — mute 해제 (다시 fade 규칙에 따라 설명)

reset과 mute의 차이: **reset**은 카운터를 0으로 되돌려 다시 N회 설명하게 하고,
**mute**는 지금 즉시 설명을 끊고 계속 끊어 둔다. `novice mute`는 용어(alias 포함)를 인식하며,
사전에 없는 용어는 무시한다. mute는 **프로젝트 단위로 저장되어 세션이 바뀌어도 유지**된다
(reset·용어 카운터는 세션 스코프).

"더 쉽게 설명해 줘" 같은 일반 문장은 현재 답변에만 영향을 주고 mode를 바꾸지 않는다.
잘못 전환했다면 같은 명령으로 즉시 되돌릴 수 있다.
