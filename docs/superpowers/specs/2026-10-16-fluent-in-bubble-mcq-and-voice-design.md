# Design Specification: Fluent In-Bubble Interactive MCQs, Human Speech Cadence, and UI Polish

**Date**: 2026-10-16  
**Status**: Approved by User  
**Target**: Fluent Assistant Web Extension & Demo App  

---

## 1. Overview & Goals
Fluent helps patients and immigrants fill out complex government, medical, and legal forms in their native languages using voice and keyboard. To elevate the assistant to feel completely natural, intuitive, and responsive:
1. **Interactive In-Bubble MCQs & Quick-Chips**:
   - Deliver multiple-choice quick options directly inside the assistant's speech bubbles:
     - **Spelling Disambiguation**: When names have homophones (e.g. *Bryan/Brian*, *Sofia/Sophia*, *Catherine/Katherine*), provide one-tap buttons like `[ Sofía (con F) ]` and `[ Sophia (con P-H) ]`.
     - **Dropdown & Radio Choices**: When a field offers fixed options (e.g., Sex, Marital status, Yes/No), show selectable pills: `[ Femenino ]` `[ Masculino ]` `[ Prefiero no decirlo ]`.
     - **Field Confirmation & Quick-Edit**: When a field is filled (`✓ Nombre legal: Sofia`), render inline action pills `[ ✓ Looks good ]` and `[ ✎ Edit ]`. Tapping `[ ✎ Edit ]` focuses the input bar and sets mode to edit, while answering the next question auto-fades previous confirmation chips.
2. **Human-Natural Voice Cadence & Pronunciation**:
   - Improve TTS speech pre-processing in `speech.js`:
     - Transform raw ISO dates (`1990-05-05`) into natural spoken dates (*"cinco de mayo de mil novecientos noventa"* / *"May 5th, 1990"*).
     - Phonetically expand abbreviations (`St.` -> *Street*, `Ave.` -> *Avenue*, `Apt.` -> *Apartment*, `No.`/`Núm.` -> *Number*, `Dr.` -> *Doctor/Drive*).
     - Natural acronym pacing (`SSN` -> *S-S-N*, `EIN` -> *E-I-N*, `DOB` -> *date of birth*).
     - Breathable punctuation pauses before transitions.
3. **Medical-Grade UI Polish (/impeccable)**:
   - High-contrast, clean clinical slate aesthetic (`#12161d` background, `#e8eefc` text, `#5b8def` accessible brand accent).
   - Milestone progress bar with animated completion percentage track.
   - Distinctive lock icon and warm privacy shield styling for sensitive identity numbers.
   - Document Hint cards with clear zone icons and sample numbers.

---

## 2. In-Bubble MCQ Architecture

### Data Models & Contracts
1. **`ui.say(text, options)`**:
   Extend `ui.say` to accept an options object:
   ```typescript
   interface SayOptions {
     chips?: Array<{
       label: string;
       value: string;
       action?: 'send' | 'edit' | 'confirm';
     }>;
   }
   ```
2. **`MetacognitiveResolver`**:
   Return `chips` array in addition to `prompt`:
   ```javascript
   {
     rule: 'Sofia/Sophia',
     prompt: '¿Se escribe Sofía con F o Sophia con P-H?',
     chips: [
       { label: 'Sofía (con F)', value: 'con F' },
       { label: 'Sophia (con P-H)', value: 'con PH' },
     ],
   }
   ```
3. **Choice Fields in `Agent.prototype.question`**:
   When `field.options` exists, include options as chips:
   ```javascript
   chips: field.options.map(opt => ({ label: opt, value: opt }))
   ```
4. **Filled Confirmation Chips**:
   When `this.ui.filled(label, val)` is triggered:
   Provide confirmation actions:
   ```javascript
   chips: [
     { label: '✓ Looks good', value: 'confirm', action: 'confirm' },
     { label: '✎ Edit', value: field.id, action: 'edit' },
   ]
   ```

### DOM Rendering in `panel.js`
In `addMessage(role, text, options)`:
- Create `<div class="msg assistant">` with text content.
- If `options.chips` is provided:
  - Create `<div class="msg-chips">`.
  - For each chip, append `<button type="button" class="chip" data-val="${val}" data-action="${action}">${label}</button>`.
  - Add click listener:
    - If `action === 'edit'`: trigger field edit mode and focus input `#text`.
    - If `action === 'confirm'`: fade chips and log confirmation.
    - If `action === 'send'` (default): submit value to `agent.handleUser(val)`.
    - Disable chips after click to prevent multiple triggers.

---

## 3. Human Speech Cadence & Natural Audio

### `spokenText` Pipeline in `speech.js`
1. **Date Words Expansion**:
   Regex detect `\b(\d{4})-(\d{2})-(\d{2})\b`:
   - EN: `1990-05-05` -> `May fifth, nineteen ninety`
   - ES: `1990-05-05` -> `cinco de mayo de mil novecientos noventa`
2. **Abbreviation Expansion**:
   Expand street suffixes and titles:
   - `\bApt\.\s*(\d+)` -> `Apartment $1` / `Apartamento $1`
   - `\bSte\.\s*(\d+)` -> `Suite $1`
   - `\bAve\.\b` -> `Avenue` / `Avenida`
   - `\bSt\.\b` -> `Street` / `Calle`
3. **Acronym Cadence**:
   - `SSN` -> `S S N`
   - `EIN` -> `E I N`
   - `DOB` -> `date of birth` / `fecha de nacimiento`
4. **Punctuation Padding**:
   Insert comma after conversational greetings/acknowledgments (*"Got it,"*, *"Entendido,"*, *"Listo,"*) to give TTS a natural respiratory pause.

---

## 4. UI Polish & CSS Hierarchy

### CSS Specifications (`panel.css`)
```css
/* In-bubble quick chips */
.msg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.msg-chips .chip {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--ink);
  font-size: 12px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.msg-chips .chip:hover {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.msg-chips.disabled .chip {
  opacity: 0.5;
  pointer-events: none;
}

/* Milestone progress track */
.milestone-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.milestone-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}
.milestone-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand), #8ab4f8);
  border-radius: 999px;
  transition: width 0.3s ease;
}
```

---

## 5. Verification & Testing Strategy
1. **Unit Tests (TDD First)**:
   - `metacognitive.test.js`: verify `chips` structure returned alongside prompt for homophones.
   - `speech.test.js`: verify date expansion (`1990-05-05` -> date words) and abbreviation expansion.
   - `panel-ui.test.js`: verify chip rendering, click event dispatching, and disabled state on selection.
2. **End-to-End Live Puppeteer Verification**:
   - Run demo at `http://127.0.0.1:8765/demo/app/?lang=es&live=0&speak=0`.
   - Submit name `"Sofia"` -> inspect DOM for chip buttons `[ Sofía (con F) ]` and `[ Sophia (con P-H) ]`.
   - Click `[ Sofía (con F) ]` via Puppeteer -> verify it submits `"con F"` and fills `first_name` with `"Sofia"`.
   - Inspect completion chip `[ ✓ Looks good ]` and `[ ✎ Edit ]`.
   - Complete remaining fields and verify milestone progress fill percentage moves from 0% toward 100%.
