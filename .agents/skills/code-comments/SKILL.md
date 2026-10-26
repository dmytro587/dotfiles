---
name: goodkey-code-comments-writer
description: Use when writing, updating, reviewing, or analyzing code comments in the GoodKey codebase, including inline comments, section markers, JSDoc/TSDoc, TODO references, and review-only comment analysis.
---

# GoodKey Code Comments

Comments serve future readers: teammates working in unfamiliar code, future maintainers, and assistants that may see only one file. Each comment should reduce the effort needed to understand the code, not add another explanation that needs decoding. This applies to inline comments, section markers, and JSDoc/TSDoc.

## Rules

1. **No em dash (U+2014) in prose.** Other dashes are fine: keep hyphens, `--`, en dashes, minus signs, and dashes in flags, ranges, dates, IDs, and code literals. Call this rule "no em dash", never "no dashes".
2. **No references to private artifacts.** Never cite local plan files, phase labels (`p0`, `phase 2`), or agent narration ("Added as part of p1"). Allowed: `TODO`/`FIXME`, issue, ticket, and PR refs (`#123`, `LIN-456`), and workaround rationale naming an issue.
3. **Use judgment, not a rigid formula.** "Explain why, not what" is guidance, not an absolute rule. Comments add rationale, constraints, contracts, domain context, or a concise explanation of a complex operation. Keep useful navigation and section summaries for dense, nested, security-sensitive, or domain-specific code. Delete only line-by-line restatements with no navigational, contractual, domain, or rationale value.
4. **Match length to meaning.** One sentence is enough for a simple function. Start with a clear summary; add details only where understanding requires them. Do not list every parameter, branch, or exception when the code already makes them clear.
5. **Prefer code that carries the meaning.** Consider a better name, a smaller function, or a type when these would make the code clearer. Use comments for useful context and summaries that these changes do not convey.
6. **Preserve comments when moving or refactoring code.** Keep and move existing comments unless the change makes them inaccurate. Adjust their placement or wording to fit the new code. Do not drop an existing why just because its function moved or its new name seems to make it redundant.
7. **Describe lasting behavior, not implementation history.** State meaning, valid states, invariants, and constraints. Replace "now", "previously", "the migration", and "until the next sync" with stable facts. If history explains a constraint that still applies, identify the concrete migration, version, or issue and its present consequence.
8. **Plain language and reader context.** Write for a smart colleague without context on this change. Define unfamiliar domain terms; avoid shorthand only current participants understand ("after the reindex fix"). Use the reader's existing context: omit unnecessary system names, repeated labels, and background already clear from the surrounding code.
9. **Active voice.** Name the actor: "This function validates the payload", not "Validation is performed".
10. **Date things that expire.** Workarounds, version-specific code, and temporary solutions state a removal trigger: issue, version, or date. A temporary comment with no trigger is permanent.

### Describe operations, contracts, and side effects

Describe an operation in plain language without listing every branch:

```ts
// Find the key by its saved ID, or by the external provider's key reference if no ID is saved.
```

Keep simple function comments simple:

```ts
/** Maps an X.509 certificate's public-key algorithm to the application's signing algorithm ID. */
```

For a non-obvious function, start with a clear summary and add the contract details that help:

```ts
/**
 * Parse the supplied certificate and compare it with the saved records.
 * Reject conflicting key or certificate identities.
 * Return the parsed data without saving changes.
 */
```

Make important side effects clear when the function name is not enough. State what it creates, updates, deletes, sends, or persists. Mention preserved state when it matters:

```ts
/** Create missing records and link them together without changing existing activation statuses. */
```

Keep comments accurate and specific. Describe only checks and guarantees the code provides. Parsing a certificate does not necessarily verify its signature or establish trust.

### Write for readers without change history

A future maintainer should understand the comment without the PR, review discussion, or conversation. For a field, explain what it represents, who supplies it, when it can be absent, and how it relates to other fields.

Avoid a timeline that assumes shared context, state the durable contract instead.
Before keeping a comment, ask: would it still explain this code years later, with only the surrounding source available?

### Use block comments for navigation, not narration

Introduce a substantial block so the reader can follow the flow at first glance:

```ts
// Validate the complete request before creating any records.
```

Do not translate each statement into English.

### Decision comments state the consequence

For a non-obvious omission, guard, threshold, or gotcha, name the constraint and the incorrect behavior it prevents. Mark a high-impact gotcha that readers could mistake for a bug with `IMPORTANT:` so they do not remove or misuse it. Use the warning only for consequential risks. Use a language-appropriate prefix, such as `// IMPORTANT: ...` or `# IMPORTANT: ...`.

Connect the action to its reason:

```ts
// Save the parent before its children so their foreign-key references are valid.
```

Avoid abstract statements such as "Parent integrity must be preserved", which do not explain what the block does.

```yaml
# IMPORTANT: Do not alert on success age. cron.job has no creation or enablement
# timestamp, so it cannot distinguish a missed first run from one not yet due.
# Treating that state as schedule staleness would page incorrectly.
```

### Shared business catalogs

Short JSDoc one-liners on enum or const members documenting the business contract (what the value authorizes and who it applies to) are allowed even when they look like "what" comments.

### Review-only comment analysis

Use this report only when the full task is a comment-only review or analysis, with no request to edit code, propose a code diff, or review broader code behavior. In a report-only request, do not change code. Use the format below and keep every section and table column. For an empty section, write `None found`. Establish TODO age from repository history; if history is unavailable, report `Unknown` rather than guessing. If the user asks for a specific rewrite, implementation, or refactor recommendation, respond in the format requested for that task instead.

```markdown
## Comment Analysis Report

### Critical Issues (Incorrect Information)
| Location | Issue | Current | Should Be |
|----------|-------|---------|-----------|
| file.ts:line | ... | ... | ... |

### Improvements Recommended
| Location | Issue | Recommendation |
|----------|-------|----------------|
| file.ts:line | ... | ... |

### Suggested Removals
| Location | Reason |
|----------|--------|
| file.ts:line | ... |

### Stale TODOs
| Location | Age | TODO Text | Recommendation |
|----------|-----|-----------|----------------|
| file.ts:line | ... | ... | ... |
```

## Common mistakes

- Deleting every what-like comment: assess each one; keep useful summaries, section markers, and rationale when they still apply.
- Rewriting `--dry-run`, `foo-bar`, dates, or IDs: valid syntax, must stay accurate.
- Passive voice or in-group shorthand: name the actor and the fact.
- "Temporary" with no removal trigger: add an issue, version, or date.
- Marking routine comments `IMPORTANT:`: reserve warnings for consequential gotchas.
- Making every comment longer by default: use only the length the reasoning needs.
