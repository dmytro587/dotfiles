---
name: verify-cwd-before-relative-edits
description: "After switching worktrees or directories, relative paths in tool calls can silently target the wrong checkout — verify cwd or use absolute paths"
condition: "['\\\"]server/(goodkey|goodkey_kms|core)/[^'\\\"]*['\\\"]"
scope: ["tool:eval", "tool:write(*.ts)", "tool:edit(*.ts)"]
---

You are working across multiple git worktrees of the same repo. A relative path like `server/goodkey/...` resolves against the current shell cwd, which may still point at the previous worktree. Before reading, writing, or editing with relative paths after any worktree or directory switch, confirm the actual working directory (pwd) or use absolute paths for every file operation. If a fix reports success but re-verification shows the file is unchanged, STOP: the edit landed somewhere else. Do not re-apply the same fix repeatedly — first resolve which checkout the tools are actually targeting, fix the file in the intended worktree, and verify with a command rooted in that worktree.