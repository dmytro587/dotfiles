---
name: creating-html-plans
description: "Use when converting plans, roadmaps, specifications, checklists, rollout documents, or project briefs into polished standalone interactive HTML artifacts."
---

# Creating HTML Plans

## Overview

## Scope

Use this skill for explicitly requested HTML artifacts. It is not the default format for ordinary planning or explanations; do not convert a plan to HTML unless the user asked for that artifact. Keep issue files and the canonical source of truth in their original format.

Create visual planning surfaces, not decorated markdown. Preserve source truth.

## Rules

1. **Source is authoritative.** Preserve names, dates, owners, commands, statuses, uncertainty, and scope. Never infer progress, severity, confidence, lateness, RACI, or completion.
2. **Adapt the model.** Never force every plan into one dashboard.
3. **Standalone is literal.** One HTML file; inline CSS/JS/SVG; no network assets.
4. **UI state is not source state.** Say checkboxes and filters do not update the source.
5. **Search is required — for full artifacts.** Every standalone plan artifact contains a visible search input that filters its content. A small single-purpose snippet may skip search, but then it is not a full artifact.
6. **No print control.** Never include a Print button, `window.print()` action, or other print-triggering UI.
7. **Browser verification is mandatory** before claiming the artifact renders and works. For a small snippet, one desktop check can suffice; state what you checked.

## Visual Grammar

| Source emphasis | Primary representation |
|---|---|
| Phases, status, rollout | Status cards, workstreams, checklist |
| Dates, owners, launch | Timeline, owner matrix, dependencies |
| Systems, infrastructure | Topology, environment map, operations |
| Research, decisions | Hypothesis/evidence matrix, open questions |
| Risks, controls | Risk register, coverage, decision log |

Mix only supported representations. Give diagrams a text/table equivalent.

## Workflow

### Model

Extract purpose, state, decisions, entities, phases, dependencies, risks, evidence, validation, open work, and scope. Show conflicts side by side with source location and resolution state. Distinguish **missing**, **unknown**, **not applicable**, and **not yet provided**. Keep unparsed content visible.

Mark calculations `Derived` and expose inputs. Calculate only compatible units and periods; never silently average ranges or reconcile contradictions.

### Structure

Default: hero → state → domain model → execution → decisions/contract → rollout → validation → scope/source. Reorder for the natural reading path.

### Present

Use restrained tokens, strong hierarchy, one accent, semantic landmarks, and native controls. Encode state with text/icon plus color. Meet WCAG AA contrast; provide visible focus, keyboard operation, touch targets, table headers, reduced motion, and diagram alternatives.

The visible search input is mandatory. Optional interactions include relevant filters, details, and local checklist persistence. Escape static source or use DOM `textContent`; never pass untrusted content to `innerHTML`. Namespace storage by artifact/source version; reset only that state.

Stack mobile layouts. Print CSS may improve browser-native printing, but the page must not expose a print trigger.

### Verify

Open `file:///…` and check:

- Desktop and ~390px screenshots
- Console/runtime errors
- Visible search input filters content correctly
- No Print button, `window.print()`, or print-triggering control exists
- Body and nested overflow, clipping, tiny text, hover-only behavior
- Filters, details, persistence, reset
- Keyboard focus, accessible names, color-independent meaning
- Browser-native print stylesheet readability, if supplied
- Representative labels, dates, commands, conflicts, and derivations against source

## Adaptation Example

Infrastructure: status → topology → environments → workstreams → operations → rollout → validation → deferred scope. Product launch: timeline → owners → dependencies → risks → milestones. Keep the shell if useful; change the information model.

## Common Mistakes

- Markdown in cards → restructure around reader decisions.
- Generic dashboard → model dominant relationships.
- Fabricated progress → show explicit facts and auditable derivations.
- Desktop-only check → verify mobile and print CSS.
- Optional or hidden search → always provide a visible search input.
- Print button → remove the control; rely on browser-native printing if needed.

## Red Flags

Stop for missing search, any print-triggering UI, omissions, invented state, unauditable derivations, conflicts without provenance, inaccessible diagrams, external dependencies, mobile clipping, untested controls, or browser claims without a browser run.
