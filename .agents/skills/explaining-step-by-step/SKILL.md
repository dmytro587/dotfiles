---
name: explaining-step-by-step
description: Use only when the user explicitly asks to be led or walked through a topic step by step, one step at a time, or "only go on when I understand". Typical context is an unfamiliar domain, project, review comment or decision. Do not use for ordinary explanation requests that do not ask for step-by-step pacing.
---

# Explaining Step by Step

## Overview

The user learns an unfamiliar topic in small pieces. **One step per reply. Stop after each step and check understanding. Go to the next step only after the user says the current one is clear.**

"Step by step" here means pacing across turns. It does NOT mean a numbered list in one reply.

## The first reply

1. One or two sentences: what the user will understand at the end.
2. The route: a short list of all steps, with a marker on the current one.

   ```
   Step 1  What a CA chain is        ◄── we are here
   Step 2  Root rotation
   Step 3  The bug in the comment
   ```

3. Step 1 only.
4. The pacing check (below). Then end the turn.

## Each step

- **One idea.** If a step needs a second new idea, split it into two steps.
- **Only what this step needs.** Facts for later steps wait for those steps.
- **Assume no background.** Define every term at its first use, in plain words. Do not use a term that an earlier step did not define.
- **The smallest diagram that shows the idea.** Use one per step when it helps.
- **Real evidence when it exists.** Use the actual code, config or quote, with `path:line`, not a paraphrase.
- **Connect it.** End with one or two lines: "How this connects to your situation: …".
- **Mark inference.** Say what you checked and what you only infer.

## Pacing check

After each step, ask with the user-question tool (AskUserQuestion or its equivalent):

- Question: "Is Step N (<one-line recap>) clear enough to go on?"
- Options: "Clear, go to Step N+1" (name what comes next), and "I have a question" (free text through "Other").

If no such tool exists, end with one line: "Tell me when to go on, or ask a question." Then end the turn.

The pacing check is not a request for facts. If you need facts from the user, ask for them in a separate question, after the understanding check.

## When the user asks a question

- Answer only that question, at the same level. Stay on the current step.
- If the question shows that an earlier step was unclear, correct that step plainly. Do not defend the earlier wording.
- Check again before you go on. The route can change: add, split or drop steps, and show the updated route.

## After the last step

1. A short summary table: each item, what it means, what to do.
2. A one-line offer to save the walkthrough as Markdown. In that file, put the summary first, and put each step's explanation in a closed `<details>` toggle next to the item it supports.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| All steps in one reply, numbered | One step, then stop |
| No check, or "Any questions?" buried in text | Use the pacing check and end the turn |
| Facts about the user's system asked in place of the check | Check understanding first, ask for facts separately |
| A step that also explains the next topic "for context" | Move it to its own step |
| A term like "activation" or "old code" without a definition | Define it at first use |
| "Here is everything you need to know" | That is a wall of text. Split it |
