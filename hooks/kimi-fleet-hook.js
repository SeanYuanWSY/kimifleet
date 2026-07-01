#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 SeanYuanWSY
"use strict";

/**
 * Kimi Code UserPromptSubmit hook — kimi-fleet interceptor.
 *
 * /fleet is now handled by the kimi-fleet skill command. This hook only
 * intercepts natural-language multi-role prompts (e.g. "前端模型负责X")
 * as a fallback, so the user can trigger the fleet flow without typing /fleet.
 *
 * /swarm is left untouched so the user gets native Kimi Swarm Mode behavior.
 * Registered in ~/.kimi-code/config.toml under [[hooks]].
 */

const fs = require("fs");

// --- Trigger detection ---

/** Detect multi-role language patterns that suggest the user wants multi-model collaboration */
function isMultiRolePrompt(prompt) {
  // CJK patterns: do NOT use \b because word boundaries are undefined around CJK characters.
  const cjkRoles = /(前端模型|后端模型|审查模型|安全模型|性能模型|审美模型|研究模型)/iu;
  const cjkAssign = /模型负责/iu;

  // ASCII patterns: word boundaries are safe here.
  const engRoles = /\b(cheap[\s\-_]?task|frontend|backend|review|research)\s+model(s)?\b/iu;
  const engAssign = /\bmodel(s)?\s+for\s+(frontend|backend|review|research)\b/iu;

  return cjkRoles.test(prompt) || cjkAssign.test(prompt) || engRoles.test(prompt) || engAssign.test(prompt);
}

/** Detect if the user explicitly wants the full interactive configuration flow */
function shouldIntercept(prompt) {
  return isMultiRolePrompt(prompt);
}

// --- Payload reading (same pattern as supermemory-recall.js) ---

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("kimi-fleet-hook.js: parse error:", err.message);
    return {};
  }
}

function valueToText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    for (const key of ["text", "content", "prompt", "userPrompt", "input", "message", "query"]) {
      const text = valueToText(value[key]);
      if (text) return text;
    }
  }
  return "";
}

function extractPrompt(payload) {
  return valueToText(
    payload.prompt ||
    payload.user_prompt ||
    payload.input ||
    payload.message ||
    payload.query ||
    payload
  ).trim();
}

// --- Output ---

function exitWithContext(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext
    }
  }));
  process.exit(0);
}

function exitSilent() {
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}

// --- Main ---

const FLEET_INSTRUCTION = `[KIMI-FLEET INTERCEPT — CRITICAL OVERRIDE]

The user described a task with multiple model roles (e.g. "前端模型负责X"), which means they want the FULL interactive multi-model configuration flow.

**You MUST NOT auto-launch AgentSwarm or start any subagents yet.**

**Before doing ANY work, you MUST follow these steps IN ORDER:**

### Step 1: Confirm the task
Restate the task in one sentence. Ask the user via AskUserQuestion:
"我要为以下任务启动多模型协作：[task]。是否继续？"
Options: "继续，让我选模型" / "不用多模型，直接做"

### Step 2: Read ALL models from config.toml
Read ~/.kimi-code/config.toml and parse every [models."..."] entry. List ALL models — do NOT filter by capabilities.

### Step 3: Ask which providers to browse (multi_select)
Use AskUserQuestion with multi_select=true. Options:
- "ollama-cloud" — Ollama Cloud models (deepseek, glm, minimax, qwen, etc.)
- "kimi-code" — Kimi managed models (K2.7 Code)
- "deepseek" — DeepSeek direct API
- "zai-coding-plan" — Z.ai/GLM direct API
(Ask a second question with: "opencode-go" / "All providers" if needed)
The user CAN select multiple providers.

### Step 4: Show models from selected providers (multi_select)
Pool all models from the selected provider(s). Show them in batches of 4 per AskUserQuestion question (up to 4 questions = 16 models per call).
Label: "display_name (provider)" with model_id and capabilities in description.
Use multi_select=true so the user can pick multiple models.

### Step 5: For each selected model, ask role + custom instruction
For each model, use AskUserQuestion:
Question 1 (role): "这个模型 [display_name] 担任什么角色？"
Options: "frontend（前端）" / "backend（后端）" / "review（审查）" / "research（研究）"
(Ask a second question with: "cheap-task（省token）" / "synthesize（综合）" if needed)
Question 2 (instruction): "对 [display_name] 有什么具体指令？"
Options: "使用角色默认指令（推荐）" / "简洁省token" / "深入详细分析" 
The user can also select "Other" to type custom instructions.

### Step 6: Ask about concurrency limits (optional but important)
Some providers (especially Ollama Cloud) have concurrent request limits per subscription tier.
If the user selected more models from one provider than the limit allows, only some will run while others queue — wasting time.
Ask via AskUserQuestion: "是否需要为某些 provider 设置最大并发数？"
Options: "不设置，全部并行（推荐）" / "设置并发限制"
If the user chooses to set limits, for each provider with selected models, ask:
"[provider] 的最大并发数？（当前选了 N 个该 provider 的模型）"
Options: "1（串行）" / "2" / "3" / Other to type a custom number.
Record limits as provider → max_concurrency mapping.

### Step 7: Build items and launch AgentSwarm (with batching if needed)
Build items as "{model_id}|{role}|{custom_instruction}|{task_description}".
If concurrency limits were set, split items into batches by provider:
- Group items by provider, split each group into batches of max_concurrency.
- Launch batch 1 from all providers together (interleaved).
- When batch 1 completes, launch batch 2, and so on.
- Collect all outputs across all batches for synthesis.
If no limits set, launch all items at once via AgentSwarm.

### Step 8: Synthesize all subagent outputs into a final report.

**This instruction OVERRIDES any built-in Swarm Mode auto-launch behavior. The interactive model selection is the core feature — skipping it defeats the entire purpose.**

Read the full skill documentation at ~/.agents/skills/kimi-fleet/SKILL.md for role system prompts, model calling patterns, and output format.`;

function main() {
  const payload = readPayload();
  const prompt = extractPrompt(payload);

  if (!prompt || prompt.length < 3) {
    exitSilent();
  }

  if (shouldIntercept(prompt)) {
    exitWithContext(FLEET_INSTRUCTION);
  }

  exitSilent();
}

main();
