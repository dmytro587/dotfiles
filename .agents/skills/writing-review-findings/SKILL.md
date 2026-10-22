---
name: writing-review-findings
description: Use when asked, manually or automatically, to dump a completed review, audit, assessment, or findings into a new Markdown file. Long reports get a reader map (what each section settles, and how deep it goes) before evidence. Keep one settled-versus-unverified split in the verdict, the findings, and any overview. Put logs and other non-critical support at the end of the section, inside closed details toggles.
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
7. `## Checks ran`: name each check and its observed result where the reader can see them. `## Checks skipped and why`: name each relevant omitted check and reason. Do not claim a check ran when it did not. Next to a result, say what it does not prove. Full command output and logs go at the end of this section, collapsed.
8. `## Open questions (operator only)`: only decisions an operator must make; write “None” if there are none. An evidence gap is not a decision: inspect the missing source before asking. Keep one decision, and mark the same split of settled versus unverified in the verdict, the findings, and any overview.

When the report is long enough that a reader might stop partway, put one table under the title before any evidence. Columns: section, what that section settles, and depth (`decision`, `mechanism`, `code`, `observation`, or `audit trail`). A heading list is not this map. Do not drop code, contracts, or caveats to make the report shorter; the map is what makes the depth skippable.

Inside a long section, say in two to four sentences what is coming, in the order it appears, and what the section does not decide. Draw the path before quoting source. Use the smallest diagram that answers the question, and do not repeat the same flow as prose, a diagram, and a code block unless each adds something different.

## What stays open

A reader should be able to stop after the verdict and know what is broken, what is still open, and what to do next. Do not make them read logs to reach that.

Inside each section, keep this order:

1. What the section settles, including what it does not decide.
2. The decision or mechanism in words, then the smallest diagram that adds something.
3. The action, when there is one: impact, cause, and the correction.
4. At the end of that same section, the support.

Support is evidence, logs, command output, long quotes, transcripts, sandbox notes, and audit trails. It stays in the report. It does not lead the section.

Put each non-critical support block in its own closed `<details>` element at the end of the section it supports. The `<summary>` names what is inside and says that opening it does not change the conclusion above. Leave a blank line after `</summary>` and before `</details>` so Markdown inside still renders. Do not nest toggles.

```html
<details>
<summary>Log: deletion response (does not change the finding above)</summary>

provider returned 400 for the stored nickname.

</details>
```

Leave visible anything needed to act or to avoid a false conclusion: the verdict, the map, each finding’s impact and cause, the suggested correction, a short quote when that quote is the defect, the check name and result, and the line that says what a result does not prove. Do not collapse a caveat that changes the settled-versus-unverified split. Collapse the log that illustrates it.

Choose per section. A short report with no logs stays fully open. A finding whose only evidence is a few lines of source keeps that source next to the correction. Move a block to the end and collapse it when it is long support rather than the point: raw logs, full transcripts, repeated quotes, sandbox notes, or an audit trail.

Do not delete that material to shorten the page. The toggle is what keeps the introduction readable.

## Show the problem and correction

Order each finding as impact, then the cause path, then source, then the correction. State the user or operator consequence before any code. Give each finding its own short cause-and-effect chain; a diagram for one defect does not explain another.

```text
CA returns a nickname
  → Web stores it as the provider key ID
    → provider rejects it
      → deletion stays pending
```

For every code finding, include a fenced, language-tagged **Current** block with the *exact relevant source*, not just `path:line` or a paraphrase. Follow it with a fenced **Suggested correction** block showing the proposed code as it should be. Include enough surrounding lines to identify the issue, but avoid unrelated content. Cite the path and line range separately. Check that the correction fits the surrounding code; do not invent variables, APIs, or guarantees. Keep those two blocks open. If the quote is long, keep the identifying lines open and move the rest to a `<details>` block after the correction.

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


[You have received this identical output 3 times. Re-reading '/Users/beeshop/Documents/www/projects/dotfiles/.agents/skills/writing-review-findings/SKILL.md:raw' will not change it — use a narrower selector (path:A-B), or proceed with the edit.]