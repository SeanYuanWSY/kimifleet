# Contributing to kimi-swarm-pro

Thanks for your interest in improving kimi-swarm-pro!

## How to contribute

1. **Open an issue first** for bug reports, feature ideas, or large changes.
2. **Fork the repo** and create a feature branch.
3. **Keep shell scripts safe and clean**:
   - Run `shellcheck install.sh uninstall.sh` if available.
   - Prefer `rm -f` over `rm -rf`; never recursively delete a path that could be a user directory.
   - Backup `~/.kimi-code/config.toml` before editing it.
4. **Test in a clean environment**:
   - Run `./install.sh` in a fresh shell.
   - Run `./uninstall.sh` and verify no `kimi-fleet-hook.js` remains in `config.toml`.
5. **Update docs**: If you change behavior, update `README.md` and `CHANGELOG.md`.
6. **Submit a pull request** with a clear description and test notes.

## Code style

- Bash scripts use `set -euo pipefail`.
- Node.js hook uses strict mode and standard library only.
- SKILL.md is plain Markdown; keep role prompts concise and actionable.

## Reporting security issues

Please see [SECURITY.md](./SECURITY.md).
