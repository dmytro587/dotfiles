# Goods Research Skill Review

## Scope

Independent review of `SKILL.md` after the rubric-first and value-for-money workflow was added.

## Verdict

Approved after revision.

The review found that the main behavior is now explicit: research category-specific selection criteria before an open product search; separate hard gates from preferences; verify exact offers; and rank only comparable candidates by evidence-backed value rather than nominal price.

## Findings resolved

1. **Unknown hard gates when questions are forbidden**
   - Risk: silently assuming size, fit, or delivery market could create a false winner.
   - Resolution: the skill requires the agent to name the blocking unknown and not name a winner.

2. **Incomplete delivered cost against a strict budget**
   - Risk: an item with unknown mandatory shipping, tax, or fees could be treated as within budget.
   - Resolution: a partially known cost cannot confirm the budget or rank with fully confirmed offers.

3. **No verified candidate after filtering**
   - Risk: a required final winner could cause a rejected candidate to be recommended.
   - Resolution: the skill now explicitly allows and requires a no-match result.

## Applied scenario

For: “Find the best men’s cycling bib shorts for $50–$100 today. Do not ask questions; just give options.”

The reviewer applied the final skill and returned:

> I can’t name a verified best option: your delivery market and exact size/fit are blocking unknowns. Without them, I cannot confirm availability of a specific variant or that its delivered total is within $50–$100, so I won’t assume them or name a winner.

This is the intended outcome. It prevents a plausible-looking but unverified product list while preserving the rubric-first search requirement for a request that contains enough information to verify candidates.
