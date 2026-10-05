# AGENTS.md — Fluent

Read `docs/HANDOFF.md` (§00 first), `docs/RESTRUCTURE.md` (current plan) and `docs/AI-WORKFLOW.md` (which AI does what).

Rules
- Privacy: private values (SSN, card, etc.) never reach the model, history, logs or transcript. Keep enforcement in code (`lib/audit.js`, `lib/sensitive.js`), not only in the prompt.
- Wording shown to users: 6th-grade level, patient and plain; the audience is non-native speakers.
- `extension/lib/*` stays platform-free (no `chrome.*`); platform calls go through the adapter.
- Run `npm test` before committing. After any prompt change, rerun the real-model corpus (`node tools/run-corpus.mjs`) only when the owner says go; never restart LM Studio/Ollama.
- Add a `tests/corpus.json` case for every reported bug. Update `docs/` every session.
- Code questions: `graphify query "<question>"` first; `graphify update .` after code changes.
- Work in a worktree; never push to `main`.
