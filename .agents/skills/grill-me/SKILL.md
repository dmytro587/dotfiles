---
name: grill-me
description: Use when a user wants a plan or design stress-tested, asks to be grilled, or needs design decisions resolved.
---

# Grill Me

Investigate facts the codebase or available context can answer; do not ask the user for them.

For each unresolved decision, lead with the best current option before asking:

1. State: `I recommend <option>.`
2. Explain why it fits the user's context.
3. Name the material tradeoff or condition that would change the recommendation.
4. Ask exactly one question that resolves that tradeoff, then wait for the answer.

When the user asks for a neutral comparison or a quick option list, give it: ranked options with one-line tradeoffs, no recommendation-first framing. Reserve the recommend-then-question pattern for requests to stress-test or resolve a decision.

If essential facts are unknown, make the safest conditional default, state what could change it, then ask the discriminating question.

Continue one decision at a time until the design has a justified choice and explicit boundary.

## Stopping Limit

Stop the interview when the remaining decisions are reversible implementation details the user delegated; record them as tentative defaults instead of asking. After four rounds of questions without convergence, summarize the state and ask whether to continue grilling or accept defaults.
