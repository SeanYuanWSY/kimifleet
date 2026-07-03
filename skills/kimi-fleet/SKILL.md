---
name: "kimi-fleet"
description: "Dual-mode multi-model swarm/fleet for Kimi CLI. /swarm = native lightweight swarm (auto task-split, no config). /fleet = full interactive multi-model configuration (provider select, model select, role assign, concurrency, launch). /fleet loads this skill; /swarm passes through to Kimi's native Swarm Mode."
---

# Kimi Fleet — Dual-Mode Multi-Model Collaboration

> **Requirements**: Kimi Code CLI 0.20+ with at least 2 models configured in `~/.kimi-code/config.toml`.

## Two Modes

| Command | Behavior | Interceptor | When to use |
|---|---|---|---|
| `/swarm [task]` | **Native swarm** — passes through to Kimi's built-in Swarm Mode. Auto task-split, auto subagent launch, no model selection, minimal friction. | Not intercepted | Default. Use this 90% of the time. |
| `/fleet [task]` | **Full interactive config** — 8-step flow: confirm → providers → models → roles → instructions → concurrency → launch → synthesize. Each subagent uses a user-specified model. | Loads skill directly; `kimi-fleet-hook.js` also intercepts natural-language multi-role prompts as a fallback | When you want explicit control over which model plays which role. |

### Why two modes?

`/swarm` keeps the original Kimi swarm experience: fast, automatic, lightweight. You just type the command and the agent handles task decomposition and subagent orchestration on its own — same as native Swarm Mode, no extra questions.

`/fleet` adds the multi-model dimension: you pick specific models from `config.toml`, assign each a role, optionally set concurrency limits, and each subagent calls its assigned model through Bash. This is the full interactive configuration flow for when you want deliberate, per-model control.

Think of it as: `/swarm` = quick raid, `/fleet` = organized fleet formation.

---

## Mode 1: `/swarm` — Native Lightweight Swarm

```
/swarm [task description]
```

**What happens**: This command is not intercepted by any hook. Kimi's native Swarm Mode activates normally — the agent reads the task, decomposes it into subtasks, launches `AgentSwarm`, and synthesizes results. No model selection, no role assignment, no interactive Q&A.

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

**What happens**: The skill is loaded directly, providing the 8-step interactive flow below. Additionally, `kimi-fleet-hook.js` intercepts natural-language multi-role prompts (e.g. "前端模型负责X") as a fallback to inject a CRITICAL OVERRIDE instruction that forces the agent into the same interactive flow. The hook pre-parses `~/.kimi-code/config.toml` via Python tomllib and injects the complete provider/model list so the agent doesn't have to parse TOML itself.

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

### CRITICAL: Show ALL Models — Never Truncate to 4

`AskUserQuestion` allows **max 4 options per question** and **max 4 questions per call** (16 options per call). Many users have 40-60+ models across providers. The #1 fleet bug is the agent showing only 4 models and stopping, as if that were the entire list.

**Hard rule**: Before calling `AskUserQuestion` for model selection, count the total models `N` in the selected provider(s). You need `ceil(N / 16)` calls. Make ALL of them. See **Step 2 → The batching algorithm** for the exact procedure. If you catch yourself showing only the first 4 models and moving on, STOP — you are skipping the rest of the list.

### CRITICAL: Never Show "Ghost Models" — Only Use the Injected List

The #2 fleet bug is the agent showing models that do NOT exist in the user's config — "ghost models" from memory, training data, or previous sessions. For example, the user's config may have been cleaned to keep only 2 `tohoqing-gemini` models, but the agent "remembers" 6 and shows all 6.

**Hard rules**:
1. If the hook injected a `COMPLETE Model List`, that list is the **ONLY** source of truth. You may ONLY show those exact models — nothing else.
2. **NEVER add models from memory, training data, previous sessions, backups, or guesswork.** If a model is not in the injected list, it does NOT exist and must NOT be offered.
3. The count in parentheses (e.g. `2 models`) is **EXACT**. If `tohoqing-gemini` says "2 models", you show exactly 2 — not 3, not 6, not 7.
4. Do NOT "supplement" or "fill in" models you think might exist. The config has been curated and cleaned — removed models are intentionally absent.
5. **Before each `AskUserQuestion` call, verify every `model_id` you are about to present exists in the injected list. If it does not, REMOVE it. Also verify the count matches the number in the list — if the count doesn't match, you made an error — re-check.**

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

#### Step 0: Plan Mode Check

Before proceeding, check whether the current session is in plan mode (read-only mode). If the agent is in plan mode, AgentSwarm is unavailable because it requires executing tool calls (Bash, etc.) to launch subagents.

> "当前处于 plan mode（只读模式），AgentSwarm 不可用。请先退出 plan mode 后重试 `/fleet`。"

#### Step 1: Confirm the Task

Restate the task in one sentence (strip the `/fleet` prefix) and ask:

> "我要为以下任务启动多模型协作：[task]。是否继续？"

Use `AskUserQuestion` with a single yes/no-style question (or continue with default).

##### Model Count Pre-Check

After confirming the task, check the total number of available models:

- If the hook injected a model list, count the total models from that list.
- If the hook did NOT inject a model list (fallback), parse `~/.kimi-code/config.toml` and count all `[models."..."]` entries.

If the total number of models is **less than 2**, inform the user:

> "当前配置的模型不足 2 个（共 {N} 个），多模型协作需要至少 2 个模型。建议使用 `/swarm` 进行单模型群聊，或先在 `~/.kimi-code/config.toml` 中配置更多模型。"

Then ask if they want to proceed with the available {N} model(s) anyway (as a reduced fleet) or cancel.

#### Step 2: Get ALL Available Models

> ⚠️ **TOP BUG #1 — TRUNCATION**: The #1 reported bug in `/fleet` is the agent showing only 4 models (or only the first batch) and stopping, as if `AskUserQuestion` could only hold 4 options total. **`AskUserQuestion` supports UP TO 4 QUESTIONS per call, and EACH question has 4 options — that is 16 models per single call.** When there are more than 16 models, you make MULTIPLE `AskUserQuestion` calls. Never truncate the model list. Never stop after one batch. The user must see EVERY model in every selected provider before picking.

> ⚠️ **TOP BUG #2 — GHOST MODELS**: The #2 reported bug is the agent showing models that do NOT exist in the user's config — "ghost models" from memory, training data, or previous sessions. For example, the user cleaned their config to keep only 2 `tohoqing-gemini` models, but the agent "remembers" 6 and shows all 6. **The injected model list is the ONLY source of truth. NEVER add models from memory. If a model is not in the injected list, it does NOT exist.**

**If the hook injected a COMPLETE model list** (you will see a section titled `COMPLETE Model List (injected by hook)`), use that list directly — do NOT re-read `config.toml`. The list includes strict integrity rules and exact per-provider counts — follow them.

**If the hook did NOT inject a model list** (fallback), read `~/.kimi-code/config.toml` and parse **every** `[models."..."]` entry yourself — do NOT filter. For each model, capture:

- `model_id` (the section name without `[models."` and `"]`)
- `display_name`
- `provider`
- `capabilities` (especially `tool_use`, `image_in`, `thinking`)

**List ALL models**, including those without `tool_use`. The user may want to use a vision-only or thinking-only model for a specific role. Do not pre-filter.

**Do NOT add any model that is not in the injected list or config.toml.** The config has been curated — removed models are intentionally absent. Do NOT "supplement" or "fill in" models from memory.

##### The batching algorithm (follow this EXACTLY)

`AskUserQuestion` hard constraints:
- **Max 4 options per question** (the system auto-adds "Other", so you can fill all 4 slots yourself).
- **Max 4 questions per call** → one call can show **up to 16 options** (4 questions × 4 options).
- **No max on number of calls** — you can call `AskUserQuestion` as many times as needed.

Multi-stage flow:

1. **Stage 1 — Ask which provider(s) to browse.**
   - Use `AskUserQuestion` with `multi_select=true`, **one option per provider** (NOT per "group" — never combine multiple providers into one option like "Claude系" or "DeepSeek系"). Every single provider from the config gets its own option.
   - The user CAN select multiple providers at once (e.g. both `ollama-cloud` and `managed:kimi-code`).
   - Use the providers from the injected model list (or from your config.toml parse). **Do NOT hardcode provider names** — the list is dynamically generated from the user's actual config.
   - **⚠️ TOP BUG #3 — MISSING PROVIDERS**: Just like truncating the model list is the #1 bug, **silently omitting providers** is the #3 bug. If the config has 8 providers, ALL 8 must appear as options — do not group them, do not filter out "uninteresting" ones, do not skip `managed:kimi-code` or providers without many models. The user decides which to browse; you do not pre-filter.
   - **Exception — 0-model providers**: If a provider has **zero models** associated with it (no `[models."..."]` entries under that provider), exclude it from the provider list entirely. There is no point offering a provider with no selectable models.
   - If there are **5+ providers**, one question (4 slots) is not enough. Split into two questions in the same call: question 1 = providers 1-4, question 2 = providers 5-N. Both questions use `multi_select=true`.
   - **Concrete example — 8 providers**: `question 1` has 4 options (provider1, provider2, provider3, provider4), `question 2` has 4 options (provider5, provider6, provider7, provider8). Both questions appear in the same `AskUserQuestion` call, both with `multi_select=true`.

2. **Stage 2 — List models from ALL selected provider(s) combined.**
   - Pool every model from every selected provider into one flat list.
   - **Count the total.** Call it `N`.
   - **Compute number of `AskUserQuestion` calls needed**: `ceil(N / 16)`. If N=40, that is 3 calls. If N=60, that is 4 calls. If N=5, that is 1 call.
   - **Within each call**, pack 4 questions × 4 options = 16 models. Label each option `display_name (provider)`, use the description field for `model_id` + `capabilities`.
   - **Use `multi_select=true` on every model question** so the user can pick several at once.
   - **Tell the user in the question text which batch this is**: e.g. "模型选择 (第 1/3 批，共 40 个模型 — 选完这批还有更多)". On the last batch, say "(第 3/3 批，最后一批)".
   - **Between calls**, briefly note how many models the user already selected so they know earlier picks are not lost.

3. **If the user selects "Other"** on any question, let them type a custom `model_id` manually.

##### Concrete example — 40 models in one provider

```
N = 40 → ceil(40/16) = 3 AskUserQuestion calls

Call 1: questions 1-4, each with 4 models → models 1-16
  Question text: "模型选择 (第 1/3 批，共 40 个模型 — 选完这批还有更多)"
  multi_select=true on every question

Call 2: questions 1-4, each with 4 models → models 17-32
  Question text: "模型选择 (第 2/3 批，共 40 个模型 — 选完这批还有更多)"

Call 3: questions 1-2, each with 4 models → models 33-40
  Question text: "模型选择 (第 3/3 批，最后一批)"
```

**DO NOT stop after Call 1.** The most common bug is showing 4 models and acting as if the list is done. If there are 40+ models, that means 3+ calls — do all of them.

#### Step 3: Let the User Pick Models

This step is the continuation of the Stage 2 batching from Step 2 — the user selects models **while** you are showing them batches, not after.

Use `AskUserQuestion` with `multi_select=true` on every question so the user can choose 1–N models from each batch. Show `display_name (provider)` as labels, with `model_id` and `capabilities` in the description.

**After each batch call**, check: did the user pick all the models they want, or do they still want to see more? If there are remaining batches, continue showing them. Do not assume "the user did not select anything from this batch, so they are done" — they may be waiting for a model in a later batch. Only stop when:
- All batches have been shown, OR
- The user explicitly says "that's enough" / "继续" / "不用再看了".

**Example flow (40 models):**
1. User selects providers: `ollama-cloud` + `kimi-code` (multi_select) → 40 models total
2. Call 1: show models 1-16 across 4 questions (multi_select on each)
3. User multi-selects `glm-5.2` + `kimi-k2.7-code` from this batch
4. Call 2: show models 17-32 — "模型选择 (第 2/3 批)"
5. User multi-selects `deepseek-v4-pro`
6. Call 3: show models 33-40 — "模型选择 (第 3/3 批，最后一批)"
7. User says "够了" → stop, proceed to Step 4 with the 3 selected models

##### Empty Selection Handling

After all batches are shown (or the user stops early), if the user selected **zero models**, ask:

> "你没有选择任何模型。是否放弃本次任务？"

Options:
- "放弃" — cancel /fleet, fall back to `/swarm` or abort.
- "重新选择" — go back to Step 2 (provider selection) to pick again.

If the user chooses "放弃", tell them to use `/swarm` for a single-model swarm instead.

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

Since `AskUserQuestion` allows max 4 options per question, **always** split the 6 roles + "Other" into **two fixed questions** in one call:

- **Question A** (4 options): `frontend`, `backend`, `review`, `research`
- **Question B** (4 options, with "Other" in slot 4): `cheap-task`, `synthesize`, `Other` (user can type a custom role), and one blank/hidden slot (AskUserQuestion will fill with "Other" on its own if needed — leave slot 4 empty or use a placeholder)

This eliminates ambiguity: every model always sees the full role spectrum across two questions. Do NOT pick "the 4 most relevant roles" — that skips valid options the user may want.

**⚠️ DISAMBIGUATION WARNING**: Different providers can offer models with the identical `display_name` (e.g. `ollama-cloud/glm-5.2` and `zai-coding-plan/glm-5.2` both display as "GLM-5.2"). If the hook flagged a `display_name` as a duplicate (see the `DUPLICATE DISPLAY NAMES DETECTED` note in the injected model list), or if you notice two selected models share a display_name, **always phrase the question as "display_name (provider)"** — e.g. "这个模型 GLM-5.2 (ollama-cloud) 担任什么角色？" — never use the bare display_name alone, or the user cannot tell which model the question refers to.

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

**Record the limits** as a mapping (example — your actual providers come from Step 2):
```
ollama-cloud → 3
deepseek → 5  (or unlimited)
managed:kimi-code → unlimited
```

#### Step 6: Build AgentSwarm Items (with batching if needed)

Create one item per selected model. **Do NOT use any delimiter-separated format.** Instead, render the assignment as a plain readable sentence so the subagent can read it directly without parsing:

```
"Your model is {model_id}. Your role is {role}. Your instruction is: {custom_instruction_or_default}. Your task is: {task_description}."
```

**The instruction (`custom_instruction_or_default`) must contain the full system prompt text, not just the role name.** If the user chose "使用角色默认指令", copy the corresponding text from the [Role System Prompts](#role-system-prompts) section below (e.g. the `frontend` default prompt). If the user provided a custom instruction, use that text verbatim.

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
"Your model is ollama-cloud/deepseek-v4-flash. Your role is cheap-task. Your instruction is: Summarize concisely with bullet points. Your task is: Explain what a workshop is."
"Your model is ollama-cloud/glm-5.2. Your role is frontend. Your instruction is: Focus on aesthetics and component structure. Your task is: Design a login page."
"Your model is deepseek/deepseek-v4-pro. Your role is backend. Your instruction is: Focus on API and database design. Your task is: Design the backend for a login page."
"Your model is ollama-cloud/minimax-m3. Your role is review. Your instruction is: Critically review the frontend and backend proposals. Your task is: Review the login page design."
"Your model is ollama-cloud/kimi-k2.7-code. Your role is synthesize. Your instruction is: You are an integration specialist. Your task is: Combine all outputs into a final answer."
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
You are a subagent in a multi-model fleet. Your specific assignment is provided in `{{item}}`. Read it directly — it tells you your model, role, instruction, and task in plain English. No parsing is needed.

For example, `{{item}}` might read:
```
Your model is ollama-cloud/deepseek-v4-flash. Your role is cheap-task. Your instruction is: Summarize concisely. Your task is: Explain what a workshop is.
```

From this you know:
- **model_id** = `ollama-cloud/deepseek-v4-flash` — the model you must call via Bash
- **role** = `cheap-task` — your perspective/function in the fleet
- **system_instruction** = `Summarize concisely` — how to approach the work
- **task_description** = `Explain what a workshop is` — what to actually produce

## Your Job

1. Follow the **system_instruction** for your role.
2. Complete the **task_description**.
3. Use the assigned **model_id** for the core reasoning by calling it through Bash (see "Calling Your Model" below).
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
perl -e '
  alarm 120;
  open my $fh, "|-:unbuffered", "ollama", "run", $ENV{MODEL} or die;
  print $fh $ENV{PROMPT};
  close $fh;
' 2>&1 | perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r'

# macOS (if you installed coreutils)
# gtimeout 120 ollama run "$MODEL" "$PROMPT" 2>&1 | perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g' | tr -d '\r'
```

### For API-based providers (deepseek, zai-coding-plan, opencode-go, claudecn, etc.)

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
trap 'rm -f "$HEADER_FILE" "$PAYLOAD_FILE"' EXIT INT TERM
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

Adapt the URL and provider section (e.g. `providers.deepseek`, `providers.zai-coding-plan`, `providers.opencode-go`, `providers.claudecn`) for any other API-based provider found in your config.toml. Use the provider's `base_url` and `api_key` from the config.

### For kimi-code models

These use the managed Kimi provider. API credentials (if configured) live under:

- **API key**: `providers.managed:kimi-code.api_key` in `~/.kimi-code/config.toml`
- **Base URL**: `providers.managed:kimi-code.base_url` in `~/.kimi-code/config.toml`
- **Model parameter**: use the model_id as-is (e.g. `kimi-k2.7-code`). No suffix transformation is needed.

Use the same header-file pattern as the deepseek example above: read the key from the TOML path `providers.managed:kimi-code`, write it to a `$(mktemp)` header file, construct the JSON payload in a separate temp file, and call the API via `curl -s -X POST "$BASE_URL/chat/completions" --header "@$HEADER_FILE" ...`.

**If credentials are unavailable** (the key or base_url is missing from config.toml), fall back to using the current session's model for reasoning. In that case, note in the report that the assigned kimi-code model could not be called directly and the default model was used instead.

### If the model call fails

Report the failure clearly in the **Risks/Caveats** section and complete the task with your default reasoning, noting that the assigned model was unavailable.

## Output Format

Return only the structured report. Do not include extra chatter.
````

## Pre-Flight Model Check

Before launching the fleet, do a quick availability check for any model that is not the current default model:

1. If `model_id` starts with `ollama-cloud/`, extract the name after `ollama-cloud/` and append `:cloud` only if the name does not already contain `:`:
   ```bash
   RAW_MODEL="{model_name}"
   if echo "$RAW_MODEL" | grep -q ':'; then
     MODEL="$RAW_MODEL"
   else
     MODEL="${RAW_MODEL}:cloud"
   fi
   perl -e 'alarm 30; exec "ollama","run",$ENV{MODEL},"respond with OK"' 2>&1 | grep -o "OK" | head -1
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