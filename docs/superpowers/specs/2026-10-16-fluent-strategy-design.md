# Fluent — Strategy Direction (DRAFT, brainstorm in progress)

> **Date:** 2026-10-16 · **Status:** draft, not yet approved · **Source:** brainstorm session + team's "hackathon shared doc" (Google Drive)
> **Scope:** business strategy only — customer, product positioning, moat, privacy stance. Code bugs (spelled names, mic/talk-over) are tracked separately in `docs/HANDOFF.md`.

## Where we started (team doc, summarized)

- Core insight: **"Translation isn't understanding."** Fluent rewrites each question in plain English, translates it, speaks it, and fills the field. Strictly interpretive — never suggests answers.
- User: limited-English-proficiency people (~28.9M in the U.S., ~81% immigrants — Migration Policy Institute, 2026).
- Business idea: license to public sector, HR firms, healthcare; QR codes/kiosks as entry points.
- Team direction this session: customer is **businesses** (medical offices, employer–employee, etc.); Fluent should **beat DocuSign** by making the "in-between" easier — form verification, correct values, liability.

## Decisions made (Claude's calls, at the team's request)

### 1. Positioning: understanding layer, not e-signature
Don't fight DocuSign on signing. DocuSign proves someone **signed**; Fluent proves they **understood**. Fluent sits between "here's the form" and "signed," and can integrate in front of DocuSign rather than replace it.

Fluent does three things:
1. **Explain** each question in the person's language (voice or text, plain words).
2. **Check** answers before submission — formats, missing fields, contradictions, implausible values.
3. **Certify** — issue an *understanding certificate* the business keeps.

Pitch line: *"Translation gives people the words. Fluent gives them meaning — and gives you proof."*

### 2. Privacy stance: neutral referee
- The business gets the **understanding certificate**: each question was explained (language, approved wording + version), and the person confirmed every answer. **No transcript.**
- The full conversation stays with the person; they may choose to share it in a dispute.
- The AI never fills an answer the person didn't give.

Why: if the business reads conversations, immigrants avoid or lie on status/health forms and Fluent becomes a liability magnet; if only the user benefits, nobody pays. The referee stance lets both sides trust it, which is what lets the certificate become a standard.

### 3. Moat (layered)
1. **Approved explanations library** — form owners sign off on Fluent's wording per question; each approved form is something competitors must rebuild.
2. **The certificate as a standard** — once businesses, their lawyers, and ideally **insurers** accept it, it becomes table stakes. Insurer discounts for using it would make Fluent sell itself.
3. **Error data** — which questions confuse which language groups; sellable to form makers to fix their forms.
4. **Multilingual voice for low-literacy users** — hard to do well; also the original mission.

### 4. Customer order
1. **Clinics / health systems** — first. Legal duty to provide language access (ACA Section 1557 still in force; Exec. Order 14224 binds federal agencies only — checked 2026-10-16 via KFF, ATA, Boostlingo; the status of HHS's 2024 rule still needs confirming on HHS OCR / Federal Register). High-volume intake forms; already pay for interpreters; on-device processing helps the HIPAA story.
2. **Insurers** — as consumers of the certificate, then partners requiring it.
3. **Employers / HR platforms** — later. Risk: I-9 Supplement A requires a named human preparer/translator certification when someone helps with Section 1; unclear whether software can fill that role (no guidance found).
4. **Government** — last; slow procurement, needs a track record.

## Open questions

- **Team ambition / commitment (only the team can answer):** portfolio/competition project, one-clinic pilot by next semester (~5–10 hrs/week for 2–3 months), or company track (incubator/grants, near-full-time owner, legal review, HIPAA readiness)?
- **Access:** does anyone have a real way into a clinic, practice manager, HR team, free clinic, or immigrant legal-aid group?
- **Unproven assumptions:** that clinics will let a third-party AI explain their forms; who signs off on explanations; whether lawyers/insurers would value the certificate.
- Krasan meeting/deck: deferred until strategy is settled.

## Next steps (once approved)
1. Validate with 3–5 real conversations (clinic staff, practice manager, an insurer contact if possible).
2. Revise pitch and demo around explain → check → certify.
3. Then write an implementation plan for the certificate and checking features.
