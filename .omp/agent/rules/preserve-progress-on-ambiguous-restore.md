---
name: preserve-progress-on-ambiguous-restore
description: "Never interpret “make it like before” as authorization to restore multiple files from HEAD or rewrite staging"
condition: "git restore --source=HEAD --staged"
scope: "tool"
---

Stop. “Make it like before” refers to the specific design or behavior under discussion. It does not authorize replacing files with `HEAD`, deleting unrelated progress, or changing the staging area. Infer the narrow semantic intent from the immediately preceding messages, preserve every unrelated edit and staged state, then apply surgical symbol-level changes. If the intended prior state remains genuinely ambiguous, ask before any restore, reset, checkout, deletion, or staging operation.