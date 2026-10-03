# Fluent — handoff

Written 2026-10-03 (late night of Fri 2026-10-02) for whoever picks this up next. Read this first, then `docs/superpowers/specs/2026-10-02-fluent-design.md` and `README.md`.

## 1. What this is and the deadline

**Fluent** is a Chrome extension that helps people fill out forms written in a language they cannot read. It translates the form in place and a voice assistant asks one question at a time, then fills the fields from the user's spoken or typed answers.

- **Event:** Product Space UIUC hackathon, "Hack to the Future". Slides: `HackthonInstructions.pdf` (not in git).
- **Prompt:** "Choose a product, service, or system that meaningful groups of people struggle to use, and build or redesign a digital product that substantially expands who can successfully use it."
- **Hard deadline: Saturday 2026-10-03, 5:15 PM CDT**, on Devpost.
- **Deliverables:** written submission answering the organisers' questions (what you built and how it addresses the prompt, target users and pain points; how you built it, tools, issues; how to take it further) plus a **required 2-minute demo video**. Top 5 teams pitch live at the closing ceremony.
- Every team member must attend at least 3 of the 7 side events to qualify.

## 2. Where things live

- Repo: `~/Dev/Fluent`, branch `main`, **no git remote** (nothing is pushed anywhere).
- A git worktree at `.claude/worktrees/fluent-extension` (branch `worktree-fluent-extension`) holds the same commits. Safe to delete: `git worktree remove .claude/worktrees/fluent-extension`.
- Not in git (`.gitignore` has `*.pdf`): `fw2.pdf` (English W-2), `fw2_es.pdf` (Spanish W-2, the PDF demo form; `fw2_spanish.pdf` is an identical copy), `HackthonInstructions.pdf`.
- The extension the user has loaded in Chrome is the unpacked folder `~/Dev/Fluent/extension`. After any code change: reload it in `chrome://extensions` and reload the form tab.

## 3. Rules the owner set (do not break these)

1. **Fluent interprets, it never answers.** The AI must never put words in the user's mouth: no guessing, assuming, completing, defaulting or suggesting an answer. It may explain what a field asks for, not what to put there.
2. **Sensitive values are typed, never spoken or sent to the model** (SSN, passport, licence, card/account numbers, passwords, member IDs, EIN). Long free-text answers are typed too.
3. **OpenAI-compatible AI endpoint**, LM Studio at `http://localhost:1234/v1` while testing.
4. **The form is never submitted by Fluent.** The user reviews and submits.
5. **No emoji icons**; use professional line icons.
6. **Voice should feel like a live conversation** (the owner's reference: Gemini Live).
7. Owner preferences for how to work: brief plain-English summaries; give a recommendation with reasoning rather than a menu of options; do not restart or reload models in LM Studio (the GPU is shared with other sessions) and do not start long model runs unasked.

## 4. Decisions made, and why

| Topic | Decision | Reason |
|---|---|---|
| Scope | Web forms + fillable PDFs. Scanned PDFs / OCR cut. | ~19 hours to deadline; the judged artifact is a 2-minute video. |
| Demo | Owner wants **`fw2_es.pdf` (Spanish W-2), user speaking English**. A web demo (`demo/intake.html`, Spanish speaker on an English patient form) also works. | Owner's choice. Caveat raised and not resolved: a W-2 is filled by employers, not workers, so it is a weak story for judges; the patient-intake demo is the more credible one. |
| Voice engine | Chrome Web Speech API (recognition + synthesis), turn-based. | Free, no setup, many languages. Audio goes to Google, one more reason sensitive fields are typed. |
| Model | `google/gemma-4-e4b` with `reasoning_effort: "none"`. | Measured 0.4–2.6 s per turn with correct tool calls. With thinking on, 14–30 s. `qwen/qwen3.8-27b` is loaded too but skips tool calls with thinking off and is slower. Other models are not loaded; do not load them. |
| Agent shape | Code owns question order and privacy rules; the model only translates and interprets. | Reliable on a small local model. |
| Build | Plain ES modules, no build step, Manifest V3. | Load unpacked, fastest iteration. |
| PDF | Own viewer page using vendored pdf.js 4.10.38 with form rendering. | Chrome's built-in PDF viewer cannot be scripted. pdf.js turns PDF fields into HTML inputs, so the web pipeline is reused. |

## 5. Architecture

```
extension/
  manifest.json, background.js   MV3; clicking the icon opens the side panel
  content/   classic scripts sharing window.__fluent, injected on demand into web pages
    scan.js      find fields -> { id, kind, label, section, options, required, ... } + surrounding texts
    overlay.js   translation badges, current-field highlight, show/hide
    fill.js      write values (native setter + input/change/blur), option matching, date normalising
    listen.js    speech recognition inside the page (fallback when the panel is refused)
    content.js   message router; reports form changes
  lib/       ES modules, unit-tested in Node
    llm.js       OpenAI-compatible client; drops parameters a server rejects; recovers tool calls
                 that local models write into the text
    agent.js     the conductor: translate in chunks, ask next unfilled field, one model call per turn
                 with tools fill_fields / skip_field / ask_user, read back, privacy + interpret-only guards
    sensitive.js which fields must be typed (English and Spanish patterns)
    prompts.js   every prompt, tool schema and fixed phrase
    speech.js    Web Speech wrapper + the language list
  panel/     side panel UI (panel.html/.css/.js) and the one-time mic permission tab (permission.*)
  pdf/       viewer.html/.css/.js, labels.js (position-based label matching), lib/ (pdf.js, Apache-2.0)
demo/intake.html                 English patient-intake web form
tests/                           see section 7
docs/superpowers/specs/...       design doc
```

How a session runs: panel Start → `connect(tab)` (inject content scripts into a web page, or reopen a PDF tab in `pdf/viewer.html` and talk to it with runtime messages) → scan → classify sensitive/long → greet → background translation (first chunk of 4 fields, then 10 at a time, then surrounding text) → loop: highlight field → speak a natural question → listen → model tool calls → fill → read back → next field.

PDF specifics (`pdf/viewer.js`, `pdf/labels.js`):
- Starts on the first page with editable fields (page 3 of the W-2; page 2, Copy A, is read-only).
- PDF field names are meaningless (`f2_01`), so each field is labelled from the printed caption just above it (or below, or inherited from the field to the left / above, numbered "(2)").
- The W-2 prints two identical forms per page: only the upper one is asked about; values are mirrored into the lower one.
- Translations sit **on top of** the printed caption (no room beneath); "Show translations" reveals the original.
- "Download filled PDF" saves through pdf.js `saveDocument()`.

## 6. Current state: what is verified and what is not

Verified in **headless Chrome against the real LM Studio model** (not in the owner's Chrome):

- Unit tests: 26/26.
- Page scripts on the demo web form: 25/25.
- PDF viewer on `fw2_es.pdf`: 13/13 (46 fields labelled, fill, mirroring, values read back from the saved PDF).
- Full conversation, Spanish speaker on the English web form: 8/8, median about 1.4 s per turn.
- Full conversation, English speaker on the Spanish W-2: 11/11, including "nothing invented when the user gave no answer" and "SSN never sent to the model".
- The real panel code in a simulator page (chrome.* stubbed): 6/6 on the web form and 6/6 on the PDF.

**NOT verified — the biggest risk:**

- **Microphone and spoken voice in the real extension.** The owner reported that "allow microphone" did not work in an earlier build. The cause was never observed. The flow was then rewritten (real `getUserMedia` check, permission tab only on a mic tap, page-side recognition fallback, raw error codes shown in a yellow note in the panel) but **nobody has confirmed it works**. First thing to do: have the owner reload the extension, press Start, tap the mic, and report the yellow note's text (for example `panel: not-allowed`, `page: network`). On a Mac, Chrome also needs System Settings → Privacy & Security → Microphone.
- Whether Chrome allows `webkitSpeechRecognition` inside a side panel at all. If not, the fallback in `content/listen.js` should take over; on the PDF viewer that fallback runs in an extension page (same origin as the panel), so it may fail the same way. A possible next fallback: run recognition in a normal extension tab or an offscreen document.
- Loading the extension in real Chrome since the PDF, voice and icon changes. Branded Chrome no longer accepts `--load-extension`, so this cannot be automated here.
- Real third-party web forms. Only `demo/intake.html` was tested. Custom dropdowns that are not real `<select>` elements will not be filled; iframes are not scanned.

## 7. How to run and test

```
# LM Studio server running with google/gemma-4-e4b loaded
npm test                      # unit tests (extension/lib, pdf/labels)
npm run demo                  # serves the repo at http://localhost:8765 (needed for everything below)

node tests/run-harness.mjs                                                    # page scripts on the web form
node tests/run-harness.mjs "http://127.0.0.1:8765/extension/pdf/viewer.html?file=/fw2_es.pdf" shot.png @tests/pdf-check.js
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/e2e.html"             # real model, web form, Spanish
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/e2e.html?case=w2"     # real model, W-2 PDF, English
node tests/run-harness.mjs http://127.0.0.1:8765/tests/panel-sim.html shot.png @tests/panel-walkthrough.js
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/panel-sim.html?page=/fw2_es.pdf&lang=en" shot.png @tests/panel-walkthrough-pdf.js
```

`tests/run-harness.mjs` drives headless Chrome over the DevTools protocol (Chrome's `--dump-dom` hangs on this version). It starts Chrome with web security off in a throwaway profile so test pages can call LM Studio, which sends no CORS headers; the real extension does not need that because it has host permissions. Pass a PNG path to get a screenshot. `tests/panel-sim.html` is the real panel next to a form in an ordinary tab and is the fastest way to work on the panel.

Manual demo in Chrome:
- Web: open `http://localhost:8765/demo/intake.html`, open the Fluent panel, pick Español, press the start button.
- PDF: open `http://localhost:8765/fw2_es.pdf`, pick English, press start. The tab switches to the Fluent viewer. For a file on disk, drop it onto the viewer tab or use Open PDF.

## 8. Known issues and rough edges

- **Model quality (gemma e4b is small).** Occasional wrong translations or explanations: "statutory employee" explained as a government employee; "Social security tax withheld" shortened to "SE tax withheld"; "Maria E. Lopez" sometimes puts "E" in the suffix box; one sentence sometimes fills only the first of several fields (it then just asks for the next one). A larger model would help but must not be loaded without the owner's say-so.
- **The interpret-only prompt is a balance.** Too strict and the model answers "skip" with "which field?" or refuses to fill several fields at once. The current wording in `prompts.js` (`turnSystemPrompt`) was tuned against both end-to-end cases; rerun them after any prompt change.
- **Interpret-only number guard is partial.** `Agent.inventedNumber` only catches invented numbers of 3+ digits, and only when the user's words contain digits. Invented text (a made-up name) is prevented only by the prompt.
- **W-2 walks all 46 boxes.** Box 12 fields get vague questions ("What goes in this box?") because their only caption is "12a". For the video, keep to the first dozen fields or say "skip".
- **PDF badges** truncate long translations with "…" until that field is current. Translated badges cover the original caption by design.
- **State ID number** on the W-2 is treated as private (typed); stricter than needed.
- **First start per language** translates the assistant's fixed phrases (about 8 s), then caches them in `chrome.storage.local` under `phrases:v3:<code>`. Bump the version in `panel.js` whenever `PHRASES` in `prompts.js` changes.
- **Voice is turn-based, not full-duplex.** It listens automatically after speaking and can be interrupted by tapping the mic, but not by talking over it: Chrome's recogniser would hear the assistant's own voice. Real barge-in needs a streaming speech model (for example OpenAI Realtime), which does not run on LM Studio.
- The slow first translation chunk and concurrent background translation can make an occasional turn take 7–10 s.
- No extension icon files yet (Chrome shows a default letter icon).

## 9. Suggested next steps, in order

1. Get the owner's result from a real mic tap and fix whatever the error code shows. This blocks the voice demo.
2. Decide the demo script for the video (web intake form, W-2 PDF, or both) and rehearse it end to end in real Chrome.
3. Write the Devpost answers (section 1 lists the required questions). Material: section 4 (decisions), section 5 (how it was built), section 8 (issues overcome), plus next steps: scanned-PDF OCR, streaming voice, hosted model, real-site hardening.
4. Only if time remains: extension icon, nicer PDF badge sizing, better questions for unlabeled boxes.

## 10. Session history (commits on `main`)

1. `13d58d3` First version: web forms, translation overlay, text/voice agent, sensitive-field typing.
2. `86e4873` End-to-end and panel simulator checks; fixes (history as log, option values pinned, sections).
3. `22bf28a` Fillable PDF support and the Spanish W-2 demo.
4. `40f3998` Interpret-only guard, hands-free conversational voice, mic diagnostics, line icons.
