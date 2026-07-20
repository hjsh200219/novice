---
name: novice
description: novice 학습 동반자 현황 + 하위 명령 안내 (front door) — /novice:mode, /novice:setup-service
disable-model-invocation: true
---

# /novice — 현황 + 하위 명령

이 플러그인의 front door다. 인자 없이 현재 상태를 한눈에 보여 주고, 실제 작업은
하위 명령으로 넘긴다. (플러그인 명령은 항상 `/novice:` 로 namespace된다.)

## 할 일

1. 현재 프로젝트의 novice 설정을 읽어 아래 표로 보여 준다. 상태는 다음 명령으로 읽는다
   (`CLAUDE_PLUGIN_DATA`는 런타임이 주입하므로 인자로 넘기지 않는다):

   ```
   node -e "import(process.env.CLAUDE_PLUGIN_ROOT + '/scripts/lib/state.js').then(m=>{const c=m.getProjectConfig(process.cwd());console.log(JSON.stringify({level:c.level,enabled:c.enabled,muted:c.muted_terms}))})"
   ```

   | 항목 | 값 |
   |---|---|
   | novice 레벨 | `level` (enabled=false면 "off"로 표시) |
   | 학습층 | enabled=true → 켜짐 / false → 꺼짐 |
   | 안전 게이트 | 최소 deny-only 코어 — 파괴 비가역 명령·노출된 시크릿만 차단. 플러그인 활성 동안 유지 |
   | mute된 용어 | `muted` 목록 (없으면 "없음") |

2. 이어서 하위 명령을 안내한다:

   | 명령 | 용도 |
   |---|---|
   | `/novice:mode 1\|2\|3\|off` | 레벨 확인·전환 (상세: mode 스킬) |
   | `/novice:setup-service` | 외부 서비스 CLI 부트스트랩 (탐지·설치·로그인·인증) |
   | `novice mute/unmute/reset <용어>` | 용어 설명 제어 (자연어 별칭) |

## 하지 말 것

- 상태만 보여 주고 임의로 mode를 바꾸지 않는다. 전환은 `/novice:mode`가 담당한다.
- 안전 게이트는 **최소 deny-only 코어**다: 파괴 비가역 작업(`rm -rf ~` 등)과 노출된 시크릿만
  차단하고, 그 외(파싱 불가한 파이프·체인 포함)는 Claude Code 네이티브 권한에 위임한다.
  "항상 모든 걸 막는다"고 단정하지 않는다 (README 안전 게이트 위협 모델 참조).
