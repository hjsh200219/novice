# ARCHITECTURE

novice는 Claude Code hook + skill + config 데이터로 구성된 학습 동반자 플러그인이다.
런타임 코드는 hook 핸들러(stdin JSON → stdout JSON)이고, 동작 규칙은 config JSON에 데이터로 있다.

## 레이어와 종속성 방향

```
config/*.json (데이터 SSOT)
      ▲ (읽기 전용 소비)
scripts/lib/*.js (순수 로직)
      ▲ (import)
scripts/*.js (hook 핸들러)        skills/*/SKILL.md (모델용 절차)
      ▲
tests/ (검증)
```

| 레이어 | 위치 | 역할 | 허용 import |
|--------|------|------|-------------|
| L1 config | `config/*.json`, `config/bootstrap-manifests/` | 동작 규칙 데이터 SSOT | (코드 아님) |
| L2 lib | `scripts/lib/` | 순수 로직 | node 내장 + 같은 lib. **hook 핸들러 import 금지** |
| L3 hook | `scripts/*.js` | hook 진입점 | `scripts/lib/`, node 내장 |
| L4 skills | `skills/` | 모델용 절차 문서 | (문서) |
| L5 tests | `tests/` | 검증 | 전부 |

**종속성 규칙**: L2 lib는 L3 hook을 import하지 않는다(역방향 금지). hook은 lib를 통해서만 상태·검증에 접근한다. config는 코드가 읽는 데이터이며 코드를 참조하지 않는다. 상세 규칙: [docs/design-docs/layer-rules.md](./docs/design-docs/layer-rules.md).

## lib 모듈 맵 (L2)
| 모듈 | 책임 |
|---|---|
| `state.js` | 영속·세션 상태 단일 진입. atomic write, 0600, symlink 거부, project override / session state, mute(프로젝트 스코프) |
| `hookio.js` | stdin/stdout 계약, emit 헬퍼, fail-open/fail-closed |
| `secrets.js` | 시크릿 스캔·redaction (원문 미저장), 안전 규칙 로드 |
| `grammar.js` | Bash·PowerShell 유한 grammar 토크나이저 + git subgrammar |
| `capsule.js` | mode capsule·glossary·tombstone·fade 계산 |
| `manifest.js` | bootstrap manifest 검증·로드 (Tier 1/2) |
| `capability-router.js` | CLI→MCP→Chrome→guided manual 경로 결정·검증·다운그레이드 |
| `fingerprint.js` | tool 호출 fingerprint (post-tool event 중복 제거) |
| `safety.js` | PreToolUse 안전 분석 (rm·git·deploy·MCP 판정, grammar+secret 소비) |

## hook 핸들러 맵 (L3)
| hook | 파일 | 책임 |
|---|---|---|
| SessionStart | `session-start.js` | 상태 복구·capsule/glossary 주입 |
| UserPromptSubmit | `user-prompt-submit.js` | 자연어 명령(mode/reset/mute), capsule 중복 방지 |
| UserPromptExpansion | `user-prompt-expansion.js` | `/novice:mode` 처리 |
| PreToolUse | `pre-tool-use.js` | 안전 게이트 (deny-only; 파괴 비가역·시크릿만 차단, 오류 시 fail-closed) |
| PostToolUse | `post-tool-use.js` | 출력 redaction + event 기록 |
| PostToolUseFailure | `post-tool-use-failure.js` | 실패 event 기록 |
| PostToolBatch | `post-tool-batch.js` | batch 집계·개입 (single-writer) |
| Stop | `stop.js` | 용어 카운터 |
| SessionEnd | `session-end.js` | 세션 정리·TTL |
| (라이브러리) | `bootstrap-engine.js` | setup-service 상태 머신 + capability 라우터 |

## 교차 관심사
- **상태**: 전부 `state.js` 경유, `CLAUDE_PLUGIN_DATA` 아래에만.
- **안전**: pre-tool-use = fail-closed; 학습 hook = fail-open.
- **시크릿**: `secrets.js`가 스캔·redaction, 원문은 로그·state·metric에 미기록.
- **credential**: 플러그인이 값을 다루지 않음. bootstrap audit엔 메타데이터만.
