---
name: "kimi-fleet"
description: "Dual-mode multi-model swarm/fleet for Kimi CLI. /swarm = native lightweight swarm (auto task-split, no config). /fleet = full interactive multi-model configuration (provider select, model select, role assign, concurrency, launch). /fleet loads this skill; /swarm passes through to Kimi's native Swarm Mode."
---

# Kimi Fleet — Dual-Mode Multi-Model Collaboration

> **Requirements**: Kimi Code CLI 0.20+ with at least 2 models configured in `~/.kimi-code/config.toml`.

## Two Modes

| Command | Behavior | Interceptor | When to use |
|---|---|---|---|
| `/swarm [task]` | **Native swarm** — passes through to Kimi's built-in Swarm Mode. Auto task-split, auto subagent launch, no model selection, minimal friction. | **NOT intercepted** by kimi-fleet-hook.js | Default. Use this 90% of the time. |
| `/fleet [task]` | **Full interactive config** — 8-step flow: confirm → providers → models → roles → instructions → concurrency → launch → synthesize. Each subagent uses a user-specified model. | **Handled by the `kimi-fleet` skill** (hook intercepts multi-role natural language as a fallback) | When you want explicit control over which model plays which role. |

### Why two modes?

`/swarm` keeps the original Kimi swarm experience: fast, automatic, lightweight. You just type the command and the agent handles task decomposition and subagent orchestration on its own — same as native Swarm Mode, no extra questions.

`/fleet` adds the multi-model dimension: you pick specific models from `config.toml`, assign each a role, optionally set concurrency limits, and each subagent calls its assigned model through Bash. This is the full interactive configuration flow for when you want deliberate, per-model control.

Think of it as: `/swarm` = quick raid, `/fleet` = organized fleet formation.

---

## Mode 1: `/swarm` — Native Lightweight Swarm

```
/swarm [task description]
```

**What happens**: The kimi-fleet-hook.js does **not** intercept this command. Kimi's native Swarm Mode activates normally — the agent reads the task, decomposes it into subtasks, launches `AgentSwarm`, and synthesizes results. No model selection, no role assignment, no interactive Q&A.

**When to use**:
- You want speed and simplicity.
- You trust the agent to pick subagent configuration.
- The task doesn't require specific models for specific perspectives.

**When NOT to use**:
- You need specific models for specific roles (e.g., "GLM-5.2 for frontend, DeepSeek for backend").
- You want to control concurrency limits per provider.
- You want to assign custom instructions to each model.

In those cases, use `/fleet`.

---

## Mode 2: `/fleet` — Full Interactive Multi-Model Configuration

```
/fleet [task description]
```

**What happens**: The `kimi-fleet` skill handles this command and loads the full interactive configuration flow. The kimi-fleet-hook.js may also intercept multi-role natural language prompts as a fallback and inject a CRITICAL OVERRIDE instruction that forces the agent into the 8-step interactive flow before launching any subagents.

### CRITICAL: Always Ask Before Launching

**Never auto-launch AgentSwarm without first asking the user to:**
1. Confirm the task
2. Select which models to use
3. Assign a role to each model

Even if the user's prompt already specifies roles like "前端模型负责X, 后端模型负责Y", you MUST still:
- Read `~/.kimi-code/config.toml` to get the actual model list
- Use `AskUserQuestion` to let the user pick specific models from the list
- Use `AskUserQuestion` to let the user confirm or adjust role assignments
- Only THEN launch `AgentSwarm`

**Do NOT skip the interactive selection step.** The entire point of `/fleet` is that model-role mapping is designed fresh for every task.

### When to Use

- The task can be split into parallel perspectives (frontend, backend, review, research, cheap-task, etc.).
- The user wants to compare or combine outputs from multiple models.
- The user wants to delegate simpler work to cheaper models and harder work to stronger models.

### When NOT to Use (skip interaction and tell the user to use /swarm instead)

- The task is trivial and can be done in one tool call.
- The user has already specified a single model and a narrow task.
- The user says "just do it" or explicitly asks to skip model selection.
- Network/API access is unavailable and only the default model can run.

### The 8-Step Workflow

#### Step 1: Confirm the Task

Restate the task in one sentence (strip the `/fleet` prefix) and ask:

> "我要为以下任务启动多模型协作：[task]。是否继续？"

Use `AskUserQuestion` with a single yes/no-style question (or continue with default).

#### Step 2: Read ALL Available Models

Read `~/.kimi-code/config.toml` and parse **every** `[models."..."]` entry — do NOT filter. For each model, capture:

- `model_id` (the section name without `[models."` and `"]`)
- `display_name`
- `provider`
- `capabilities` (especially `tool_use`, `image_in`, `thinking`)

**List ALL models**, including those without `tool_use`. The user may want to use a vision-only or thinking-only model for a specific role. Do not pre-filter.

Since `AskUserQuestion` allows at most 4 options per question and the user may have 60+ models, use this multi-stage approach:

1. **First ask which provider(s) to browse** — Use `AskUserQuestion` with `multi_select=true`, one option per provider group. The user CAN select multiple providers at once (e.g. both `ollama-cloud` and `kimi-code`).
   - Available providers: `ollama-cloud`, `kimi-code`, `deepseek`, `zai-coding-plan`, `opencode-go`
   - Since max 4 options per question, split into two questions if there are 5+ providers.
   - The system auto-adds an "Other" option for custom input.

2. **Then list models from ALL selected provider(s) combined** — Pool models from every selected provider into one list. Split into batches of 4 per `AskUserQuestion` question. Use multiple questions in a single `AskUserQuestion` call (up to 4 questions, each with 4 options = 16 models shown at once). Label each option as `display_name (provider)` and use the description field to show `model_id` and `capabilities`.

3. **If the user selects "Other"**, let them type a custom model_id manually.

#### Step 3: Let the User Pick Models

Use `AskUserQuestion` with `multi_select` to let the user choose 1–N models from the batched lists. Show `display_name (provider)` as labels, with `model_id` and `capabilities` in the description.

If the user wants more models than shown in one batch, repeat the question with the next batch until all desired models are selected.

**Example flow:**
1. User selects providers: `ollama-cloud` + `kimi-code` (multi_select)
2. System pools all models from both providers
3. System shows batch 1: 4 ollama-cloud models (question 1) + 4 kimi-code models (question 2) — up to 16 models per AskUserQuestion call
4. User multi-selects e.g. `ollama-cloud/glm-5.2` + `kimi-code/kimi-for-coding`
5. If user wants more, show next batch

#### Step 4: Assign Roles AND Custom Instructions Per Model

For each selected model, ask the user TWO things in one `AskUserQuestion` call:

**Question 1: What role should this model play?**

Options (the system will auto-add "Other" for custom input):

| Role | Typical use | Output focus |
|---|---|---|
| `frontend` | UI/UX, components, CSS, React/Vue/HTML | Visual design, code structure, accessibility |
| `backend` | API, DB, services, architecture | Endpoints, schema, performance, security |
| `review` | Code review, audit, critique | Bugs, risks, style issues, alternatives |
| `research` | Deep investigation, literature/case search | Evidence, sources, trade-offs |
| `cheap-task` | Simple summarization, formatting, brainstorming | Speed over depth |
| `synthesize` | Combine outputs from other agents into a final answer | Coherent integration |

Since `AskUserQuestion` allows max 4 options per question, split the 6 roles + "Other" into two questions of 4 options each, OR pick the 4 most relevant roles for the current task and let "Other" cover the rest.

**Question 2 (optional): Any specific instructions for this model?**

Use a text-like question where the user can type free-form instructions. Since `AskUserQuestion` always has an "Other" option, present a question like:

> "What should {display_name} specifically do for this task?"

Options:
- "Use default for this role" (Recommended) — use the role's default system prompt
- "Focus on [task-specific aspect]" — pre-filled with a task-relevant suggestion
- "Be concise / save tokens" — for cheaper models
- The user can also select "Other" and type their own custom instruction.

#### Step 5: Ask About Concurrency Limits (Optional but Important)

Some providers (especially Ollama Cloud) have concurrent request limits tied to the subscription tier. If the user selects more models from one provider than the provider allows simultaneously, only a subset will actually run while the rest queue — wasting time.

**Ask the user via AskUserQuestion:**

> "是否需要为某些 provider 设置最大并发数？（例如 Ollama Cloud 订阅可能限制 3 个并发）"

Options:
- "不设置，全部并行" (Recommended) — all subagents launch at once
- "设置并发限制" — user will specify per-provider limits
- The user can select "Other" to type a custom answer.

**If the user chooses to set limits**, for each provider that has selected models, ask:

> "[provider] 的最大并发数是多少？（当前选了 N 个该 provider 的模型）"

Options:
- "1（串行）"
- "2"
- "3"
- The user can select "Other" to type a custom number.

**Record the limits** as a mapping:
```
ollama-cloud → 3
deepseek → 5  (or unlimited)
kimi-code → unlimited
```

#### Step 6: Build AgentSwarm Items (with batching if needed)

Create one item per selected model in this format:

```
"{model_id}|{role}|{custom_instruction_or_default}|{task_description}"
```

**If no concurrency limits were set**, pass all items to AgentSwarm at once.

**If concurrency limits were set**, split items into batches:

1. Group items by provider.
2. For each provider, split its items into batches of `max_concurrency` size.
3. Launch AgentSwarm with batch 1 from each provider (interleaved so all providers start working immediately).
4. When batch 1 completes, launch batch 2, and so on.
5. Collect all outputs across all batches for final synthesis.

**Batching example:**
- User selected 5 ollama-cloud models + 2 deepseek models
- ollama-cloud concurrency = 3, deepseek = unlimited
- Batch 1: 3 ollama-cloud items + 2 deepseek items (5 parallel)
- Batch 2: 2 ollama-cloud items (2 parallel)
- Total: 2 sequential waves instead of 5 parallel + 3 queued

Example items:

```
"ollama-cloud/deepseek-v4-flash|cheap-task|Summarize concisely with bullet points|Explain what a workshop is"
"ollama-cloud/glm-5.2|frontend|Focus on aesthetics and component structure|Design a login page"
"deepseek/deepseek-v4-pro|backend|Focus on API and database design|Design the backend for a login page"
"ollama-cloud/minimax-m3|review|Critically review the frontend and backend proposals|Review the login page design"
```

#### Step 7: Run AgentSwarm

Call `AgentSwarm` with:

- `description`: short task name
- `subagent_type`: "coder"
- `prompt_template`: the template below
- `items`: the array built in Step 6 (or the current batch if batching)

#### Step 8: Synthesize

After all subagents return, produce a final response that:

1. Lists which model played which role.
2. Summarizes each subagent's key finding.
3. Highlights agreements and conflicts.
4. Gives a final recommendation or integrated output.

## Role System Prompts

Use these as the default `custom_instruction_or_default` part of each item.

### frontend

"You are a frontend specialist. Focus on UI/UX, component structure, accessibility, and visual polish. Return HTML/CSS/JS or component code when relevant."

### backend

"You are a backend specialist. Focus on API design, database schema, service boundaries, performance, and security. Provide concrete endpoints and data models."

### review

"You are a critical reviewer. Find flaws, risks, missing edge cases, and inconsistencies. Be constructive but skeptical. Compare alternatives when useful."

### research

"You are a research specialist. Search the web when needed, cite sources, and provide evidence-based analysis. Be thorough and structured."

### cheap-task

"You are a fast, lightweight assistant. Keep answers short, clear, and practical. Do not over-engineer."

### synthesize

"You are an integration specialist. Read the outputs from the other agents and produce one coherent final answer that resolves conflicts and preserves the best ideas."

## AgentSwarm Prompt Template

Pass this as `prompt_template`:

````markdown
You are a subagent in a multi-model fleet. Your specific assignment is encoded in `{{item}}`.

Parse `{{item}}` using the format:
```
{model_id}|{role}|{system_instruction}|{task_description}
```

For example, if `{{item}}` is:
```
ollama-cloud/deepseek-v4-flash|cheap-task|Summarize concisely|Explain what a workshop is
```
Then:
- model_id = `ollama-cloud/deepseek-v4-flash`
- role = `cheap-task`
- system_instruction = `Summarize concisely`
- task_description = `Explain what a workshop is`

## Your Job

1. Follow the `system_instruction` for your role.
2. Complete the `task_description`.
3. Use the assigned `model_id` for the core reasoning by calling it through Bash (see "Calling Your Model" below).
4. Return a structured report with these exact sections:
   - **Role**: your role
   - **Model**: the model_id you used
   - **Summary**: 2-3 sentence overview
   - **Key Findings**: bullet list
   - **Evidence/Details**: code, sources, or reasoning
   - **Risks/Caveats**: what might be wrong or missing
   - **Recommendation**: actionable next step

## Calling Your Model

You must call the assigned model through Bash. Do not use your default model for the main reasoning.

### For ollama-cloud models

Extract the model name after `ollama-cloud/`. If the name already contains a `:` (e.g. `ministral-3:3b`), use it as-is. Otherwise append `:cloud` (e.g. `deepseek-v4-flash` becomes `deepseek-v4-flash:cloud`).

The Perl `alarm` call below works cross-platform (Linux + macOS) with no extra dependencies. Pass the prompt through the environment so quotes and apostrophes cannot break the command.

```bash
RAW_MODEL="deepseek-v4-flash"
if echo "$RAW_MODEL" | grep -q ':'; then
  MODEL="$RAW_MODEL"
else
  MODEL="${RAW_MODEL}:cloud"
fi
export MODEL
export PROMPT="Your system instruction here. Task: your task description here."

# Linux
perl -e 'alarm 120; exec "ollama","run",$ENV{MODEL},$ENV{PROMPT}' 2>&1 | perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r'

# macOS (if you installed coreutils)
# gtimeout 120 ollama run "$MODEL" "$PROMPT" 2>&1 | perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r'
```

### For API-based providers (deepseek / zai-coding-plan / opencode-go)

**Do NOT pass API keys on the command line** — they show up in `ps`, process logs, and shell history. Use a temporary header file and a Python-generated JSON payload.

Read the key safely from `~/.kimi-code/config.toml` with a TOML parser (`tomllib` on Python 3.11+; otherwise install `tomli`).

#### deepseek example

```bash
MODEL="deepseek-chat"
PROMPT="Your system instruction. Task: your task description."

# Read API key safely (config path is hard-coded inside the here-doc)
API_KEY=$(python3 - <<'PY'
import os, tomllib
path = os.path.expanduser("~/.kimi-code/config.toml")
cfg = tomllib.load(open(path, "rb"))
print(cfg.get("providers", {}).get("deepseek", {}).get("api_key", ""))
PY
)

# Create temporary header file so the key never appears on a curl command line
HEADER_FILE=$(mktemp)
printf 'Authorization: Bearer %s\n' "$API_KEY" > "$HEADER_FILE"

# Generate JSON payload safely
PAYLOAD_FILE=$(mktemp)
python3 - "$MODEL" "$PROMPT" <<'PY' > "$PAYLOAD_FILE"
import sys, json
model, prompt = sys.argv[1], sys.argv[2]
json.dump({
  "model": model,
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": prompt}
  ],
  "max_tokens": 2048
}, sys.stdout)
PY

# Call API
curl -s -X POST "https://api.deepseek.com/chat/completions" \
  --header "@$HEADER_FILE" \
  --header "Content-Type: application/json" \
  --data-binary "@$PAYLOAD_FILE" \
  --max-time 60 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])"

# Clean up
rm -f "$HEADER_FILE" "$PAYLOAD_FILE"
```

Adapt the URL and provider section (`providers.deepseek`, `providers.zai-coding-plan`, `providers.opencode-go`) for the other two providers.

### For kimi-code models

These use the managed Kimi provider. If the current session already runs on a kimi-code model, you may use your own reasoning. Otherwise, treat it as a standard Kimi API call if credentials are available, using the same header-file pattern as above.

### If the model call fails

Report the failure clearly in the **Risks/Caveats** section and complete the task with your default reasoning, noting that the assigned model was unavailable.

## Output Format

Return only the structured report. Do not include extra chatter.
````

## Pre-Flight Model Check

Before launching the fleet, do a quick availability check for any model that is not the current default model:

1. If `model_id` starts with `ollama-cloud/`, run:
   ```bash
   ollama run {model_name}:cloud "respond with OK" 2>&1 | grep -o "OK" | head -1
   ```
2. If `model_id` starts with `deepseek/`, run a small curl call and check for a valid response.
3. If a model fails, tell the user and ask whether to remove it or fall back to the current default model.

## Parent Synthesis Format

After the fleet finishes, respond like this:

```markdown
# Fleet Results: [Task Title]

## Models & Roles

| Model | Role | Status |
|---|---|---|
| ollama-cloud/deepseek-v4-flash | cheap-task | ✅ Completed |
| ollama-cloud/glm-5.2 | frontend | ✅ Completed |
| deepseek/deepseek-v4-pro | backend | ✅ Completed |

## Key Findings by Role

### frontend (glm-5.2)
- ...

### backend (deepseek-v4-pro)
- ...

## Agreements

- ...

## Conflicts / Open Questions

- ...

## Integrated Recommendation

...
```

## Notes

- Keep the number of selected models reasonable (2–5 is typical; more causes coordination overhead).
- Always warn the user if selected models are known to be expensive or slow.
- If the user says "just do it" or rushes past model selection, fall back to a sensible default: one strong model for reasoning, one cheap model for review.
- `/fleet` is for deliberate multi-model orchestration. For quick parallel tasks, use `/swarm` instead.
