---
name: writing-documentation
description: Use when writing, updating, or reviewing README files or other Markdown documentation.
---

# Writing Documentation

Organize documentation from overview to detail. Each document should answer questions at its own level and link to the documents that own deeper details.

## Zoom Out First

Before changing a document:

1. Identify the project, package, or deployment root. Do not assume the repository root is the reader’s entry point.
2. Read the relevant parent, sibling, and child READMEs and linked documentation.
3. Identify the intended reader, the document’s scope, and where each topic belongs.

Use the existing documentation structure unless it prevents readers from finding or understanding the information.

## Place Information at the Right Level

- **Root README:** Explain what the project does, its main parts, and how to start using it. Link to module READMEs and detailed guides.
- **Module README:** Explain the module’s purpose, responsibilities, interfaces, and local usage. Link to child-module READMEs and relevant topic documents.
- **Topic document:** Own the detailed instructions, explanation, or reference for its subject. Make it discoverable from the relevant README.

Higher-level documents summarize and point downward. Lower-level documents explain their own scope, not the entire project.

Keep shared information at the nearest level that covers all affected modules. Keep module-specific details with the module.

Directory depth alone does not determine scope. A guide in `docs/` may cover the whole project or one module. Place and link it according to what it covers.

If several packages or deployment roots have separate entry points, give each the context its readers need.

## Keep One Source of Truth

Give each topic one authoritative location.

Elsewhere, include only the short summary needed to understand the context, then link to the authoritative document. Do not copy detailed instructions between READMEs.

When moving information, update its links and remove obsolete copies. Do not create a README for every directory unless it serves a reader.

## Write Only Useful Content

- Answer concrete reader questions.
- Use clear headings, short sentences, and specific terms.
- Include prerequisites, commands, examples, and limitations where readers need them.
- Verify claims against current code, configuration, and behavior. Do not invent missing facts.
- Explain decisions or constraints when they help readers use or maintain the system.
- Operator documentation should describe useful behavior and constraints, not irrelevant negative guarantees retained from development history. Example: document `grafana-connect.sh` local port `3003`, omit “and does not print credentials.”
- Remove filler, repetition, stale instructions, and descriptions that merely repeat obvious code.
- Do not force every document into the same template.

## Review and Verify

Check that:

- Readers can move from the entry-point README to the details they need.
- Each document contains information appropriate to its scope.
- Detailed information has one clear owner.
- Links resolve from the document’s actual location, including its published or deployed form when applicable.
- Paths, commands, examples, and claims are current.
- Changed or moved information has no stale references.

For review-only requests, report concrete problems and their locations. Do not rewrite files unless asked.
