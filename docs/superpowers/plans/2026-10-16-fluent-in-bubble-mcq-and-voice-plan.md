# Fluent In-Bubble Interactive MCQs, Human Speech Cadence, and UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate clickable in-bubble multiple-choice chips for spelling disambiguation and dropdown options, human-natural speech cadence pre-processing, and clinical-grade UI polish into Fluent.

**Architecture:** Extend `MetacognitiveResolver` and `Agent` to generate interactive `chips` metadata on prompts and field completions. Update `panel.js` to render accessible button chips inside `.msg-chips` within speech bubbles that seamlessly synchronize with voice input. Upgrade `speech.js` with natural phonetic expansions for dates, abbreviations, and acronyms. Polish `panel.css` with dark slate styling, animated milestone progress track, and privacy shield lock icon.

**Tech Stack:** Vanilla JavaScript (ES Modules), HTML5, CSS3, Web Speech API / OpenAI Neural TTS, Node.js test runner (`node:test`), Puppeteer.

## Global Constraints
- Maximum effort for any headless CLI subagent (`claude` / `codex`): strictly use `--model sonnet` or `--model haiku` with max effort `medium` (`--effort medium`), never `opus` or `astra`.
- Zero microphone popups: never invoke `getUserMedia` unasked without an explicit user tap on `#mic`.
- Zero test regressions: all existing tests (151/151) and newly added tests must pass 100% via `npm test`.
- Clean clinical design: avoid generic AI vibe-coding, excessive glowing gradients, or fragile hacks.

---

### Task 1: Metacognitive In-Bubble MCQ Chips

**Files:**
- Modify: `extension/lib/metacognitive.js`
- Test: `tests/metacognitive.test.js`

**Interfaces:**
- Produces: `MetacognitiveResolver.prototype.detect(said, lang)` returns `{ rule, prompt, chips: [{ label: string, value: string }] }`.

- [ ] **Step 1: Write the failing test**
In `tests/metacognitive.test.js`, add tests asserting that when homophones (Bryan/Brian, Sofia/Sophia, Catherine/Katherine, Teresa/Theresa) are detected, `hit.chips` contains the structured options (e.g. `[{ label: 'Sofía (con F)', value: 'con F' }, { label: 'Sophia (con P-H)', value: 'con PH' }]`).
- [ ] **Step 2: Run test to make sure it fails**
Run `node --test tests/metacognitive.test.js` and verify failure.
- [ ] **Step 3: Implement minimal code in `extension/lib/metacognitive.js`**
Add `chips: (lang) => [...]` to each entry in `HOMOPHONES` and include `chips: hit.chips(lang)` in `detect()`.
- [ ] **Step 4: Run test to make sure it passes**
Run `node --test tests/metacognitive.test.js`.
- [ ] **Step 5: Commit**
`git commit -am "feat(metacognitive): add structured chips metadata to homophone disambiguation"`

---

### Task 2: Choice Option Chips & Field Confirmation Actions in Agent

**Files:**
- Modify: `extension/lib/agent.js`
- Test: `tests/agent-conversational.test.js`

**Interfaces:**
- Produces: `this.ui.say(text, { chips })` and `this.ui.filled(label, val, { chips })` providing interactive choices and `[ Looks good ]` / `[ Edit ]` actions.

- [ ] **Step 1: Write the failing test**
In `tests/agent-conversational.test.js`, add tests verifying that `agent.question(field)` passes choice chips when `field.options` is present, and homophone prompt passes `chips`.
- [ ] **Step 2: Run test to make sure it fails**
Run `node --test tests/agent-conversational.test.js`.
- [ ] **Step 3: Implement minimal code in `extension/lib/agent.js`**
In `Agent.prototype.question` and `handleUser`, forward `chips` to `this.ui.say(..., { chips })`.
In `Agent.prototype.applyFill`, pass confirmation chips to `this.ui.filled`.
- [ ] **Step 4: Run test to make sure it passes**
Run `node --test tests/agent-conversational.test.js`.
- [ ] **Step 5: Commit**
`git commit -am "feat(agent): emit interactive chips for field options and confirmation"`

---

### Task 3: Speech Cadence & Natural Phonetics

**Files:**
- Modify: `extension/lib/speech.js`
- Test: `tests/speech.test.js`

**Interfaces:**
- Produces: `spokenText(text, lang)` expands ISO dates to natural spoken words, expands address/medical abbreviations, and spaces acronyms.

- [ ] **Step 1: Write the failing test**
In `tests/speech.test.js`, add tests for `spokenText`:
  - `1990-05-05` in English -> `"May 5th, 1990"`
  - `1990-05-05` in Spanish -> `"cinco de mayo de mil novecientos noventa"`
  - `Apt. 4B` -> `"Apartment 4B"` / `Apt.` in Spanish -> `"Apartamento"`
  - `SSN` -> `"S S N"`
- [ ] **Step 2: Run test to make sure it fails**
Run `node --test tests/speech.test.js`.
- [ ] **Step 3: Implement minimal code in `extension/lib/speech.js`**
Add regex date transformers and abbreviation replacements in `spokenText`.
- [ ] **Step 4: Run test to make sure it passes**
Run `node --test tests/speech.test.js`.
- [ ] **Step 5: Commit**
`git commit -am "feat(speech): add natural spoken date, abbreviation, and acronym phonetics"`

---

### Task 4: In-Bubble MCQ DOM Rendering & UI Polish

**Files:**
- Modify: `extension/panel/panel.js`
- Modify: `extension/panel/panel.css`
- Modify: `extension/panel/review-card.js`
- Test: `tests/panel-ui.test.js`

**Interfaces:**
- Produces: Accessible `.msg-chips` with `<button class="chip">`, animated milestone progress track (`.milestone-track` & `.milestone-fill`), privacy lock badge.

- [ ] **Step 1: Write the failing test**
In `tests/panel-ui.test.js`, verify `renderMilestoneHtml` outputs progress track with percentage, and `addMessage` renders `.msg-chips` with interactive click handlers.
- [ ] **Step 2: Run test to make sure it fails**
Run `node --test tests/panel-ui.test.js`.
- [ ] **Step 3: Implement in `panel.js`, `panel.css`, and `review-card.js`**
Add chip click handling, milestone progress bar calculation, and privacy lock styling.
- [ ] **Step 4: Run test to make sure it passes**
Run `node --test tests/panel-ui.test.js`.
- [ ] **Step 5: Commit**
`git commit -am "feat(ui): render in-bubble MCQ chips, milestone progress fill, and clinical styling"`

---

### Task 5: Build Site & Live Puppeteer Verification

**Files:**
- Modify: `site/` (generated via `tools/build-site.mjs`)

- [ ] **Step 1: Rebuild site distribution**
Run `node tools/build-site.mjs` and verify clean sync.
- [ ] **Step 2: Run full automated test suite**
Run `npm test` and verify 100% passing tests (155+ tests).
- [ ] **Step 3: Live Chrome Puppeteer verification**
Navigate to `http://127.0.0.1:8765/demo/app/?lang=es&live=0&speak=0`.
Submit `"Sofia"` -> verify in-bubble chips `[ Sofía (con F) ]` and `[ Sophia (con P-H) ]`.
Click `[ Sofía (con F) ]` via Puppeteer -> verify it resolves and advances.
Verify milestone progress fill bar visually advances.
Take screenshot and verify clinical polish.
- [ ] **Step 4: Commit and finalize**
`git commit -am "chore(release): verify in-bubble MCQs and speech cadence across all forms"`
