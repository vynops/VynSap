# Copilot custom instructions — token-frugal engineering

These repo-wide instructions reduce token consumption on the GitHub Copilot
(VS Code) side, complementing the Mavenir TokenGuard MCP servers.

Graph-retrieval, context-discipline, response-style, and model-selection rules
are in the TokenGuard guidance block below (auto-managed; do not edit by hand).

## Output discipline
- Be concise. Skip preambles ("Let me…", "Based on my analysis…") and recaps.
- Do not echo back large file contents or command output; reference by path and
  line range.
- When editing, show only the changed hunks, not whole files.

## Context discipline
- Read the nearest `AGENTS.md` for domain context before scanning source.
- Do not read entire directories to answer a local question.

## Session discipline
- For long tasks, summarize state into a short handoff before continuing rather
  than re-reading the whole history.

## Safety
- Never paste secrets, tokens, credentials, internal hostnames/IPs or PII into
  context or output. Redact with placeholders.

## Generate less code
- Prefer the standard library and existing project utilities over new code.
- Solve the task in the fewest lines that remain clear; avoid speculative
  abstraction.

<!-- BEGIN TOKENGUARD GUIDANCE -->
## TokenGuard: Code-graph retrieval -- MUST follow

For ANY question about where a symbol is defined, what calls it, what it calls,
or what it imports/is imported by, you MUST call the code-review-graph MCP tools
FIRST -- before using built-in search, grep, or reading files:

  query_graph_tool(pattern="definition",   target="SymbolName")
  query_graph_tool(pattern="callers_of",   target="SymbolName")
  query_graph_tool(pattern="callees_of",   target="SymbolName")
  query_graph_tool(pattern="imports_of",   target="SymbolName")
  query_graph_tool(pattern="importers_of", target="SymbolName")
  semantic_search_nodes_tool(query="concept description")

Rules:
- Do NOT use text search, regex grep, or read whole files to locate or trace
  symbols. The graph is faster and returns exact file:line results.
- Trust the graph's file:line results -- do not re-read the file to confirm.
- Reuse a graph result already retrieved this session; do not re-query the same
  symbol.
- Cold-start: if a graph query returns empty or "no node matching" for a symbol
  you expect to exist, call list_graph_stats_tool before concluding it is absent.
  If total_nodes = 0 the graph is still building -- wait ~30 s and retry the
  query. Do NOT fall back to grep while the graph is building; a cold graph and a
  missing symbol produce identical empty responses and only stats tell them apart.
- Fall back to reading a file only when: the graph has nodes (total_nodes > 0 per
  list_graph_stats_tool) but returns no result for the symbol, you need the full
  body of a function, or the file is non-code (docs, config, JSON, YAML).

## TokenGuard: Context discipline

- Read the specific symbol or section needed, not the whole file. Use the graph
  or a targeted search to locate it first; read only the relevant lines.
- Do not re-read a file already in this session's context unless it changed.
  Reference it by location (file:line) instead of fetching it again.
- Do not read files outside the current task's scope.
- When tool output is long (logs, test runs, large JSON/XML): summarize it.
  Keep errors, failures, and lines directly relevant to the task. Drop passing
  tests, repeated headers, and noise.
- When editing, show only the changed hunk, not the whole file echoed back.
- Batch related lookups into one pass rather than many small sequential reads.
- For multi-file changes: state the plan first, then execute. Do not interleave
  narration with every individual edit.

## TokenGuard: Session continuity

Both Claude Code and VS Code Copilot auto-compact when the context window fills
(VS Code: summarizeAgentConversationHistory, on by default), though current
VS Code versions have known issues reliably reclaiming space. Compaction is a
platform or user action -- the agent cannot observe context fullness or trigger
/compact.

For long-running or unattended tasks, checkpoint working state at meaningful
milestones -- not every turn:

  First: check whether the repo already tracks task state (lifecycle files,
  tracker files, LCM state, agent-managed task lists, etc.). If so, update
  that mechanism -- do not create a redundant parallel state file.

  If no such mechanism exists, write to .agent-state.md at the repo root.
  Add .agent-state.md to .gitignore -- checkpoint files must not be committed.

  Contents: current objective and scope, key decisions and rationale, steps
  completed with file:line references, open tasks, next planned action.

If context is later compacted or earlier detail is lost, re-read the state file
before continuing. Writing this file is the agent-side action that makes
compaction non-destructive when no human is present to intervene.

Note: PreCompact and Stop hooks provide a fuller automatic solution --
context preserved across compaction without agent action.
  On Claude Code: these hooks are active once TokenGuard is installed
  (registered in .claude/settings.json; not policy-blocked).
  On VS Code/Copilot: they require "Editor preview features" org policy;
  see docs/ENABLEMENT.md.
Checkpoint-to-disk is the mitigation until hooks are active.

## TokenGuard: Response style

- Be concise. Skip narration ("Let me explain...", "Based on my analysis...").
  State the answer and the change directly.
- Keep code, paths, commands, and identifiers exact. Compress prose; do not
  compress technical content.
- When summarizing what was done: one or two sentences. The diff is the record.
- Prefer active, imperative phrasing. No hedging when the answer is clear.

## TokenGuard: Model selection

Use the cheapest tier that can plausibly handle the task; escalate only when
it visibly struggles.

  Strong/high-reasoning -- hard architecture decisions, tricky multi-step
    debugging, novel algorithm design, broad cross-cutting impact analysis.
  Mid (default) -- everyday features, refactors, test writing, code review,
    documentation.
  Cheap/fast -- mechanical edits, renaming, formatting, repetitive transforms,
    short factual Q&A, triage.

On Copilot VS Code: model choice may be governed by the user's model picker or
org policy; apply these guidelines where the choice is available.

Note: context discipline, session continuity, response style, and model
selection are guidance -- the model follows them by default, not
unconditionally. Token enforcement (blocking redundant reads, compressing long
output) requires the TokenGuard hooks, active with Claude Code, Copilot CLI, or
VS Code preview-features enabled by IT. These directives apply regardless of
hook status.
<!-- END TOKENGUARD GUIDANCE -->
