# Browser QA by AI (Codex / Antigravity)

The owner wants an AI to click through the testing app and report problems, so they do not have to describe each one.
Same brief for either tool; give one tool one pass, then compare reports (different model lineages catch different things).

## Set-up (owner, once per session)
- `cd ~/Dev/Fluent/<worktree> && npm run demo` → <http://localhost:8765/demo/app/> (form on the left, Fluent sidebar on the right).
- Model-dependent checks need LM Studio: `lms server start`, then load a model (owner does this; shared GPU).
  Without it the sidebar says it cannot reach LM Studio; UI-only checks still work.
- The testing app offers only local LM Studio models (no key, no endpoint). Forms: every PDF in the repo folder plus 3 web forms,
  all in the sample bar at the top (it scrolls sideways).

## Tools
- **Codex**: `codex exec "<this brief + task>"` (features `browser_use` and `computer_use` are enabled).
- **Antigravity**: `agy -p "<this brief + task>"` (prompt is an argument; puppeteer MCP is enabled). Pick a model with `--model`.
- Lesson from the first pilot: run `agy -p` in a **foreground** terminal; started in the background it exited silently with no output.
  The pilot (`docs/qa/2026-10-05-agy-pilot.md`, 14 forms, ~$ low-effort Flash model) found: all forms load, settings correct,
  one non-form PDF in the list (now hidden), raw filenames (now named), text box lacks an accessible label, controls hidden until Start.
- Claude in Chrome (this session) can also click and screenshot, but cannot use the microphone.

## What to check (UI-only, no model needed)
1. For each sample in the bar: it loads, the form renders (PDF pages visible, fields visible), nothing overlaps, no console errors.
2. Settings (gear icon): only a "Local model (LM Studio)" drop-down is shown, no endpoint or key fields; the list matches `lms ls` chat models.
3. Language drop-down, mute/mic button, text box, send, restart: present, labelled, reachable by keyboard.
4. Layout at 1280 px, 1024 px and a narrow window: nothing cut off, text readable.
5. For the grandma test: is everything readable at a glance? Text size, contrast, number of controls on screen, jargon. List what would confuse a low-literate older person.

## What to check (with LM Studio running)
6. Press "Help me with this form" on each form type; the assistant greets, asks one simple question, fills the right field from a typed answer.
7. Type messy answers (typos, tangents, "what is a middle name?", "I don't know"); it must stay helpful, short, plain, and never invent values.
8. Private fields (SSN etc.): must ask for typing in the masked box, never accept them as chat text.
9. Switch model in Settings and repeat 6 on one form.

## Report format
Write to `docs/qa/<date>-<tool>.md`: a table of `# | form | step | expected | actual | severity (blocker/major/minor) | screenshot path`,
then "top 5 things that would stop a grandma", then anything you could not test and why. Do not edit code; report only.
Never type real personal data; use made-up values.
