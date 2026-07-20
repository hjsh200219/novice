# novice — 비개발자 입문자용 Claude Code 플러그인

**한국어** · [English](#english)

비개발자 입문자가 Claude Code로 바이브 코딩을 시작할 때 실제 개발 용어와 학습 기회를 보존하고,
외부 서비스 CLI 설정을 안전한 범위에서 돕고, CLI 공포와 파괴·비용·시크릿 노출 위험을 줄이는
3단계 학습 동반자 플러그인입니다.

- 스펙: `docs/PRD.md` (revision 12)
- 최소 지원 런타임: Claude Code `2.1.215`
- 상태: MVP 구현 완료 — 테스트 149개 통과 (unit 11 + integration 4, 외부 dependency 0).
  실제 2.1.215 runtime에서 hook payload 캡처 + `--plugin-dir` live E2E 검증 완료.
  남은 것은 사람 참가자가 필요한 product beta 검증(concierge/moderated).

## 사용법

| 명령 | 동작 |
|---|---|
| `/novice` | front door — 현재 상태(레벨·학습층·안전 게이트·mute) 대시보드 + 하위 명령 안내 |
| `/novice:mode` | 현재 level, 적용 범위, 안전 게이트 유지 여부 표시 |
| `/novice:mode 1` | Level 1 (기본값) — 모든 용어에 설명 병기, 실행 전·후 해설 |
| `/novice:mode 2` | Level 2 — 3회까지 설명, 핵심 결정만 해설 |
| `/novice:mode 3` | Level 3 — 요청 시만 설명, 아키텍처·유저플로우 중심 |
| `/novice:mode off` | novice 톤·설명·시각화 완전 제거 (안전 게이트는 유지) |

### 자연어 명령

프롬프트 **전체가 정확히** 아래 형태와 일치할 때만 동작합니다(앞뒤 공백·마침표만 허용).
"더 쉽게 설명해 줘" 같은 일반 문장은 현재 답변에만 영향을 주고 설정을 바꾸지 않습니다.

| 명령 | 동작 | 예시 |
|---|---|---|
| `novice 1` / `novice 2` / `novice 3` / `novice off` | 모드 전환 (`/novice:mode N`과 동일) | `novice 2` |
| `novice reset all` | 모든 용어의 설명 카운터 초기화 (다시 처음부터 N회 설명) | `novice reset all` |
| `novice reset <용어>` | 특정 용어만 카운터 초기화 | `novice reset commit` |
| `novice mute <용어>` | 특정 용어를 **영구 제외** — 노출 횟수와 무관하게 설명 중단 | `novice mute commit` |
| `novice unmute <용어>` | mute 해제 — 다시 fade 규칙에 따라 설명 | `novice unmute commit` |

- **reset vs mute**: `reset`은 카운터를 0으로 되돌려 **다시** N회 설명하게 하고, `mute`는 지금 즉시 설명을 끊고 계속 끊어 둡니다.
- **mute는 프로젝트 단위**로 저장되어 세션이 바뀌어도 유지됩니다. reset·용어 카운터는 세션 스코프입니다.
- 용어(예: `commit`)는 한글 별칭(`커밋`)으로도 지정할 수 있고, 사전에 없는 용어는 무시됩니다.

용어는 순화하지 않습니다. `commit(현재 변경을 하나의 저장 지점으로 기록하는 것)`처럼
실제 용어 뒤에 설명을 병기하고, 세션에서 충분히 노출된 용어(Level 1 기준 3회)는 설명을 걷어냅니다.

## 외부 서비스 CLI 부트스트랩 (2-tier)

자동화 경계는 두 tier 모두 **탐지 → 설치 → 로그인 → 인증 상태 확인까지**입니다.

- **Tier 1** (검토된 manifest: Vercel, GitHub CLI, Supabase): 고정 package coordinate로
  표준 승인 흐름 실행. 설치와 로그인은 각각 1회씩 승인받습니다.
- **Tier 2** (그 외 CLI): 공식 문서 URL·package coordinate·실행 argv를 화면에 그대로
  제시하고, 사용자가 근거를 확인·승인한 경우에만 같은 engine으로 진행합니다.
  공식 근거를 확인할 수 없으면 guided manual로 낮춥니다.

리소스 생성·env/secret 값 입력·배포는 **사용자가 직접** 하거나 guided manual로 안내합니다.
플러그인은 credential 값을 요청·보관·전달·자동입력하지 않습니다.
secure 저장소를 지원하는 CLI(gh, supabase)가 plaintext fallback으로 떨어지는 환경에서는
자동 로그인을 중단합니다. 파일 저장이 공식 기본 동작인 CLI(vercel)는 저장 위치와
logout 경로를 로그인 승인 전에 고지합니다 — provider별 정책은 manifest의
`credential_store`에 명시되어 있습니다.

CLI 설치를 거부하거나 preflight가 실패하면 capability 라우터가
**CLI → 공식/동의된 MCP → visible Chrome → guided manual** 순으로 경로를 낮춥니다.
MCP는 두 경우에 쓰입니다 — (1) `mcp_allowlist`에 server·transport·publisher·tool·provenance가
모두 일치하는 사전 검토 엔트리, 또는 (2) **사용자가 Claude에 이미 등록한 서버 + 이번 작업에
명시적으로 동의**한 경우(동의한 tool 범위). 기본 allowlist는 비어 있어 등록·동의 없이는 자동
실행되지 않고, MCP 서버를 자동 설치하지 않습니다. CLI도 Tier 1 검토 manifest 외에 **사용자가
근거 확인 후 동의한 Tier 2 CLI**를 사용합니다. Chrome은 공식 Claude in Chrome 연결 시 visible
mode로만 씁니다. 라우터는 경로 결정·검증·다운그레이드까지 하고, 실제 MCP tool 호출은 모델이(안전
게이트가 계속 가드), Chrome 조작·최종 submit은 사용자가 합니다.

## 안전 게이트 위협 모델

안전 게이트는 **최소 deny-only 코어**입니다. 긍정적으로 식별한 파괴 비가역 작업과 노출된
시크릿 값만 차단하고, 확인 질문(ask) 티어는 두지 않습니다. 파싱할 수 없거나 애매한 명령은
판정하지 않고 **Claude Code 네이티브 권한 프롬프트**에 위임합니다.

| 위협 | 동작 | 보증하지 않는 범위 |
|---|---|---|
| 로컬 파괴 명령 (`rm -rf ~`·`/`·프로젝트 루트, `dd`/`mkfs`/`shred`, PowerShell `Format-Volume`/`Clear-Disk`) | bare 명령을 파싱해 catastrophic이면 deny | 난독화, 파이프·체인·치환 낀 명령, 일반 폴더 삭제, 플러그인 밖 실행 |
| Git history 파괴 (`push --force`) | protected branch 대상이면 deny | 비보호 branch force-push, `reset --hard`·`clean`(위임), 다른 Git client 작업 |
| DB/원격 리소스 삭제 (CLI·MCP) | production/unknown 대상 파괴 작업 deny | staging/dev 대상(위임), 외부 콘솔 직접 작업 |
| 시크릿 commit/deploy/명령줄 노출 | commit candidate tree·deploy 인자·명령줄 스캔 후 시크릿 값 발견 시 deny | 미지원 포맷, 암호화·난독화된 시크릿, 스캔 불가(대용량·exotic 옵션) |
| 비용·반복 루프 | batch당 최대 1회 개입 안내 | 정확한 과금 계산, hard billing cap |

### 명시적 비보증 (No silent security claims)

- **범용 shell parser가 아닙니다.** bare 단일 command + argv만 유한 grammar로 파싱합니다.
  pipe·리다이렉트·명령 치환·체인(`&&`·`;`) 등 미지원 문법은 **판정하지 않고 Claude Code
  네이티브 권한에 위임**합니다. 이 위임 때문에 파이프 낀 파괴 명령(`rm -rf / ; …`)은 novice가
  잡지 않을 수 있습니다 — 대신 CC 기본 권한 프롬프트가 처리합니다. (단, 명령줄에 노출된
  시크릿 값은 문법과 무관하게 스캔·deny합니다.)
- **확인 질문(ask) 티어가 없습니다.** 애매하면 묻지 않고 위임합니다 — benign 명령에 대한
  false-prompt를 없애기 위한 설계입니다. 되돌리기 어려운 파괴/시크릿만 차단합니다.
- **완전한 DLP·시크릿 관리자·악성 MCP 방어가 아닙니다.** 알려진 패턴 fixture 기준으로만 탐지합니다.
  스캔할 수 없는 대상(대용량 파일·exotic git 옵션·unborn HEAD)은 차단하지 않고 위임합니다.
- **timeout fail-open 한계:** Claude Code가 hook timeout·강제 종료를 non-blocking으로
  처리하는 경우는 보증 범위 밖입니다. hook 내부 오류·잘못된 입력·입력 상한 초과만 deny(fail closed)합니다.
- **플러그인을 disable/uninstall하면 안전 게이트도 사라집니다.** "always-on"은 플러그인이
  활성화된 동안만 의미합니다. novice `off`는 학습층만 끄고 안전 게이트는 유지합니다.
- **Git은 tracked 로컬 파일만 보호합니다.** untracked/ignored 파일, 외부 DB, 배포 리소스는
  Git checkpoint로 복구되지 않습니다.

## 상태와 privacy

- 상태는 `${CLAUDE_PLUGIN_DATA}` 아래에만 저장합니다 (project override, 세션별 용어 카운터).
  plugin root에는 쓰지 않습니다.
- 상태 파일: atomic write, `0600`, symlink 거부, size cap. 세션 상태는 `/clear` 시 삭제, 30일 TTL.
- secret scanner는 후보 바이트를 메모리에서만 검사하고 원문을 로그·state·metric에 남기지 않습니다.
- bootstrap audit에는 service ID·manifest revision·단계·exit status만 저장합니다.
- 원격 telemetry를 보내지 않습니다.

## 개발

```bash
npm test                  # 전체 (unit + integration)
npm run test:unit
npm run test:integration
```

외부 runtime dependency 없음 (Node >= 18, node:test). 테스트 구성: unit 11개 파일
(config·state·mode·capsule·stop·grammar·secrets·batch·bootstrap·capability-router·output-style),
integration 4개 파일 (hooks-contract·safety-corpus·safety-mutation·latency-benchmark).
안전 gate는 mutation 하네스로도 검증합니다 — 위험 명령 35건을 106개 mutant로 변형해 detector
우회가 없음을 확인합니다. latency 벤치는 blocking hook의 p95 예산(UserPromptSubmit ≤300ms,
PreToolUse ≤250ms)을 회귀 테스트로 강제합니다(`NOVICE_BENCH_ITERS`로 반복 횟수 조정).

`tests/fixtures/contract/`의 hook payload fixture는 Claude Code **2.1.215 실측 캡처**입니다
(provenance 필드로 캡처/파생/문서 구분 — 상세는 해당 디렉토리 README).
플러그인 자체도 같은 runtime에 `--plugin-dir`로 로드해 `/novice:mode` expansion →
상태 갱신 → capsule 주입까지 live E2E로 확인했고, hook 실행 순서(expansion→submit)도 실측했습니다.

코드로 검증 불가라 남는 항목: 실제 CLI 설치·로그인 E2E(사용자 환경·계정 필요),
`/clear`·compact의 SessionStart source·MCP destructive payload 실측(headless 트리거 불가),
product beta 지표(사람 참가자 필요).

---

<a name="english"></a>

# novice — a beginner-friendly Claude Code plugin

[한국어](#novice--비개발자-입문자용-claude-code-플러그인) · **English**

A three-level learning companion plugin for non-developers starting out with Claude Code.
It preserves real development terminology and learning opportunities, helps set up external
service CLIs within a safe boundary, and reduces the fear of the CLI along with the risk of
destructive commands, runaway cost, and secret exposure.

- Spec: `docs/PRD.md` (revision 12)
- Minimum supported runtime: Claude Code `2.1.215`
- Status: MVP implemented — 149 tests passing (11 unit + 4 integration, zero external
  dependencies). Verified against a real 2.1.215 runtime via hook-payload capture and a
  `--plugin-dir` live E2E. What remains is the product beta, which needs human participants.

## Usage

| Command | Behavior |
|---|---|
| `/novice:mode` | Show current level, scope, and whether the safety gate stays on |
| `/novice:mode 1` | Level 1 (default) — explanation appended to every term, before/after narration |
| `/novice:mode 2` | Level 2 — explain up to 3 times, narrate key decisions only |
| `/novice:mode 3` | Level 3 — explain on request only, architecture/user-flow focused |
| `/novice:mode off` | Fully remove novice tone/explanations/visualization (safety gate stays on) |

### Natural-language commands

These act only when the **entire prompt matches exactly** (leading/trailing whitespace and a
trailing period are tolerated). A general sentence like "explain it more simply" affects only
the current answer and does not change any setting.

| Command | Behavior | Example |
|---|---|---|
| `novice 1` / `novice 2` / `novice 3` / `novice off` | Switch mode (same as `/novice:mode N`) | `novice 2` |
| `novice reset all` | Reset every term's explanation counter (explain N times again) | `novice reset all` |
| `novice reset <term>` | Reset one term's counter | `novice reset commit` |
| `novice mute <term>` | **Permanently exclude** a term — explanation stops regardless of count | `novice mute commit` |
| `novice unmute <term>` | Undo a mute — explanation resumes per the fade rule | `novice unmute commit` |

- **reset vs mute**: `reset` restarts the counter from zero so the term is explained N more
  times; `mute` stops the explanation right now and keeps it off.
- **mute is stored per project**, so it persists across sessions. reset and the term counters
  are session-scoped.
- A term (e.g. `commit`) can be named by its Korean alias (`커밋`) too; unknown terms are ignored.

Terms are never simplified away. It appends an explanation after the real term, as in
`commit (recording the current changes as one save point)`, and once a term has appeared
enough times in a session (3 times at Level 1) the explanation is dropped.

## External service CLI bootstrap (2-tier)

The automation boundary for both tiers is **detect → install → log in → verify auth**.

- **Tier 1** (reviewed manifests: Vercel, GitHub CLI, Supabase): runs the standard approval
  flow with fixed package coordinates. Install and login are each approved once.
- **Tier 2** (any other CLI): the engine shows the official docs URL, package coordinate, and
  the exact argv on screen, and proceeds through the same engine only after the user confirms
  and approves the evidence. If no official provenance can be confirmed, it falls back to a
  guided manual.

Creating resources, entering env/secret values, and deploying are done by **the user
directly** or guided manually. The plugin never requests, stores, forwards, or auto-fills
credential values. For a CLI that supports secure storage (gh, supabase), auto-login is
aborted when the environment falls back to plaintext. For a CLI whose documented default is
file storage (vercel), the storage location and logout path are disclosed before the login is
approved — the per-provider policy lives in each manifest's `credential_store`.

If CLI install is refused or preflight fails, a capability router downgrades along
**CLI → official/consented MCP → visible Chrome → guided manual**. MCP is used in two cases —
(1) a pre-reviewed `mcp_allowlist` entry matching on server, transport, publisher, tools, and
provenance, or (2) a server the **user has already registered in Claude plus explicit per-task
consent** (limited to the consented tools). The default allowlist is empty, so nothing runs
without registration + consent, and MCP servers are never auto-installed. CLI likewise accepts,
beyond the Tier 1 reviewed manifests, a **Tier 2 CLI the user explicitly consents to after
seeing the evidence**. Chrome is used in visible mode only when the official Claude in Chrome is
connected. The router decides, validates, and downgrades — actual MCP tool calls are made by the
model (still guarded by the safety gate), and Chrome actions / final submit are done by the user.

## Safety gate threat model

The safety gate is a **minimal, deny-only core**. It blocks only positively-identified,
irreversible destructive actions and exposed secret values; there is no confirmation (ask) tier.
Anything it cannot parse or is unsure about gets no opinion and is delegated to **Claude Code's
native permission prompt**.

| Threat | Behavior | Not guaranteed |
|---|---|---|
| Local destructive commands (`rm -rf ~`·`/`·project root, `dd`/`mkfs`/`shred`, PowerShell `Format-Volume`/`Clear-Disk`) | parse the bare command, deny if catastrophic | Obfuscation, piped/chained/substituted commands, deleting a normal folder, execution outside the plugin |
| Git history destruction (`push --force`) | deny when the target is a protected branch | Force-push to an unprotected branch, `reset --hard`·`clean` (delegated), other Git clients |
| DB / remote resource deletion (CLI·MCP) | deny destructive ops on production/unknown targets | staging/dev targets (delegated), actions in an external console |
| Secret commit / deploy / command-line exposure | scan commit candidate tree, deploy args, and the command line; deny on a secret value | Unsupported formats, encrypted/obfuscated secrets, unscannable (oversize·exotic) |
| Cost / retry loops | at most one intervention per batch | Exact billing, hard billing cap |

### Explicit non-guarantees (No silent security claims)

- **Not a general shell parser.** It parses only a single bare command + argv. Unsupported
  syntax — pipes, redirects, command substitution, chains (`&&`·`;`) — gets **no opinion and is
  delegated to Claude Code's native permission**. Because of this, a piped destructive command
  (`rm -rf / ; …`) may not be caught by novice — Claude Code's own prompt handles it instead.
  (A secret value on the command line is still scanned and denied regardless of grammar.)
- **No confirmation (ask) tier.** When unsure it delegates rather than prompting — by design, to
  eliminate false prompts on benign commands. Only hard-to-reverse destruction/secrets are blocked.
- **Not a full DLP, secret manager, or malicious-MCP defense.** Detection is based only on
  known-pattern fixtures. Unscannable targets (large files, exotic git options, unborn HEAD) are
  delegated, not blocked.
- **timeout fail-open limit:** cases where Claude Code treats a hook timeout / forced kill as
  non-blocking are outside the guarantee. Internal hook errors, malformed input, and input-cap
  overflow are denied (fail closed).
- **Disabling/uninstalling the plugin removes the safety gate too.** "Always-on" only means
  while the plugin is enabled. novice `off` turns off only the learning layer; the safety gate
  stays on.
- **Git protects tracked local files only.** Untracked/ignored files, external DBs, and deploy
  resources are not recoverable via a Git checkpoint.

## State and privacy

- State is stored only under `${CLAUDE_PLUGIN_DATA}` (project override, per-session term
  counters). Nothing is written to the plugin root.
- State files: atomic write, `0600`, symlink refusal, size cap. Session state is deleted on
  `/clear`, with a 30-day TTL.
- The secret scanner inspects candidate bytes in memory only and never leaves the original in
  logs/state/metrics.
- The bootstrap audit stores only service ID, manifest revision, step, and exit status.
- No remote telemetry is sent.

## Development

```bash
npm test                  # everything (unit + integration)
npm run test:unit
npm run test:integration
```

No external runtime dependencies (Node >= 18, node:test). Test layout: 11 unit files
(config·state·mode·capsule·stop·grammar·secrets·batch·bootstrap·capability-router·output-style),
4 integration files (hooks-contract·safety-corpus·safety-mutation·latency-benchmark). The safety
gate is also checked by a mutation harness — it mutates 35 dangerous commands into 106 mutants
and confirms the detector is never bypassed. The latency benchmark enforces the blocking-hook p95
budget (UserPromptSubmit ≤300ms, PreToolUse ≤250ms) as a regression test (tune iterations with
`NOVICE_BENCH_ITERS`).

The hook-payload fixtures in `tests/fixtures/contract/` are **real Claude Code 2.1.215
captures** (the `provenance` field distinguishes captured/derived/documented — see that
directory's README). The plugin itself was also loaded on the same runtime via `--plugin-dir`
and confirmed end to end: `/novice:mode` expansion → state update → capsule injection, and the
hook execution order (expansion→submit) was captured too.

What cannot be verified in code (documented as such): real CLI install/login E2E (needs the
user's environment and accounts), real captures of the `/clear`/compact SessionStart source and
the MCP destructive payload (cannot be triggered headlessly), and the product-beta metrics
(need human participants).
