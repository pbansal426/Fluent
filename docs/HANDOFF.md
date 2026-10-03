# Fluent — handoff

Updated 2026-10-03 at the owner's request to hand off immediately. Read this first, then `docs/superpowers/specs/2026-10-02-fluent-design.md` and `README.md`. Prefer small, safe changes; deadline is today at 5:15 PM CDT.

## 00. Latest update (2026-10-03 midday, branch `worktree-fluent-task3`) — read this before section 0

Section 0 below is the earlier takeover state; where it says task 3 is outstanding or the follow-ups are uncommitted, **this block supersedes it**. Work lives on branch `worktree-fluent-task3` (worktree `.claude/worktrees/fluent-task3`), **not yet merged into `main`**. To test it in Chrome, load that worktree's `extension/` folder unpacked (or fast-forward `main` first: `git merge --ff-only worktree-fluent-task3` in `~/Dev/Fluent`, after discarding the identical uncommitted copies of the follow-up files there).

Owner direction this session: audience is **non-native speakers** (any form language, auto-detected), simple **6th-grade** language, behave like a patient professional form-filler, usable by a kid; offices could run it on kiosks (QR/phone web app is roadmap, not built); demo domain is **US immigration forms**; "model needs to be smarter"; live mode should keep the mic open for the session unless the user turns live mode off or mutes.

Done and committed on the branch:
- **Task 3**: `navigate` tool (back, goto, clear, skip_section, readback, remaining), `copy_from` in `fill_fields`, `Agent.redactPrivate` of SSN/EIN/card/9-digit runs before text reaches the model, focus stays on the current field, next field wraps round to anything jumped over. Follow-ups from section 0 (no-form recovery, mic-failure tests) are committed.
- **Plain language + helping**: all fixed phrases rewritten; prompt requires 6th-grade wording, a help procedure ("help me" explains the current field and where to find it, escalates with `helpCount`), no guessing when the user only describes an answer ("the one starting with G"), single letters count as initials, fill immediately when an answer is stated. Same-language forms now also get simple questions (translation call with `sameLanguage`), but no badges.
- **Private values typed in the chat box** (masked, show/hide eye button): `Agent.submitPrivate` writes straight to the field; never to the model, history, values or transcript (shows dots). Spoken text can never reach a private field.
- **Live mode**: `lib/live.js` keeps one mic stream open with echo cancellation; a voice detector (adaptive threshold, `bargeIn` setting off/low/normal/high) stops the assistant when the user talks; the mic button mutes/unmutes; after two silent rounds the assistant asks again ("Are you still there?"). Auto-disables talk-over if it triggers within 700 ms of speech start twice (speaker echo). **Real microphone and real talk-over are unverified**; detector logic is unit-tested, panel flows use doubles.
- A Form tab (editable rows) was built and then **removed** at the owner's request; the form itself on the page is the place to edit.
- **PDF**: field labels fall back to the PDF's own tooltips (`alternativeText`) when there is no readable caption (USCIS forms), compacted to "Group: 1.B Enter Given Name"; fields reordered top-to-bottom; **multi-page**: when a page is finished the assistant moves to the next page with fields (`F.nextPage`, `fluent:next-page`).
- Tests: `npm test` 50/50. New deterministic panel scripts: `tests/panel-private.js` (9/9), `tests/panel-formview.js` (6/6), plus `tests/panel-mic-failures.js` (7/7) and `tests/panel-interruption.js` (6/6). New e2e cases in `tests/e2e.html`: `?case=help` (unsure user / "help me" must not fill junk), `?case=i9` (Spanish speaker, real USCIS Form I-9, needs `i-9.pdf` in the repo root: https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf). `tests/pdf-scan.js` dumps how any PDF is seen. Real-model results are in the final report of the session (see below) and must be rerun after any prompt change.

Not done / open:
- **Model quality**: `google/gemma-4-e4b` still repeats itself on the 3rd–4th help request and is the main quality ceiling. `qwen/qwen3.8-27b` is listed in LM Studio but has not been loaded or tested (shared GPU; owner must say so).
- Scanned-PDF OCR, iframe scanning, custom (non-`<select>`) dropdowns: not started. Phone/QR web version: roadmap only.
- Multi-page PDFs: only the page shown is scanned; the assistant now advances automatically, but this was only tested through unit tests and label scans of the I-765 / I-9 / I-130, not a full spoken run across pages.
- Real mic / talk-over / real Chrome loading of the new build: not verified.

## 0. Immediate takeover state

The owner requested three tasks, in order. **Tasks 1 and 2 have committed implementations and automated verification. Task 3 has not been implemented.** The owner then requested this immediate handoff; do not mistake it for completion of all requested work.

1. **Typed chat bug:** reproduced before changing production code in headless Chrome running the real panel. With speech deliberately held open, `state.busy` disabled the composer; a submitted message cleared the input without a user bubble, reply, or error. Fixed by accepting/queuing typed turns, interrupting speech, and explicitly settling cancelled speech/recognition promises. Typing pauses hands-free listening; tap the mic to resume. Private-field panel input remains blocked. Added request/recognition timeouts and transcript feedback for AI errors. Commit: `78328bb`.
2. **One language choice:** detection runs before greeting/translation, displays `Form language: Spanish` (or the detected language), and skips translations/badges when it matches the user's language. Uses HTML `lang` when valid; otherwise model detection from scanned labels/options/sections, without field values. PDF language metadata is collected but validated against labels: **the Spanish W-2 incorrectly declares English in its catalog**. Trusting that metadata initially failed the PDF language check (10/11); validation fixed it (11/11). Commit: `aa5ad9b`.
3. **User-directed assistant:** still outstanding. `prompts.js` and the three tools (`fill_fields`, `skip_field`, `ask_user`) are unchanged. Agent still walks fields in order. Implement navigation/back, clear, section navigation/skip, readback/remaining, explicit copying from nonprivate fields, and multi-answer/pasted-details cases. Keep code enforcing privacy and interpret-only rules. Retain/extend `Agent.inventedNumber`, require unanswered fields to stay empty, keep the prompt/tool set small, and rerun **both** real-model end-to-end cases after every prompt change. A proposed patch for this task was rejected by `apply_patch` before application; no partial tool/prompt changes landed.

**Working tree intentionally has unfinished follow-up changes. Preserve and inspect them:**

- `extension/panel/panel.js`: additional no-form recovery: after an empty scan, show the no-form banner and keep Start available instead of leaving a chat that silently ignores messages. **Not independently regression-tested yet.**
- `tests/chrome-stub.js`: optional `SIM_BOOT` setup for deterministic failure tests; missing page handlers return `undefined`, like an older content script.
- `tests/speech.test.js`: an additional timeout test.
- New `tests/listen.test.js`: page-side recognition cancellation/error tests.
- New `tests/panel-mic-failures.js`: deterministic pending microphone, pending recognition, and missing content-script handler tests. Latest run **7/7 passed**; an earlier run failed because the test clicked the previous iframe document while reloading. The script now awaits the iframe's load event.

These follow-ups are **not included in the two implementation commits**. This handoff commit documents them without committing unverified production follow-ups. No model was loaded, unloaded, or restarted. No git remote exists.

**Latest owner observation / critical demo instruction:** the owner showed a screenshot with the form on the left, a simulator panel in the middle, and the real extension on the right. They explicitly said not to simulate the extension in the page. The middle column is `tests/panel-sim.html`'s iframe, not a second extension panel. The real extension reported no form because the simulator embeds the form in an iframe and Fluent does not scan iframes. **Use `http://localhost:8765/demo/intake.html` for the owner's actual Chrome demo, with only the real side panel.** This standalone URL was opened for the owner. Keep the simulator for automated tests only; do not open it as the owner's demo. The screenshot's right panel had the older emoji mic and lacked the hands-free setting, suggesting a stale loaded extension; the owner was instructed to reload Fluent in `chrome://extensions` and reload the form tab. No confirmation has arrived.

**Owner's hands still needed:** reload the unpacked extension and standalone form tab; test typed interruption while speech is playing; tap the mic, allow it in the permission tab if prompted, tap again, and report whether a nonprivate spoken answer transcribes. If it fails, report the exact yellow note and panel Console error. **Real microphone/voice remains unverified.**

## 1. What this is and the deadline

**Fluent** is a Chrome extension that helps people fill out forms written in a language they cannot read. It translates the form in place and a voice assistant asks one question at a time, then fills the fields from the user's spoken or typed answers.

- **Event:** Product Space UIUC hackathon, "Hack to the Future". Slides: `HackthonInstructions.pdf` (not in git).
- **Prompt:** "Choose a product, service, or system that meaningful groups of people struggle to use, and build or redesign a digital product that substantially expands who can successfully use it."
- **Hard deadline: Saturday 2026-10-03, 5:15 PM CDT**, on Devpost.
- **Deliverables:** written submission answering the organisers' questions (what you built and how it addresses the prompt, target users and pain points; how you built it, tools, issues; how to take it further) plus a **required 2-minute demo video**. Top 5 teams pitch live at the closing ceremony.
- Every team member must attend at least 3 of the 7 side events to qualify.

## 2. Where things live

- Repo: `~/Dev/Fluent`, branch `main`, **no git remote** (nothing is pushed anywhere).
- A git worktree at `.claude/worktrees/fluent-extension` (branch `worktree-fluent-extension`) exists from the earlier session; main has since advanced. Do not assume that worktree contains the latest changes.
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
| Model | `google/gemma-4-e4b` with `reasoning_effort: "none"`. | Earlier measurements: 0.4–2.6 s per turn with correct tool calls; 14–30 s with thinking on. Latest runs have occasional longer turns. The server lists other models too; do not change model loading or restart LM Studio. |
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
    language.js  metadata/label language detection before the conversation starts
    prompts.js   every prompt, tool schema and fixed phrase
    speech.js    Web Speech wrapper + the language list
  panel/     side panel UI (panel.html/.css/.js) and the one-time mic permission tab (permission.*)
  pdf/       viewer.html/.css/.js, labels.js (position-based label matching), lib/ (pdf.js, Apache-2.0)
demo/intake.html                 English patient-intake web form
tests/                           see section 7
docs/superpowers/specs/...       design doc
```

How a session runs: panel Start → `connect(tab)` (inject content scripts into a web page, or reopen a PDF tab in `pdf/viewer.html` and talk to it with runtime messages) → scan → classify sensitive/long → detect/display form language → greet → background translation (first chunk of 4 fields, then 10 at a time, then surrounding text; skipped for matching languages) → loop: highlight field → speak a natural question → listen → model tool calls → fill → read back → next field. Typed turns interrupt speech and queue while earlier model work finishes; stale recognition results are ignored.

PDF specifics (`pdf/viewer.js`, `pdf/labels.js`):
- Starts on the first page with editable fields (page 3 of the W-2; page 2, Copy A, is read-only).
- PDF field names are meaningless (`f2_01`), so each field is labelled from the printed caption just above it (or below, or inherited from the field to the left / above, numbered "(2)").
- The W-2 prints two identical forms per page: only the upper one is asked about; values are mirrored into the lower one.
- Translations sit **on top of** the printed caption (no room beneath); "Show translations" reveals the original.
- "Download filled PDF" saves through pdf.js `saveDocument()`.

## 6. Current state: what is verified and what is not

Latest verification during this takeover:

- `npm test`: **34/34 passed**, including the currently uncommitted page-recognition and timeout tests. This was run before the small no-form panel follow-up.
- Real-model end-to-end, Spanish speaker on English web form: **8/8**, including detection. Full output: `/tmp/fluent-language-web.log`.
- Real-model end-to-end, English speaker on Spanish W-2: **11/11**, including label detection overriding incorrect PDF metadata, unanswered fields staying empty, and SSN never sent to the model. Full output: `/tmp/fluent-language-pdf.log`.
- Deterministic real-panel interruption/queue regression: **6/6**, after language detection changes. `tests/panel-interruption.js` uses model/speech doubles, so this proves panel behavior, not real voice or model quality.
- Deterministic real-panel microphone failure recovery: **7/7** in the latest run, including typed replies with pending mic permission, recognition that never ends, and an older content script missing `fluent:listen`. Test file and stub changes are uncommitted.
- Existing real-model web panel walkthrough: **6/6** after the first chat fix, before language changes. Both panel walkthrough scripts now have an extra language-display assertion but have **not been rerun with those assertions**.

Earlier session's checks, **not rerun during this takeover**: page scripts **25/25**, PDF viewer/save **13/13**, PDF panel walkthrough **6/6**. Do not describe these as verification of the latest working tree. Rerun the complete suite before declaring the original task finished.

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

# Deterministic panel regressions (model/speech doubles, not real microphone verification):
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/panel-sim.html?lang=en" /tmp/fluent-chat.png @tests/panel-interruption.js
node tests/run-harness.mjs "http://127.0.0.1:8765/tests/panel-sim.html?lang=en" /tmp/fluent-mic-failures.png @tests/panel-mic-failures.js
```

`tests/run-harness.mjs` drives headless Chrome over the DevTools protocol (Chrome's `--dump-dom` hangs on this version). It starts Chrome with web security off in a throwaway profile so test pages can call LM Studio, which sends no CORS headers; the real extension does not need that because it has host permissions. Pass a PNG path to get a screenshot. The runner now chooses an isolated debugging port and returns a failing exit code for failed scripted checks or evaluation exceptions (previously screenshots could mask failures). Run real-model cases serially to avoid piling work onto the shared GPU. `tests/panel-sim.html` is for automated panel development/testing; **do not use it for the owner's real-extension demo**.

At handoff, the `npm run demo` server is still running on port 8765 (Python PID 9632). No harness/model test run remains active. Check the port before starting a duplicate server.

Manual demo in Chrome:
- Web: open `http://localhost:8765/demo/intake.html`, open the Fluent panel, pick Español, press the start button.
- PDF: open `http://localhost:8765/fw2_es.pdf`, pick English, press start. The tab switches to the Fluent viewer. For a file on disk, drop it onto the viewer tab or use Open PDF.

## 8. Known issues and rough edges

- **User-directed tools are still missing:** original task 3 remains outstanding; see section 0.
- **No-form recovery follow-up needs verification:** uncommitted panel change keeps Start available after an empty scan. Add a regression and inspect its interaction with queued text before committing.
- **Privacy for pasted blocks needs hardening when adding task 3:** current protection blocks input during private fields and omits those field values from model context; arbitrary sensitive values pasted while a nonprivate field is current are not automatically redacted. Do not send such values to the model when extending multi-answer input/copying.
- **PDF language metadata can be wrong:** the Spanish W-2 says English. Detection now verifies PDF hints using labels; do not revert to trusting the viewer's English `lang` or PDF metadata alone.
- **Same-language assistance** currently uses the original labels/options without model-generated translation questions. Unit-tested; still needs a real-extension owner check.
- **Model quality (gemma e4b is small).** Occasional wrong translations or explanations: "statutory employee" explained as a government employee; "Social security tax withheld" shortened to "SE tax withheld"; "Maria E. Lopez" sometimes puts "E" in the suffix box; one sentence sometimes fills only the first of several fields (it then just asks for the next one). A larger model would help but must not be loaded without the owner's say-so.
- **The interpret-only prompt is a balance.** Too strict and the model answers "skip" with "which field?" or refuses to fill several fields at once. The current wording in `prompts.js` (`turnSystemPrompt`) was tuned against both end-to-end cases; rerun them after any prompt change.
- **Interpret-only number guard is partial.** `Agent.inventedNumber` only catches invented numbers of 3+ digits, and only when the user's words contain digits. Invented text (a made-up name) is prevented only by the prompt.
- **W-2 walks all 46 boxes.** Box 12 fields get vague questions ("What goes in this box?") because their only caption is "12a". For the video, keep to the first dozen fields or say "skip".
- **PDF badges** truncate long translations with "…" until that field is current. Translated badges cover the original caption by design.
- **State ID number** on the W-2 is treated as private (typed); stricter than needed.
- **First start per language** translates the assistant's fixed phrases (about 8 s), then caches them in `chrome.storage.local` under `phrases:v3:<code>`. Bump the version in `panel.js` whenever `PHRASES` in `prompts.js` changes.
- **Voice is turn-based, not full-duplex.** It listens automatically after speaking and can be interrupted by tapping the mic, but not by talking over it: Chrome's recogniser would hear the assistant's own voice. Real barge-in needs a streaming speech model (for example OpenAI Realtime), which does not run on LM Studio.
- The slow first translation chunk, concurrent background translation, and shared GPU can make occasional turns much slower (latest web run included ~18 s). AI requests now time out at 60 s; model-list requests at 10 s; recognition at ~20–22 s; mic permission check at 3 s.
- No extension icon files yet (Chrome shows a default letter icon).

## 9. Suggested next steps, in order

1. Read the working-tree follow-ups in section 0; verify no-form recovery, then commit the follow-ups with clear messages. Preserve the already passing chat and language changes.
2. Complete original task 3: user-directed filling/navigation/clear/copy/readback/remaining with code-owned privacy. One possible compact design (not implemented): keep the existing tools, extend `fill_fields` with an explicit source field for copying, and add one command tool with a small action enum. Choose the safest small implementation; the owner did not approve a specific schema. Add real-model command cases and rerun both full end-to-end cases after every prompt change.
3. Run the complete section 7 checks, including both updated panel walkthroughs, page scripts, and PDF saved-value check. Update this handoff and commit on main. Original assignment requested implementation, verification, documentation, and clear local commits; no remote/push.
4. Get the owner's real-extension typed-chat and microphone results using the standalone demo page, not the simulator. Microphone remains a demo risk until confirmed.
5. Rehearse the required 2-minute video and finish Devpost answers before 5:15 PM CDT. Earlier submission/demo suggestions remain relevant, but do not spend the remaining time on unrelated polish.

## 10. Session history (commits on `main`)

1. `13d58d3` First version: web forms, translation overlay, text/voice agent, sensitive-field typing.
2. `86e4873` End-to-end and panel simulator checks; fixes (history as log, option values pinned, sections).
3. `22bf28a` Fillable PDF support and the Spanish W-2 demo.
4. `40f3998` Interpret-only guard, hands-free conversational voice, mic diagnostics, line icons.
5. `3c37a4f` Original handoff document.
6. `78328bb` Fix dropped typed turns and release stalled speech and listening.
7. `aa5ad9b` Detect form language before assistance and skip same-language badges (also strengthens the harness failure reporting and isolates its debugging port).
