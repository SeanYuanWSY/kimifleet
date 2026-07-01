# 🚢 kimi-swarm-pro

**Dual-mode multi-model swarm/fleet for Kimi Code CLI — installs the `kimi-fleet` skill.**

This repository (`kimi-swarm-pro`) installs a skill named `kimi-fleet`. Two ways to use multiple models at once: a zero-config native swarm for speed, and a full interactive configuration flow for when you want deliberate per-model control.

> 双模式多模型协作：`/swarm` 走原生轻量蜂群，`/fleet` 走完整交互式配置流程。

---

## Two Modes

| Command | Behavior | Interceptor | When to use |
|---|---|---|---|
| `/swarm [task]` | **Native swarm** — passes through to Kimi's built-in Swarm Mode. Auto task-split, auto subagent launch, no model selection, minimal friction. | **NOT intercepted** by kimi-fleet-hook.js | Default. Use this 90% of the time. |
| `/fleet [task]` | **Full interactive config** — 8-step flow: confirm → providers → models → roles → instructions → concurrency → launch → synthesize. Each subagent uses a user-specified model. | **Handled by the `kimi-fleet` skill** (hook only intercepts multi-role natural language as a fallback) | When you want explicit control over which model plays which role. |

Think of it as: `/swarm` = quick raid, `/fleet` = organized fleet formation.

---

## Features

- **Two modes** — `/swarm` for zero-config native swarm, `/fleet` for full interactive multi-model configuration
- **Interactive model selection** (in `/fleet` mode) — Pick from ALL models in your `config.toml`, across multiple providers (Ollama Cloud, Kimi, DeepSeek, Z.ai, OpenCode)
- **Per-task role assignment** — 6 built-in roles (frontend, backend, review, research, cheap-task, synthesize) + custom
- **Multi-provider support** — Select models from different providers in the same fleet
- **Fresh design every time** — No persistent role mapping; adapt as models update
- **Concurrency control** — Set per-provider concurrency limits to avoid queue waste
- **Hook-based fallback** — Multi-role natural language prompts trigger the fleet flow even without `/fleet`; `/swarm` passes through untouched

## Requirements

- `git` (to clone this repository)
- [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code) 0.20+
- At least 2 models configured in `~/.kimi-code/config.toml`
- `node` ≥ 18 (for the hook) and `python3` (for safe `config.toml` editing) in PATH

## Quick Start

> **Safety note:** `install.sh` writes files into `~/.kimi-code` and `~/.agents`. It backs up `config.toml` before editing, but you should still review the script before running it.

```bash
git clone https://github.com/SeanYuanWSY/kimi-swarm-pro.git
cd kimi-swarm-pro
./install.sh
```

Then start a new Kimi Code session. Use either mode:

### `/swarm` — native lightweight swarm (no config)

```
/swarm 设计一个登录页面
```

This passes through to Kimi's built-in Swarm Mode. The agent auto-splits the task, launches subagents, and synthesizes — no model selection, no questions asked.

### `/fleet` — full interactive multi-model configuration

```
/fleet 设计一个登录页面，前端模型负责UI，后端模型负责API，审查模型负责检查
```

The `kimi-fleet` skill handles `/fleet` and guides the agent through the 8-step interactive flow:

1. Confirm the task
2. Read all models from `config.toml`
3. Ask which providers to browse (multi-select)
4. Show models from selected providers (multi-select)
5. Ask you to assign a role + custom instructions per model
6. Ask about concurrency limits per provider
7. Launch parallel subagents, each calling its assigned model
8. Synthesize all outputs into a final report

## Manual Installation

If you prefer to understand each step:

```bash
# 1. Create skill directory
mkdir -p ~/.agents/skills/kimi-fleet
cp skills/kimi-fleet/SKILL.md ~/.agents/skills/kimi-fleet/SKILL.md

# 2. Create parent directory and symlink for Kimi Code to load the skill
mkdir -p ~/.kimi-code/skills-curated
ln -s ~/.agents/skills/kimi-fleet ~/.kimi-code/skills-curated/kimi-fleet

# 3. Install the hook script
mkdir -p ~/.kimi-code/scripts
cp hooks/kimi-fleet-hook.js ~/.kimi-code/scripts/kimi-fleet-hook.js
chmod +x ~/.kimi-code/scripts/kimi-fleet-hook.js

# 4. Register the hook in config.toml
# Add this block to ~/.kimi-code/config.toml.
# The marker comment is required for uninstall.sh to find and remove it.
# Replace /home/yourname with the output of `echo $HOME`:
# kimi-fleet-hook
[[hooks]]
event = "UserPromptSubmit"
command = "node $HOME/.kimi-code/scripts/kimi-fleet-hook.js"
timeout = 5
```

## Usage

### `/swarm` — native mode

```
/swarm [task description]
```

The hook does **not** intercept this. Kimi's native Swarm Mode handles everything automatically.

### `/fleet` — interactive mode

```
/fleet [task description]
```

### With role hints (also triggers fleet flow)

```
/fleet 设计一个企业级后台系统，前端模型负责UI组件，后端模型负责API设计，安全模型负责审查JWT
```

If you type multi-role language (e.g. "前端模型负责X, 后端模型负责Y") even without the `/fleet` prefix, the hook will intercept it and start the interactive flow.

## How It Works

```
┌─────────────────────────────────────────────────┐
│                 User Input                        │
│         /swarm [task]  or  /fleet [task]         │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────▼──────────┐
         │  kimi-fleet-hook.js
         │  checks the prompt  │
         └─────────┬──────────┘
                   │
          ┌────────┴─────────┐
          │                  │
     /swarm path        multi-role NL
  (NOT intercepted)    (intercepted)
          │                  │
          ▼                  ▼
  ┌──────────────┐  ┌────────────────────┐
  │  Native Kimi  │  │  Injects CRITICAL   │
  │  Swarm Mode   │  │  OVERRIDE instruction│
  │  auto-splits  │  └─────────┬──────────┘
  │  & launches   │            │
  └──────────────┘  ┌──────────▼──────────┐
                    │  Agent reads         │
                    │  SKILL.md            │  Skill loaded via symlink
                    │  + hook instruction  │
                    └──────────┬──────────┘
                               │
                  ┌────────────▼───────────────┐
                  │   Interactive Selection      │
                  │   1. Confirm task            │
                  │   2. Pick providers (multi)  │
                  │   3. Pick models (multi)     │
                  │   4. Assign roles + instrs   │
                  │   5. Concurrency limits      │
                  └────────────┬───────────────┘
                               │
                  ┌────────────▼───────────────┐
                  │   AgentSwarm launched        │
                  │   Each subagent calls its    │
                  │   assigned model via Bash   │
                  └────────────┬───────────────┘
                               │
                  ┌────────────▼───────────────┐
                  │   Parent synthesizes         │
                  │   all outputs → final report │
                  └──────────────────────────────┘
```

**Three components:**

| Component | Path | Role |
|---|---|---|
| SKILL.md | `~/.agents/skills/kimi-fleet/SKILL.md` | Knowledge: role prompts, model calling patterns, output format |
| kimi-fleet-hook.js | `~/.kimi-code/scripts/kimi-fleet-hook.js` | Fallback interceptor: forces interactive model selection for multi-role prompts; passes `/swarm` through untouched |
| config.toml | `~/.kimi-code/config.toml` | Registration: `[[hooks]]` entry for UserPromptSubmit |

## Built-in Roles

| Role | Use case | Output focus |
|---|---|---|
| `frontend` | UI/UX, components, CSS | Visual design, code structure |
| `backend` | API, DB, services | Endpoints, schema, security |
| `review` | Code review, audit | Bugs, risks, alternatives |
| `research` | Investigation, search | Evidence, sources, trade-offs |
| `cheap-task` | Summarization, formatting | Speed over depth |
| `synthesize` | Integration | Coherent final answer |
| custom | User-defined | Anything you want |

## Examples

See [`examples/`](./examples) for complete walkthroughs:
- [Frontend + Backend + Review](./examples/example-frontend-backend.md) — Three-model collaboration for a login page
- [Multi-dimensional Research](./examples/example-research.md) — Four-model research fleet

## Uninstall

```bash
./uninstall.sh
```

This removes the skill, symlink, hook script, and config.toml registration.

## License

MIT © [SeanYuanWSY](https://github.com/SeanYuanWSY)
