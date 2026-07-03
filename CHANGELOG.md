# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-07-03

### Security
- **High (mktemp trap cleanup)**: SKILL.md API model calling examples used `mktemp` for API key header files and payload files without trap cleanup. If the script received SIGINT/SIGTERM between `mktemp` and `rm -f`, temporary files containing API keys would leak on disk. Added `trap 'rm -f "$HEADER_FILE" "$PAYLOAD_FILE"' EXIT INT TERM` after every `mktemp` pair. (Fixes P1 issue found in audit.)
- **Medium (Ollama prompt via argv)**: Ollama model calling passed the prompt as a command-line argument (`exec "ollama","run",$ENV{MODEL},$ENV{PROMPT}`), making the prompt text visible to `ps`. Changed to stdin-based passing via Perl pipe (`open my $fh, "|-:unbuffered", "ollama", "run", $ENV{MODEL}`). (Fixes P1 issue.)
- **Medium (Pre-Flight Check timeout)**: Pre-Flight Model Check's `ollama run` had no timeout, potentially hanging forever if the remote service was unreachable. Added `alarm 30` via Perl. (Fixes P2 issue.)

### Fixed
- **Critical (| delimiter in AgentSwarm items)**: SKILL.md used `{model_id}|{role}|{system_instruction}|{task_description}` as the AgentSwarm item format, but `system_instruction` and `task_description` can contain `|` characters from user input, causing `split("|")` to produce wrong field alignment. Removed the `|`-delimited format entirely — Step 6 now embeds parsed fields directly into the prompt template, and subagents no longer need to `split` the item. (Fixes P0 issue.)
- **Critical (install.sh idempotency — orphan hook entries)**: install.sh only checked for the `# kimi-fleet-hook` marker comment to detect existing installations. If a previous install had created the `[[hooks]]` block without the marker (e.g. from an older script version), re-running install.sh would create a duplicate registration. Added Python-based orphan detection that scans for any `[[hooks]]` block referencing `kimi-fleet-hook.js` regardless of marker presence. (Fixes P0 issue.)
- **Critical (uninstall.sh missed orphan hook entries)**: uninstall.sh's Python state machine only entered hook-block removal when a `# kimi-fleet-hook` marker preceded the `[[hooks]]` line. An unmarked entry from an older installation was left behind, causing the config to reference a non-existent hook script. Removed the `skip_marker` state — the state machine now enters hook-block processing on every `[[hooks]]` line and discards any that reference `kimi-fleet-hook.js`, whether or not a marker is present. The outer shell guard also updated from `grep -qF` (fixed string) to `grep -q` (substring) to detect unmarked entries. (Fixes P0 issue.)
- **High (missing plan mode check)**: Step 1 had no check for `agent_mode=plan` (read-only mode). A user in plan mode would walk through the entire 8-step interactive flow only to have AgentSwarm fail on Step 7. Added **Step 0: Plan Mode Check** that stops early if the session is read-only. (Fixes P1 issue.)
- **High (missing model count < 2 check)**: SKILL.md said "at least 2 models" in the requirements, but no runtime check existed. If the user had only 1 model, the fleet flow would proceed pointlessly. Added a Model Count Pre-Check after Step 0 that checks the total model count and suggests `/swarm` if fewer than 2 models are available. (Fixes P1 issue.)
- **Medium (Pre-Fight :cloud suffix inconsistency)**: Pre-Flight Check unconditionally appended `:cloud` to ollama model names, while the model calling logic was conditional (skipping if the name already contained `:`). Made Pre-Flight's suffix logic match the model calling logic. (Fixes P2 issue.)
- **Medium (kimi-code managed model calling ambiguous)**: The kimi-code model section told subagents to "use your own reasoning if the session runs on a kimi-code model" without specifying API details. Added explicit instructions: key path (`providers.managed:kimi-code.api_key`), base_url (`providers.managed:kimi-code.base_url`), model parameter format, and a clear fallback strategy. (Fixes P2 issue.)
- **Medium (Step 4 role selection non-deterministic)**: Step 4 allowed agents to "pick the 4 most relevant roles" from 6, making behavior unpredictable. Fixed to a single deterministic strategy: split 6 roles + Other into two questions (frontend/backend/review/research and cheap-task/synthesize/Other). (Fixes P2 issue.)
- **Low (CJK detection incomplete)**: `isMultiRolePrompt()`'s `cjkAssign` pattern only matched `模型负责`, missing `模型做`, `模型来处理`, and `模型承担`. Expanded the regex to `/(模型负责|模型做|模型来处理|模型承担)/iu`. (Fixes P2 issue.)
- **Low (0-model providers in selection list)**: Provider selection showed providers with 0 models as selectable options. Step 2 now excludes 0-model providers from the selection list. (Fixes P3 issue.)
- **Low (empty model selection not handled)**: If the user viewed all model batches but selected none, the workflow would proceed with an empty model list. Added handling: ask the user whether to abandon fleet or reselect. (Fixes P3 issue.)
- **Low (Python tomllib fallback missing)**: The hook's embedded Python script hardcoded `import tomllib` (Python 3.11+). Added try/except fallback to `import tomli as tomllib` for Python < 3.11 systems with the `tomli` backport installed. (Fixes P3 issue.)

### Verified
- 25-regression hook detection test: all scenarios pass including 3 new CJK patterns, 20 original regression cases, and 2 edge cases.
- Install/uninstall round-trip: clean install → idempotent re-run → uninstall → clean reinstall → verify marker-based registration.
- Orphan hook entry detection confirmed: install.sh correctly detects unmarked entries and skips duplication.
- Uninstall with enhanced state machine confirmed: removes both marked and unmarked hook entries.
- Node syntax check: hooks/kimi-fleet-hook.js passes without errors.
- Installed hook MD5 matches repo source.

## [0.6.0] - 2026-07-02

### Fixed
- **Critical (Bug #2 — Ghost Models)**: The #2 fleet bug was the agent showing models that do NOT exist in the user's config — "ghost models" from memory, training data, or previous sessions. After cleaning config to keep only 2 `tohoqing-gemini` models, the agent would "remember" 6 and present all 6. Added `STRICT CONSTRAINT` header, per-provider `EXACT count` labels, `TOTAL` model count, `END OF MODEL LIST` marker, and 5 `MODEL LIST INTEGRITY RULES` requiring per-`model_id` verification before every `AskUserQuestion` call. SKILL.md gains a "Never Show Ghost Models" section with matching hard rules.
- **High (TOP BUG #3 sync)**: The provider omission fix from v0.5.1 only updated SKILL.md's Step 2 wording — the hook's runtime-injected Step 2 instruction never got the same warning. Added the same `TOP BUG #3` warning block to `buildFleetInstruction()`'s Step 2. Renumbered `MISSING PROVIDERS` from #2 to #3 to resolve duplicate numbering conflict with `GHOST MODELS`.
- **Medium (Orphan provider count)**: `formatModelList()`'s "Available Providers" header only counted providers from the `[providers.*]` table, silently excluding orphan providers (a model whose `provider` field has no matching `[providers.x]` entry). Orphans are now folded into the same provider list and tagged `[not in [providers.*] table, but has models — still show it]`.
- **Medium (display_name collisions)**: Different providers can offer models with the identical `display_name` (e.g. `ollama-cloud/glm-5.2` and `zai-coding-plan/glm-5.2` both display as "GLM-5.2"), making Step 4's role question ambiguous. `formatModelList()` now detects duplicate `display_name`s, tags each occurrence inline with `⚠️ DUPLICATE`, and appends an explicit `DUPLICATE DISPLAY NAMES DETECTED` notice. SKILL.md Step 4 updated with a `DISAMBIGUATION WARNING` requiring `"display_name (provider)"` format.
- **Medium (Case-sensitive slash guard)**: `shouldIntercept()` used `startsWith("/swarm")` which is case-sensitive. `/SWARM` or `/Fleet` would bypass the guard and get hijacked into fleet flow if the prompt also contained multi-role patterns. Replaced with case-insensitive regex `/^\s*\/(swarm|fleet)\b/iu`.
- **Medium (English regex false-positive)**: `engRoles` matched `\b(review|research)\s+model(s)?\b`, causing ordinary prompts like "review model performance" or "research model architecture" to trigger the full interactive fleet flow. Removed `review|research` from English patterns (they remain in CJK patterns as `审查模型`/`研究模型` which are unambiguous). `frontend`/`backend`/`cheap-task` retained as fleet-specific role names with negligible false-positive rates.
- **Low (Step count mismatch)**: Hook injected 7 steps vs SKILL.md's 8 steps. Hook's Step 6 merged "Build items" + "Run AgentSwarm" and omitted `subagent_type`/`prompt_template` guidance. Split into Step 6 (Build items) + Step 7 (Run AgentSwarm with full call parameters) + Step 8 (Synthesize), matching SKILL.md's 8-step structure.

### Verified
- 13 regression scenarios all pass: multi-role CJK prompt intercepted, plain prompt passed through, `/swarm`/`/fleet`/`/SWARM`/`/Fleet` all pass through, "review model performance" no longer triggers, `frontend`/`backend`/`cheap-task` still trigger, CJK `审查模型`/`研究模型` unaffected, ghost model prevention confirmed, DUPLICATE display_name flagging confirmed, step count is 8.
- Deployment consistency: local hook and git repo version MD5-identical, `config.toml` hook registration path correct.

## [0.5.1] - 2026-07-02

### Fixed
- **Critical (Bug #2)**: Provider selection in Step 2 used "one option per provider group" wording, which caused agents to arbitrarily group providers (e.g. "Claude系", "DeepSeek系") and silently omit providers (e.g. `tohoqing-gpt`, `managed:kimi-code`). Changed to "one option per provider (NOT per group — never combine)" and added a "TOP BUG #2 — MISSING PROVIDERS" warning block at the same severity level as the model truncation bug. Added a concrete 8-provider example showing 2 questions × 4 options in one call.

## [0.5.0] - 2026-07-02

### Fixed
- **Critical**: `/swarm` and `/fleet` slash commands were hijacked by the hook's multi-role pattern matcher. `/swarm 前端模型负责UI` would get intercepted into the fleet flow because the regex matched. Added an explicit short-circuit guard in `shouldIntercept()` that returns `false` for any prompt starting with `/swarm` or `/fleet`.
- **High**: Hook had a hardcoded provider list missing `claudecn` and `opencode-go`. Replaced with dynamic `~/.kimi-code/config.toml` parsing via Python `tomllib` — the complete provider/model list is injected at runtime.
- **High**: SKILL.md lacked explicit batching instructions for `AskUserQuestion` (max 4 options per question × 4 questions per call = 16 models). Added `ceil(N/16)` batching algorithm with a concrete 40-model example showing 3 calls.
- **High**: SKILL.md Step 3 had no stop conditions — agents would stop showing models after the first batch. Added explicit stop conditions: all batches shown OR user says "够了".

### Changed
- SKILL.md Step 2 rewritten with "TOP BUG" warning block and detailed batching algorithm.
- SKILL.md provider examples updated: `kimi-code` → `managed:kimi-code`, added `claudecn`.
- Hook instruction Step 3 synced with SKILL.md batching formula.
- LICENSE copyright year corrected from 2025 to 2026.
- CI `action-shellcheck@master` pinned to `@2.0.0` to eliminate supply-chain risk.

## [0.4.0] - 2025-07-01

### Changed
- Installed skill renamed from `kimi-swarm-pro` to `kimi-fleet`.
- Hook renamed from `kimi-swarm-pro-hook.js` to `kimi-fleet-hook.js`.
- `/fleet` is now handled by the `kimi-fleet` skill command instead of hook interception.
- Hook now only intercepts multi-role natural language prompts as a fallback.
- Updated all install/uninstall paths and markers.

## [0.3.0] - 2025-07-01

### Changed
- Renamed project from `kimifleet` to `kimi-swarm-pro`.
- Renamed hook script from `fleet-hook.js` to `kimi-swarm-pro-hook.js`.
- Skill name changed from `kimifleet` to `kimi-swarm-pro` to avoid `/fleet` being recognized as a skill command.
- Updated all paths, symlinks, markers, and backup suffixes.

### Fixed
- `/fleet` no longer appears as a skill command suggestion because the skill name `kimi-swarm-pro` does not fuzzy-match the `/fleet` command.
- `/swarm` continues to pass through to Kimi's native Swarm Mode.

## [0.2.0] - 2025-07-01

### Changed
- Renamed project from `kimi-swarm` to `kimifleet`.
- Renamed hook script from `swarm-hook.js` to `fleet-hook.js`.
- New dual-mode design: `/swarm` passes through to native Kimi Swarm Mode (not intercepted); `/fleet` triggers the full 8-step interactive multi-model configuration flow.
- Renamed command from `/swarm-config` to `/fleet`.
- Updated all paths, symlinks, markers, and backup suffixes.

### Added
- `/swarm` native mode — zero-config, auto task-split, no model selection.
- `/fleet` interactive mode — full provider/model/role/concurrency configuration.

## [0.1.2] - 2025-06-30

### Fixed
- `SKILL.md` API key extraction here-doc syntax error fixed (was a release blocker).
- `SKILL.md` Ollama call no longer uses fragile Perl string interpolation; uses `$ENV` instead.
- `swarm-hook.js` CJK multi-role detection fixed — `\b` word boundaries removed for CJK patterns (was silently failing on Chinese prompts).
- `swarm-hook.js` uses `require("fs")` instead of `require("node:fs")` for broader Node compatibility.
- `uninstall.sh` no longer `rm -rf` follows symlinks for the skill directory.
- `uninstall.sh` hook removal now matches by marker + command field, not substring on any line.
- `install.sh` hook path quoted in config.toml to handle `$HOME` with spaces.
- `install.sh` backup only created when config.toml is actually about to be modified.
- `install.sh` uses `ln -sfn` for safer symlink creation.
- `install.sh` newly-created `config.toml` gets `chmod 600`.
- `SECURITY.md` and `CODE_OF_CONDUCT.md` now have concrete contact channels (GitHub Security Advisories + @SeanYuanWSY).
- `README.md` manual install path uses `$HOME` instead of `/Users/<USER>` placeholder.
- `README.md` adds `git` to requirements list.

### Added
- `package.json` with version metadata and lint scripts.
- `VERSION` file.
- `AUTHORS.md` with maintainer info.
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/pull_request_template.md`.
- `.github/workflows/ci.yml` — ShellCheck + Node syntax check CI.
- SPDX license headers on all source files.
- `.gitignore` now covers installer backup files.

## [0.1.1] - 2025-06-30

### Fixed
- `install.sh` now creates `~/.kimi-code/skills-curated/` before symlinking.
- `install.sh` checks for `node` and `python3` dependencies before proceeding.
- `install.sh` and `uninstall.sh` back up `~/.kimi-code/config.toml` before editing.
- `uninstall.sh` uses a robust state-machine parser to remove the `[[hooks]]` block.
- Safer removal logic: refuses to `rm -rf` non-symlink paths.
- Hook registration now uses an absolute path instead of `~`.
- `README.md` uses the correct Kimi Code upstream URL and includes full manual-install steps.
- `LICENSE` copyright year corrected to 2025.
- `SKILL.md` no longer recommends passing API keys on the command line.

### Added
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.gitignore`.

## [0.1.0] - 2025-06-30

- Initial release: interactive multi-model swarm skill and hook for Kimi Code CLI.
