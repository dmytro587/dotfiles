---
name: archiving-docs-to-topics
description: Use ONLY when the user invokes it by hand (/archiving-docs-to-topics, "use the archiving-docs-to-topics skill") to keep development docs from a repository or worktree, such as `docs/task/`, in the dotfiles Obsidian topics. NEVER trigger automatically, even when the user mentions topics, Obsidian, or archiving.
disable-model-invocation: true
---

# Archiving docs to topics

Keep a copy of development docs (task tracking, research, skill experiments) from a worktree in the Obsidian vault at `$HOME/Documents/www/projects/dotfiles/topics/`, so they stay after the worktree is gone.

**Copy only.** "Move", "archive" and "keep" all mean copy here. Never delete, move or rename the source files, and never stage, commit or unstage them in either repository. If the user clearly asks to delete the source, ask again before you do it.

## Steps

1. **Read the vault contract.** Read `topics/AGENTS.md` and `topics/HOME.md`. The contract decides the topic layout, the `raw/` rules, tags, kinds, graph colors, `index.md` and `log.md`. This skill does not repeat them.
2. **Find the source.** Use the folder or files that the user names. Do not add sibling folders. If a named folder holds a subfolder with another purpose (for example `docs/task/other/`), ask whether it goes too.
3. **Choose the target and say it before you copy.** Give one line per source: source path, target path, new or existing topic, and tags. Ask only if the topic is unclear:
   - `docs/task/` of a task goes to the task archive topic of its project (`<project>-tasks`), as `raw/<task>/` plus a task card;
   - another folder goes to a topic about its subject. Reuse a topic when the subject is the same, and make a new topic when it is not;
   - a single file follows the single-capture rule of the contract, with capture properties.
4. **Choose tags.** Collect the values that are in use (`grep -h '^tags:' topics/*/brief.md topics/*/wiki/tasks/*.md`). Topic tags name a broad area that other topics share (for example `ai-agents`, `shopping`), not the topic itself (not `pr-description` for a PR description topic). Task card tags name the technical subjects of one task (for example `nitro-enclave`, `attestation`). Reuse a tag when it fits. Add a new one only when no tag fits, and say why in the plan.
5. **Do not overwrite an existing copy.** If the target `raw/` path exists, run `diff -r` against the source, show the differences, and ask. The contract keeps `raw/` immutable, so a later version is a new dated capture, not an edit.
6. **Copy and check.** Copy with `cp -a`, then run `diff -r` between the source and the copy. The copy must be the same, with the same folders and relative links. Do not edit the copied files.
7. **Write the topic files** that the contract asks for: the brief or the task card with the source path and the capture date, `wiki/index.md`, `wiki/log.md`, `HOME.md`, and the graph color.
8. **Report:** each copy with its `diff -r` result, the files that changed in the vault, and confirm that the source is unchanged.

## Common mistakes

| Mistake                                                        | Correct action                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Delete the source after the copy, because the user said "move" | Keep the source. Copy only                                                  |
| Copy a folder again over an older copy                         | Show the `diff -r` and ask. A new version is a new capture                  |
| Add properties or fix links in the copied files                | Keep the files as they are. Record the source in the brief or the task card |
| Copy a sibling folder that the user did not name               | Copy only what the user named                                               |
