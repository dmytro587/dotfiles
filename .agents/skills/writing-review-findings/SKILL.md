---
name: writing-review-findings
description: Use when asked, manually or automatically, to dump a completed review, audit, assessment, or findings into a new Markdown file. Long reports get a reader map (what each section settles, and how deep it goes) before evidence. Keep one settled-versus-unverified split in the verdict, the findings, and any overview.
---

# Writing Review Findings

Use this after the review itself. This skill controls the saved report, not how to conduct the review. Create the requested new `.md` file; do not silently replace an existing report. Preserve the review's actual scope and evidence. Do not turn unverified claims into facts.

## Report shape

1. `# <Title of the reviewed work>`
2. Under the title, give the review date, actual reviewing model, exact scope (including exclusions or diff range), and useful context as short subtitle text.
3. `## Goal, scope, and context`: why the review was done, what should hold, and what was inspected.
4. `## Verdict`: **Requested changes**, **Ready for merge**, **Needs discussion**, or a more fitting label, followed by the reason. Use “Ready for merge” only if that conclusion is supported by the reviewed scope and checks. Open with what is broken, what is fixed or still open, and whether the next step is a decision or more evidence. Name every defect here, in words, before the first code block in the report. A later overview must not soften that settled-versus-unverified split.
5. `## Findings`: one subheading per distinct finding, with a risk level (Critical, High, Medium, or Low), `- [ ] Resolved`, the impact and conditions, precise source location, and a suggested correction. An empty list must say “No findings in the reviewed scope”; never invent findings.
6. Add other sections only when they make the report easier to act on, such as evidence limits or rollout notes. Label each section’s job and its limit in the first sentences (for example “acceptance checks, not results” or “audit trail, not a second argument”). Say once how the sections depend on each other. Do not let a later section read as a second verdict.
7. `## Checks ran`: name each check and its observed result. `## Checks skipped and why`: name each relevant omitted check and reason. Do not claim a check ran when it did not. Next to a result, say what it does not prove.
8. `## Open questions (operator only)`: only decisions an operator must make; write “None” if there are none. An evidence gap is not a decision: inspect the missing source before asking. Keep one decision, and mark the same split of settled versus unverified in the verdict, the findings, and any overview.

When the report is long enough that a reader might stop partway, put one table under the title before any evidence. Columns: section, what that section settles, and depth (`decision`, `mechanism`, `code`, `observation`, or `audit trail`). A heading list is not this map. Do not drop code, contracts, or caveats to make the report shorter; the map is what makes the depth skippable.

Inside a long section, say in two to four sentences what is coming, in the order it appears, and what the section does not decide. Draw the path before quoting source. Use the smallest diagram that answers the question, and do not repeat the same flow as prose, a diagram, and a code block unless each adds something different.

## Show the problem and correction

Order each finding as impact, then the cause path, then source, then the correction. State the user or operator consequence before any code. Give each finding its own short cause-and-effect chain; a diagram for one defect does not explain another.

```text
CA returns a nickname
  → Web stores it as the provider key ID
    → provider rejects it
      → deletion stays pending
```

For every code finding, include a fenced, language-tagged **Current** block with the *exact relevant source*, not just `path:line` or a paraphrase. Follow it with a fenced **Suggested correction** block showing the proposed code as it should be. Include enough surrounding lines to identify the issue, but avoid unrelated content. Cite the path and line range separately. Check that the correction fits the surrounding code; do not invent variables, APIs, or guarantees.

For documentation, configuration, or other non-code findings, use the same pattern: quote the exact relevant text or value in a fenced **Current** block, then show the proposed replacement in a fenced **Suggested correction** block. If no meaningful replacement exists, state the concrete action needed instead of fabricating a block. If the original cannot be inspected, clearly mark the finding as unverified and do not present a reconstructed quote as exact.

Example of the finding format (illustrative, not review evidence):

### High: Minimum replicas not met

- [ ] Resolved
- **Impact:** A single instance cannot tolerate its host failing.
- **Cause:** replica count is 1 → host loss removes the only instance → the service is down.
- **Location:** `deployment.yaml`, line 12.
- **Current:**

```yaml
replicas: 1
```

- **Suggested correction:** Set the agreed minimum replica count (three in this example).

```yaml
replicas: 3
```

Keep the verdict consistent with unresolved risks. When the operator confirms a fix, change only that finding to `- [x] Resolved` after verifying the correction; do not mark findings resolved based on intent alone.
