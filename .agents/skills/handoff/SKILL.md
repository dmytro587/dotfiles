---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke. Mark each as conditional; a suggestion is not execution permission.

Do not duplicate content already captured in other artifacts (PRDs, plans, ADRs, issues, commits, diffs). Reference them by absolute path or URL, plus one locating line of context. Warn when a reference lives in a temporary or session-local location the next agent may not reach.

Include a state contract section with these items: the approved goal and mutation scope (what the user authorized), completed work with the evidence that proves it, unresolved decisions and pending questions, blockers, and the next safe action. Distinguish proposed work from authorized work explicitly.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
