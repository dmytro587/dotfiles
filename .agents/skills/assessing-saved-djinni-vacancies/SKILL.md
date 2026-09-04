---
name: assessing-saved-djinni-vacancies
description: Use when a user asks to inspect saved Djinni vacancies, reveal application questions or CV/message controls without submitting, assess candidate fit from job-search evidence, or draft vacancy-specific application messages.
---

# Assessing Saved Djinni Vacancies

## Goal

Review without changing applicant state. Never attach/change CV, set values/answers, paste drafts, or send.

## Prepare

1. Read `orca-cli`, `senior-cv-writer`, continuity rules, master CV, and job-search plan.
2. Use Orca's version-matched built-in browser CLI, not a desktop surface.
3. Treat evidence as facts. Classify requirements as **match**, **partial match**, **gap**, or **unknown**; never infer tool, duration, scale, ownership, or production scope.

## Inspect safely

1. Verify Orca, snapshot Djinni, inventory saved roles including pagination/lazy loading, and deduplicate by ID/URL.
2. Read each posting before its form. Prefer `read` for public text; use the authenticated tab only for application-only content.
3. Before an opener, record any visible CV/message/default state. Click `Відгукнутися на вакансію`/`Apply` only when it demonstrably opens review. `Надіслати відгук`/`Send`/`Submit` is final and MUST NOT be clicked.
4. Re-snapshot. Record questions, CV/message controls (presence, required/default, autosave), and options. Never type, paste, upload, select, press Enter, open a file picker, or use `Next`/`Continue` unless it is proven non-submitting and needed to reveal questions.
5. Before leaving, compare CV/message/default/autosave state to just-opened snapshot; document differences. Return to Saved after each non-final vacancy. Leave final panel open, with its final send control visible and untouched.

Stop and document that vacancy on direct-submit behavior, redirect, CAPTCHA, external ATS, autosave requirement, ambiguous button, upload prompt, or applied/closed state. Never force a risky interaction.

## Assess and draft

For every role record URL, identity, language, work/stack, verified overlap, material gaps, verdict, recruiter questions, and form-control state.

Draft one copy-ready message **in the substantive posting language, not the UI language**. Lead with verified responsibilities and stack; state every material required gap concisely and group optional unknown tools. Keep drafts in Markdown, never in the live form.

| Requirement | Evidence | Assessment |
| --- | --- | --- |
| NestJS | Fastify/Express only | Gap - adjacent backend experience is not NestJS |
| PostgreSQL | Commercial PostgreSQL work | Match |
| High-load scale | No verified workload evidence | Unknown - never claim it |

## Document and verify

Create `docs/job-search/saved-vacancies/YYYY-MM-DD-djinni-saved-vacancy-assessment.md` with safety state, priority, assessments, questions, messages, and evidence limits. Update parent `docs/job-search/readme.md` with the link and decision/status; re-read child and parent under continuity rules.

Before completion, snapshot the final panel: no send/submit, attachment change, selected answer, or live-form draft.

## Guardrails

| Mistake | Correct action |
| --- | --- |
| “Apply” and “Submit” are equivalent | Click only the control proven to open review; never final-send controls. |
| An unsent draft is harmless | Keep it in Markdown; forms can autosave. |
| Similar stack proves the required stack | Name the adjacent technology and retain the gap. |
| Missing duration probably qualifies | Mark it unknown; do not manufacture years. |
