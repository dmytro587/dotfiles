---
name: write-migration-steps
description: Use when writing, revising, or reviewing operator migration steps, deployment preparation checklists, or rollout runbooks across environments. Does not cover implementing migration code or executing a rollout.
---

# Write Migration Steps

Write a procedure an operator can follow from the current state to the intended state without guessing. Document the migration delta and respect the requested audience, scope, and format. Writing a procedure does not authorize executing it.

## Establish the delta

Read the relevant deployment entry point, configuration, and release automation. Identify what already exists, what automation actually applies, and what requires manual intervention. A file in the repository does not prove the release applies it.

Document manual changes and the commands that invoke automation. Reference maintained configuration instead of duplicating it. Assume established operator setup; add prerequisites and checks only when this migration needs them. Mark missing inputs or unresolved decisions explicitly; do not invent values or executable procedures.

## Write executable actions

- Name the exact target, selected record or field, operation, required value, and completion condition. Include namespace, path, or working directory where needed to locate the target.
- Specify whether each value is copied, generated, selected, or supplied externally. Identify its source or generation method. Verify parameters against the implementation or authoritative documentation.
- Generate shared values once and identify their consumers. Keep independent environments' credentials and key material separate.
- Obtain inputs before consuming them. Introduce files and variables before use. Avoid instructions that send the operator to a later step to satisfy a prerequisite.
- Keep preparation and application together when they form one operation. Create a new resource populated when its inputs are available. Use empty placeholders only when the requested workflow needs them.

## Choose the representation

- Use precise prose for straightforward field edits.
- Provide the structured object when the operator must insert a record.
- Provide commands for resource creation, key generation, and other CLI operations. Keep them as short as correctness permits.
- Code blocks must be usable for the stated operation. Identify substitutions and their sources; do not present schematic fragments as runnable commands.
- Reference existing deployment files and their application command instead of reproducing their contents.

## Use the checklist hierarchy

Unless the user requests another format, use one parent checkbox per action and a child checkbox for every applicable environment:

```markdown
- [ ] Do X
  - [ ] Canary
  - [ ] Production
  - [ ] OtherEnv
```

Put shared instructions under the parent and environment-specific values or commands under each child. Use the actual environment names; keep completion checks inside the matching environment item. Track every required action. Mark the parent complete only when all applicable children are complete; preserve reported progress.

## Preserve state and handle repetition

Distinguish adding, merging, replacing, and creating. Preserve unrelated configuration. Explain how to proceed if the target exists or the step was partially completed. Identify commands that clear populated values, regenerate credentials, or overwrite key material when repeated. Reuse prepared inputs unless replacement is required.

## Review the procedure

Walk through it in execution order. Confirm targets, input sources, dependencies, useful completion checks, and rerun behavior. Check command syntax without executing documented mutations. Use focused source checks to resolve material uncertainty; avoid an unrelated system audit.

State shared context once. Remove repeated instructions and cautions that do not affect execution. Keep evidence secondary to the operator's path.

For every step, ask: **Can the intended operator complete this action without guessing, searching for missing instructions, or reconstructing the author's intent?**
