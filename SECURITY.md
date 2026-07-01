# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.4.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security issue in `kimi-swarm-pro` — especially anything related to the install/uninstall scripts modifying user files or API keys — please report it responsibly:

1. **Do NOT open a public issue.**
2. Use [GitHub Security Advisories](https://github.com/SeanYuanWSY/kimi-swarm-pro/security/advisories/new) — this is the preferred and most reliable channel.
3. Alternatively, open a private GitHub issue mentioning `@SeanYuanWSY` and request a private discussion.

We will acknowledge receipt within 48 hours and aim to provide a fix or assessment within 7 days.

## Known security considerations

- `install.sh` and `uninstall.sh` modify files in `~/.kimi-code` and `~/.agents`. Always review scripts before running them.
- The hook script reads the user prompt and injects an instruction into the Kimi Code context. It does not send prompt data to external servers.
- API keys for model providers are read from the user's own `~/.kimi-code/config.toml` and are never logged or transmitted by this tool.
