---
created: 2026-07-20T09:15:00+09:00
project: novice
summary: PRD revision 3 확정 (codex·claude 교차 리뷰 + 플랫폼 사실 검증 반영), 구현은 승인 대기
---

## Session Digest

PRD revision 2(Codex 리뷰본)를 Claude가 공식 Claude Code 문서 대조로 교차 검증한 후 revision 3으로 확정 (commit 7b12579, 푸시 완료). 사실 오류 1건(UserPromptExpansion 필드), 설계 갭 4건(비용 루프 hook 미배정, 자연어 트리거 오탐, off 즉시성 충돌, headless 정책), 문서 품질 3건(원 요구 verbatim, 요구 6 완화 표기, 시크릿 스캔 메커니즘)을 모두 반영. 구현은 여전히 사용자 승인 대기.

## Progress

- [DONE] PRD revision 3 확정·푸시 (commit 7b12579)
  - UserPromptExpansion 필드 교정: `command_name`/`command_input`/`expanded_prompt` (`command_args`·`command_source`는 미존재)
  - invalid-args block 가능 여부 → Phase 0 spike 실측 항목으로 이동 (불가 시 skill validation fallback)
  - 비용·반복 루프 gate를 `PostToolUse`에 정식 배정 (hook 책임표·위협모델·Phase 2 기준 연동)
  - 자연어 전환·reset trigger 고정 목록 매칭 한정 + 오탐 리스크 행 추가
  - off 즉시성 통일: 두 경로 모두 capsule 주입 전 state 갱신 → 해당 turn부터 반영
  - headless(`claude -p`) 정책: ask→deny 상향, defer 미사용
  - 시크릿 스캔 메커니즘 복원: `git diff --cached` + `git diff HEAD` 병행 (`-am`/path commit 우회 대응)
  - 부록 B 신설: 사용자 원 요구 7개 verbatim 복원
  - 요구 6 커버리지 "충족(완화)" 표기 + 사유 명시
- [DONE] 플랫폼 사실 검증 (공식 docs 대조) — 결과는 `.claude-project/memory/` 참조
- [TODO] 구현 착수 (Phase 0 platform contract spike부터) — 사용자 승인 필요

## Next Steps

1. **사용자 실행 승인** — Phase 0~2 (P0 MVP) 착수 전제
2. **Phase 0 — platform contract spike**
   - `UserPromptExpansion`이 invalid args를 실행 없이 block할 수 있는지 실측 (불가 시 skill 안내문 validation fallback + Phase 1 기준 갱신)
   - 최소 `plugin.json`(userConfig: default_level, novice_enabled) + hook fixture harness + `config/*.json` schema
   - `SessionStart(source=compact)` state 재주입 실측
   - novice on/off·plugin enable/disable 전 경로에서 사용자 output style 무변경 검증
   - `${CLAUDE_PLUGIN_DATA}`에 project/session state 생성 확인 (plugin root 쓰기 금지)
3. **Phase 1 — mode·용어 core**
   - `/novice:mode`와 자연어 별칭이 같은 state writer 사용
   - 1→2→3→off 전환 capsule 정확도, 800자 상한, off 시 novice context 0건
   - `Stop.last_assistant_message` 기반 증분 카운트 (전체 transcript 재파싱 금지)
   - 고정 목록 밖 문장 무반응 fixture

## Blockers

- 없음 (구현은 사용자 승인 대기)

## Watch Out

- **output style 사용 금지 결정됨** (revision 2에서 확정) — `force-for-plugin`은 novice off와 양립 불가. 레벨 가변 내용은 hook capsule로만.
- **안전 게이트는 PreToolUse 강제 차단** (novice off 무관 always-on, 단 plugin disable 시 소멸) — 텍스트 권고 구현 금지.
- **용어 카운터는 stateful** (revision 2에서 변경, 구 HANDOFF의 "stateless MVP" 경고 OBSOLETE) — `Stop.last_assistant_message` + `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`. atomic write·symlink 거부·0600 필수.
- **플랫폼 사실은 검증 완료** — `${CLAUDE_PLUGIN_DATA}`(`~/.claude/plugins/data/{id}/`), `userConfig`, `Stop.last_assistant_message`, SessionStart 4종 source 모두 공식 문서 확인됨 (2026-07-20). 상세는 memory 파일. 단 invalid-args block은 미검증.
- **caveman 선행 패턴 참고**: `~/.claude/plugins/cache/caveman/caveman/*/src/hooks/` (transcript 파싱 선례 caveman-mode-tracker.js:50 — 단 revision 3 설계는 transcript 재파싱 대신 last_assistant_message 사용).

## Files Touched

- `docs/PRD.md` (revision 2 → 3)
- `.claude-project/memory/` (신규 — 플랫폼 검증 사실 저장)
- `.claude-project/HANDOFF.md` (본 파일 갱신)
