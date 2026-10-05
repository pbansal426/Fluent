# Fluent restructure — plan, decisions, findings

Started 2026-10-05 on branch `restructure` (worktree `.claude/worktrees/restructure`), branched from `main` at `318bce5`
(= former `worktree-fluent-task3`, fast-forwarded into `main` locally; not pushed). Hackathon deadline (2026-10-03) has passed.

## Goal (owner, 2026-10-05)
1. A **few large changes** to the real app (UI, basic functionality, extra features), tested against **LM Studio**.
2. Then a **demo with no Chrome extension**: the same content as a sidebar in an ordinary web page.
3. Better AI access (no pasted keys, no shared proxy) is **deferred**; do not design around it yet.

The specific large changes are **not chosen yet**: run `superpowers:brainstorming` first, record the result here.

## Baseline (verified 2026-10-05)
- `npm test`: 109/109 pass on merged `main`. Build id `2026-10-03.17` (`BUILD` in `extension/panel/panel.js`).
- Graph: `graphify update .` gives 461 nodes / 732 edges / 53 communities once vendored pdf.js and `site/` are excluded
  (`.graphifyignore`). Without that file it is 10,140 nodes of pdf.js noise. Rebuild after code changes (free, AST-only).
- LM Studio server was **off**. Models present: `google/gemma-4-e4b` (current default, the quality ceiling),
  `google/gemma-4-26b-a4b-qat`, `qwen/qwen3.8-27b` (never tested), `openai/gpt-oss-20b`, plus two others.
  The owner starts the server and loads models (shared GPU; never restart LM Studio/Ollama from a session).

## Decision: web-first sidebar, extension as a thin adapter (recommended)
Question: build natively as a Chrome extension, or develop a mock sidebar and convert later?

**Answer: develop the sidebar as a web app first and keep the extension as one of two adapters. Do not "convert later";
keep both buildable the whole time.** Evidence in this repo:
- `extension/lib/*` (agent, audit, prompts, llm, speech, live, choices, sensitive…) makes **zero** `chrome.*` calls.
- `panel/panel.js` makes only ~18, in four groups: `storage.local`; `tabs` (query/update/create/onUpdated/onActivated/onRemoved);
  `tabs.sendMessage` to the page scripts; `runtime.sendMessage/onMessage` (background).
- `demo/app/index.html` + `demo/app/chrome-shim.js` **already** run the real panel beside a form in a normal page, and
  `tests/panel-sim.html` plus `tests/chrome-stub.js` back 15+ deterministic panel scripts. Web-first is how the repo already works.
- Iteration in a plain page is faster (no reload-extension step; the stale-build trap in HANDOFF §00 disappears) and testable headless.

Why not extension-native: slower loop, one Chrome profile, harder to automate, and the demo is explicitly extension-free.
Why not a pure mock: it would drift from the extension and hide the real risks.

**What the web demo cannot prove** (re-check in real Chrome at each milestone, load `extension/` unpacked):
content-script injection and `Receiving end does not exist` recovery, scanning a cross-origin page or the PDF viewer,
microphone permission inside a side panel vs a page, side-panel focus/lifecycle. Real mic/talk-over is still unverified.

**Action items**
- Introduce an explicit **platform adapter** (storage, page bridge = scan/fill/overlay messaging, tab events, openUrl) with two
  implementations: `extension` (chrome.*) and `web` (same-page bridge, localStorage). Replace `chrome-shim.js` with the web adapter,
  so the panel stops pretending to be Chrome. Keep `lib/*` platform-free.
- One panel codebase, two entry points. Add a check that both build and the stubbed panel scripts pass.
- AI access stays behind `lib/llm.js` + `lib/providers.js` (OpenAI-compatible endpoint). LM Studio = `http://localhost:1234/v1`.

## Testing with LM Studio
- Deterministic: `npm test` (no model). Real model: `node tools/run-corpus.mjs` (~170 cases; `MODEL=<id>` to switch),
  `tests/e2e.html?case=intake|w2|help|i9`. Rerun after every prompt change; add a corpus case for every reported bug.
- Never start corpus/e2e runs unasked (owner's rule); stage everything, then report readiness.
- Compare `gemma-4-e4b` vs `gemma-4-26b-a4b-qat` vs `qwen3.8-27b` on the corpus once the owner loads each.

## Open items carried over
Model repeats itself on the 3rd–4th help request; scanned-PDF OCR, iframe scanning, custom dropdowns, save-progress: not started;
multi-page PDF only unit-tested; real mic and Chrome load of the newest build unverified.

## Log
- 2026-10-05: ff-merged task3 into local `main`; `ai-init` run (`.cursor/` links gitignored, `CLAUDE.md`/`AGENTS.md` added);
  graph built; architecture and AI-lane decisions written (this file, `docs/AI-WORKFLOW.md`).
