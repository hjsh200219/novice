---
created: 2026-07-20T08:31:00+09:00
project: novice
summary: ralplan 합의(Critic APPROVE)로 바이브 코딩 입문자용 플러그인 PRD v1 확정, repo 신설·푸시
---

## Session Digest
/ralplan으로 "바이브 코딩 입문자용 Claude Code 플러그인" 계획 수립. 리서치 2건(입문자 페인포인트 F1-F18 · 플러그인 메커니즘) → Planner 초안 → Architect 1차(P0 2건) → Critic 1차(ITERATE) → 개정 2회 → Architect 2차 → Critic 2차 APPROVE. PRD를 docs/PRD.md로 저장하고 GitHub repo(hjsh200219/novice, public — 플러그인 설치 배포용) 신설·푸시. 구현은 미착수(사용자 실행 승인 대기).

## Progress
- [DONE] PRD v1 합의 완료 (`docs/PRD.md`, status: pending approval)
- [DONE] GitHub repo 생성·푸시 (`git@github.com:hjsh200219/novice.git`, main)
- [TODO] 구현 착수 (Phase 0~2 = P0 MVP) — 사용자 승인 필요

## Next Steps
1. 사용자 실행 승인 후 team(병렬) 또는 ralph(순차)로 Phase 0 착수
2. 착수 전 Open Questions 결정: 플러그인 공식 이름, 마켓플레이스 배포 여부, hook 언어(Node vs bash), `CLAUDE_PLUGIN_DATA` 실 환경변수명 검증
3. Phase 0: plugin.json(userConfig) + output-styles/beginner-base.md + skills/beginner-mode/SKILL.md

## Blockers
- 없음 (구현은 승인 대기일 뿐)

## Watch Out
- 아키텍처 seam 규율: 레벨 가변 내용을 output-style에 절대 넣지 말 것(세션당 1회 로드 제약) — PRD §5.2
- 안전 게이트는 PreToolUse hook 강제 차단(off 무관 always-on), 텍스트 권고로 구현하면 안 됨 — PRD §4.4
- MVP 용어 카운터는 stateless(상태 파일 없음, transcript 세션 내 카운트). Stop hook·explained-terms.json은 P1 — PRD Open Questions [결정됨]
- caveman 선행 패턴 위치: `~/.claude/plugins/cache/caveman/caveman/25d22f864ad6/src/hooks/` (transcript_path 선례 = caveman-mode-tracker.js:50)

## Files Touched
- docs/PRD.md (신규, 합의 완료본)
- 원본: workspace/.omc/plans/2026-07-20-vibe-beginner-plugin-prd.md (동일 내용)
