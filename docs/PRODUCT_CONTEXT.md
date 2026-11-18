# Fluent — product context for founder discussions

Prepared October 23, 2026 from the repository at commit `150a195`.
This is a portable briefing for discussions in Codex, Claude, Gemini, or another tool.
Implementation evidence, historical claims, and business hypotheses are distinguished below.

## How to use this brief

The founder wants to concentrate on the business idea: the problem, customers, competition,
distribution, willingness to pay, and experiments. Treat the existing prototype as something
we can reshape. Do not turn strategy conversations into feature lists or coding tasks unless
asked. Challenge assumptions, distinguish evidence from opinion, and define unfamiliar terms.
The current task is understanding and discovery; it does not authorize deployment.

## Product in plain English

Fluent helps a person understand and complete a form in their own language. It places
translations beside the original text, asks questions conversationally, and writes the
person's answers into the form. It also explains unfamiliar fields and helps locate
information on documents. The person reviews the answers and submits the form themselves.

The original October 2 design came from a UIUC Product Space hackathon about expanding
access to products. It named immigrants, international students, and patients who cannot
read the form's language. The October 16 design expanded the audience to older adults and
people intimidated by bureaucracy, with stronger emphasis on clinic intake and phone intake.
These are proposed audiences; the repository does not establish which one is the best customer.

The product's stated principle is: **Fluent interprets; it does not supply the person's answers.**
Prompts and validation rules try to prevent invented answers, ambiguous choices, incomplete
dates, and other obvious errors. These mechanisms do not establish perfect accuracy.

## The current experience

1. Open a web form with the Chrome extension, or use the standalone demo and pick a sample
   form or upload a fillable PDF.
2. Choose a language and start. Fluent identifies the form language, explains the form,
   and gives a notice about documents that may be useful.
3. See translated labels and questions, with the original wording retained. The current
   question is highlighted. Use voice, typing, or buttons for available choices.
4. Answer one question at a time, or provide several answers together. Ask for an explanation,
   skip a question, correct an earlier answer, or move around the form.
5. Type designated private identifiers through a separate path. Long free-text answers are
   also directed toward typing; an optional action translates nonprivate long answers.
6. Review a summary with original and translated labels, answers, skipped questions, and
   edit controls. Print the summary or export data. Filled PDFs can be downloaded.
7. Submit the underlying form yourself. Fluent does not automatically submit it.

## What exists, and what remains a proposal

| Area | Evidence in the current repository | Boundary |
| --- | --- | --- |
| Chrome extension | Manifest V3 extension with a side panel, form scanning, translation overlays, and field filling | Broad compatibility across real third-party sites is unproven; the scanner targets ordinary input, select, and textarea elements |
| Standalone demo | The real sidebar beside web samples or an uploaded PDF; local server and Vercel hosting configuration | A demo implementation is not evidence of organizational adoption or a ready-made integration with customer systems |
| Fillable PDFs | Bundled PDF viewer, printed-label matching, page advancement, and saving filled PDF data | Scanned/image-only PDFs are outside the documented scope |
| Languages | Twelve selectable languages: Spanish, Hindi, simplified Mandarin, Arabic, Vietnamese, Korean, French, Portuguese, Russian, Tagalog, Bengali, and English | Some custom hints, spelling checks, and review interface text have English/Spanish branches; equal quality across all languages has not been demonstrated |
| Conversation | Questions, explanations, multiple answers per turn, corrections, skipped fields, document hints, progress, and review | Real-world completion rates, error rates, and time savings have not been established |
| Speech | Browser speech recognition; optional neural speech output with a browser voice fallback | Hands-free listening is opt-in by default; speaking over the assistant is disabled by the current `TALK_OVER` setting |
| Spelling support | Rules for selected name variants, spelled letters, spoken emails, and some number ambiguities | This is a set of specific rules, not a universal measure of speech accuracy; the handoff records an unresolved mixed spoken/spelled-name case |
| Structured intake engine | `FormSession` and `Agent.fromSchema` can conduct an interview from a structured list of questions without a web form | This is a technical foundation for other channels |
| Phone intake | Browser simulator with a call timer, keypad tones, and a sample form | No working telephone-network connection or real clinic delivery integration is present in the inspected source |
| Kiosk / embedded experience | The web demo and reusable conversation engine offer building blocks | Installed kiosks, an external-site widget package, and operational integrations are not demonstrated |

The README documents a public demo at `https://fluent-demo-chi.vercel.app`. Its current
production behavior was not checked during this assessment.

## Privacy and data flow: describe precisely

- Code identifies certain private fields, including Social Security numbers, passports,
  payment/account numbers, and some insurance identifiers. The intended private-input path
  writes these directly into the form and excludes them from model context, answer history,
  and displayed review values. Tests cover parts of that behavior.
- Ordinary answers, such as names, addresses, and other nonclassified form answers, can be
  sent to the selected AI service for interpretation. Choosing a local language model does
  not make the entire voice experience local: the README notes that Chrome speech recognition
  sends audio to Google, and neural speech can use an external service.
- The local default language model is `google/gemma-4-26b-a4b-qat` through LM Studio. The
  hosted demo configuration defaults to a server-proxied OpenRouter model. Other providers
  can be configured. The local and hosted experiences therefore have different data paths.
- Development logging records nonprivate conversational events. The hosted `/log` handler
  discards events; this says nothing about a separate provider's retention practices.
- The 2.0 design contains broad privacy/compliance language. This repository review did
  not establish an independent audit, organizational agreements, or production certification.
  Do not present design language as verified assurance when discussing the business.

## How the prototype works, only where useful to strategy

The browser finds form controls and their labels. A conversation controller owns question
order, progress, and privacy decisions. The language model translates and interprets answers;
code checks proposed values before writing them into fields. The PDF viewer turns fillable
PDF controls into browser controls that use largely the same process. A structured-question
adapter allows the conversation to run without an existing page.

This suggests reuse across several products, but reuse of code does not mean those products
share a buyer, sales process, distribution channel, or operational requirements.

## Business evidence still missing

The inspected repository contains implementation plans, demo forms, automated tests, and
developer handoffs. I did not find documented customer interviews, paying customers,
organizational pilots, competitor research, pricing validation, acquisition results, or
measured improvements in real users' form completion. Such evidence may exist elsewhere.

There is also no demonstrated commercial layer for customer accounts, subscriptions,
organization administration, or delivery into a clinic's records system. These are observations
about the current prototype, not instructions to build those features.

## Strategic choices to investigate

These are hypotheses for discovery, not market conclusions or a ranked recommendation.

| Possible direction | User and possible payer | Questions that decide whether it is promising |
| --- | --- | --- |
| Personal form assistant | Person completing forms; potentially that person pays | How frequent is the need? How will they discover and trust it? Does the intended audience use desktop Chrome? |
| Clinic intake assistance | Patient uses it; clinic may pay | Which intake task causes measurable staff work or abandonment? Can the output fit the clinic's existing process? Who controls purchasing? |
| Assisted access through an organization | Client uses it with a nonprofit, university, or community worker; organization may pay | Does it reduce staff effort while preserving trust? Is there a budget and a way to reach similar organizations? |
| Conversational intake infrastructure | Another product embeds the engine; software vendor may pay | Is multilingual form handling a distinct purchase, or something customers expect their existing provider to supply? |

For any chosen direction, investigate alternatives beyond direct competitors: browser
translation, general AI assistants, existing intake software, human interpreters, staff,
family members, and leaving the task incomplete. Their effectiveness and cost still need research.

Useful next questions:

- Which specific person, facing which specific form, has the strongest unmet need?
- Is the main difficulty language, reading level, understanding the requirement, obtaining
  documents, typing, fear of errors, or getting help when something goes wrong?
- What does the person do today, and why would they change?
- Who benefits financially from a better outcome, and who can authorize payment?
- What outcome would justify switching: fewer errors, less staff time, more completed forms,
  greater independence, or another measurable improvement?
- What observation, interview, or small manual experiment could disprove the idea before
  we spend more time building?

## Suggested use of the founder's tools

This is a workflow recommendation, not a ranking of model intelligence.

- Use one regular chat workspace as the main home for discussion, interview notes, and
  decisions. A Claude Project or ChatGPT Project can hold a shared product brief and instructions.
- Use Gemini Deep Research, Claude Research, or another available research mode for a narrow,
  source-backed investigation. Request dates, links, direct versus adjacent competitors,
  buyer information, and explicit gaps in the evidence. Use the feature available on your account.
- Use a second model to challenge the reasoning or audit key sources. Agreement among models
  is not customer validation, particularly when they rely on the same sources.
- Use Codex when the discussion needs to check what the prototype really does or maintain
  shared documents alongside the repository.
- Bring conclusions back into one maintained brief and decision record. Avoid maintaining
  three competing versions of the product story. Customer conversations and observed behavior
  are needed to test demand and willingness to pay.

Starter instruction for another tool:

> Read this brief as context, not proof that the business is viable. Help me investigate
> the strongest initial customer and problem for Fluent. Separate facts, hypotheses, and
> unknowns. Challenge the current product scope. Focus on customers, alternatives, distribution,
> willingness to pay, and experiments. Do not propose implementation work unless I ask.

Feature documentation consulted October 23, 2026:

- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [ChatGPT projects and chats](https://learn.chatgpt.com/docs/projects?surface=app)
- [Gemini Deep Research](https://support.google.com/gemini/answer/15719111?hl=en)
- [Claude Projects](https://support.claude.com/en/articles/9517075-what-are-projects)
- [Claude Research](https://support.claude.com/en/articles/11088861-use-research-on-claude)

## Verification performed for this briefing

- `npm test`: **162 passed, 0 failed**.
- `node tests/run-harness.mjs file:///Users/prathambansal/Dev/Fluent/tests/harness.html`:
  **25/25 passed** in headless Chrome, covering form scanning, overlays, writing, and reading values.
- With the demo server on port 8876,
  `node tests/run-harness.mjs 'http://127.0.0.1:8876/demo/app/?lang=en&speak=0&live=0' /tmp/fluent-project-context.png @tests/demo-smoke.js`:
  **5/5 passed**, covering sidebar loading, sample listing, PDF upload/rendering, web sample
  loading, and the local configuration banner. The screenshot was also inspected.
- No full conversation against a real AI model, microphone/voice experience, real telephone
  call, external-site compatibility assessment, or production-site check was performed.
- These checks support prototype functionality, not market demand or production readiness.

## Repository sources for future follow-up

- Original problem and scope: `docs/superpowers/specs/2026-10-02-fluent-design.md`.
- Expanded vision: `docs/superpowers/specs/2026-10-16-fluent-2.0-design.md`.
- Historical implementation status and known issues: `docs/HANDOFF.md`, `progress.md`, and
  `docs/superpowers/plans/` (verify dated claims against current code).
- Actual conversation and guardrails: `extension/lib/agent.js`, `prompts.js`, `sensitive.js`,
  `audit.js`, `metacognitive.js`, and `form-session.js`.
- Actual user experience and speech settings: `extension/panel/`, `extension/lib/speech.js`,
  `live.js`, `neural-tts.js`, and `demo/app/`.
- Form support: `extension/content/` and `extension/pdf/`.
- Demo versus real phone integration: `demo/phone-intake.html`.
- Hosting and provider routing: `tools/demo-server-lib.mjs`, `tools/proxy-core.mjs`,
  `api/proxy.js`, `api/log.js`, `tools/build-site.mjs`, and `vercel.json`.
