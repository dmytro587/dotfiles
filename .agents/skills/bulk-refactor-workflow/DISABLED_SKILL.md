---
name: bulk-refactor-workflow
description: Use when a change requires many similar edits across one or more files and manual line-by-line editing would be slow or error-prone (renames, repetitive replacements, call-site updates, import/path rewrites, test fixture updates).
---

# Signature Migration

## Rule
For repetitive signature updates, do not edit line-by-line unless automated transform is impossible.

## Workflow
1. Identify scope and count matches with fff tools.
2. Choose codemod strategy:
   - regex/script for simple repetitive patterns
   - AST codemod for complex argument expressions
3. Run transform once on target file(s).
4. Verify with:
   - before/after match counts
   - diff inspection
   - targeted tests/lint
5. Only patch remaining outliers manually.

## Required checks
- Show pre-transform count
- Show post-transform count
- Confirm no unintended replacements
- Run related test file(s)

## Preferred tools
- fff tools for discovery/verification
- short Python/Node codemod script for replacement
- avoid manual edits in files > 400 lines for repetitive changes