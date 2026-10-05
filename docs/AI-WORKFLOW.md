# Working with three AI plans (Claude Code, Codex, Antigravity) + LM Studio

Goal: spend each plan where it is strongest and stay under all three limits. The Claude session **cannot read any plan's
remaining quota**; the owner checks usage in each app. No quota numbers are recorded here on purpose; add measured ones below.

## Lanes
| Lane | Use for | Don't use for |
|---|---|---|
| **Claude Code** (orchestrator) | Brainstorm/decisions, diagnosis, design, privacy-critical code (`audit.js`, `sensitive.js`, private-value paths), integrating and final review, docs | Bulk reading, mechanical edits, repeated test sweeps |
| **Codex** (`codex exec "<task>"`, `codex exec review`) | Well-specified implementation tasks with tests, in their own worktree/branch; independent code review (different model lineage) | Open-ended design; anything needing this session's context |
| **Antigravity** (`agy -p "<prompt>"`; the prompt is an **argument**, stdin just prints help) | Large-context reading and audits (graph report, handoff, specs), research sweeps, adversarial "attack this premise" review, UI/visual exploration | Final decisions; privacy-critical edits |
| **LM Studio** (local) | The *model under test* for Fluent (corpus/e2e). It is not a worker lane | Anything while a corpus run is in progress; the GPU is shared, queue one model |

## Rules
1. Cheapest capable lane first; escalate only on failure. Keep synthesis and expensive-to-get-wrong work in Claude.
2. Give delegates a self-contained brief: goal, files, constraints (privacy rules, 6th-grade wording, tests that must pass), "return a diff + test output".
   Each delegate works in its **own git worktree** and branch; nothing merges without `npm test` green and a read of the diff here.
3. Fan out remote lanes in parallel; run local-model jobs one at a time and only after the owner says go.
4. Review across lineages: code written by one lane is reviewed by a different one (Codex, Antigravity, Claude).
5. Give each delegate the graph first: `graphify query "<question>"` / `graphify explain "<node>"` beats raw grep and saves tokens everywhere.
6. Everything learned goes in `docs/` (this file, `RESTRUCTURE.md`, `HANDOFF.md`) so any lane can pick up cold.

## Suggested split for this project
- Claude: brainstorm and spec the large changes; platform-adapter design; prompt/agent changes; merge and verify.
- Codex: adapter extraction, panel UI rebuild tasks from an approved mock, test updates.
- Antigravity: audit of `panel.js`/`agent.js` for dead code and risks; UI mock exploration; research on form-filling UX for non-native speakers.

## Measured usage (fill in)
| Date | Lane | Task | Rough cost / limit hit |
|---|---|---|---|
