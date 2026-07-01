# Changelog

All notable changes to this project will be documented in this file.

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
