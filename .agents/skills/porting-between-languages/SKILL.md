---
name: porting-between-languages
description: Use when rewriting or porting a service, module, or library from one programming language to another (for example TypeScript to Go), when planning such a rewrite, or when reviewing a pull request that ports existing code to a new language. Not for database schema migrations or deployment rollout steps.
---

# Porting between languages

<!-- Draft: not yet tested with baseline scenarios (writing-skills RED/GREEN). -->

## Overview

A port must keep what callers and stored data depend on, and it must read as native code of the target language. Ports fail in two directions:

- **Lost behavior:** something the source did implicitly (framework validation, a library's special values, an object's lifetime) is not reproduced.
- **Copied accidents:** source behavior that nothing depends on is reproduced, or names and comments only make sense next to the source.

Write as if the source implementation is already deleted. Every name, comment, and structure must make sense without it.

## Modes

| Mode | Output |
| --- | --- |
| Plan a port | The contract inventory, the compatibility directions that apply, and the checks to run. Do not run them. |
| Implement a port | The code, and the checks run with their results. |
| Review a port | An assessment of the evidence for each contract item and trap: checked, partly checked, or missing. For a pull request, use `tracking-pr-reviews` for the workspace; a local review without a pull request does not need it. |

## Decide what to keep by dependency

Classify each behavior by what depends on it, not by where it came from:

- **A caller or stored data depends on it:** keep it. Name it by behavior; one comment says why. This includes source-language quirks: if callers send `limit=10abc` and rely on `10`, the quirk is contract.
- **Nothing depends on it:** use the target idiom. Example: a `parseInt` quirk that only internal code reaches.
- **Unclear:** record the uncertainty, and check callers, logs, or stored data before you change observable behavior.

For data formats, require identical bytes only where a consumer uses the bytes themselves: signatures, hashes, key material, fixed binary layouts. Elsewhere, test that each reader gets the same values (for example, key order in an ordinary JSON object can change).

## Check each compatibility direction that applies

| Direction | Applies when | Check |
| --- | --- | --- |
| Upgrade | existing callers or stored data reach the new version | The new version accepts every request that callers send today and reads all existing data. A stricter new version breaks here. |
| Coexistence | both versions serve traffic or share state | Both accept each other's writes; the same configuration means the same thing in both; one owner for the schema and its migrations, with a stated path for how the other version gets each change. |
| Rollback | the old version can return after the new one wrote data | The old version reads everything the new one wrote. A looser new version, or a new data shape, breaks here. |

For each direction that applies, list which caller requests and which writes each version must accept. Skip a direction that does not apply (for example, a library replaced in one release has no coexistence).

## Inventory the contract

List each item that the code has, and skip the ones it does not have (a CLI has no routes; a pure library has no persisted state):

- **Inputs:** every config key and environment variable, with its type rules, defaults, and "absent" meaning. Reject an unsupported security setting at the point where the component accepts its configuration (service startup, constructor, config load); never ignore it.
- **Implicit framework behavior:** request validation, responses for unknown routes and methods, body parsers, CORS, error envelope, timeouts. A framework that validated requests for free leaves no code to translate.
- **Persisted state:** what is written to databases, files, and caches.
- **Wire formats** between components.

## Translation traps

Each row names a source behavior that the target can lose. State the invariant first; the fix depends on it.

| Trap | Example (TypeScript → Go) | Invariant to check |
| --- | --- | --- |
| Absent vs zero value | `undefined` became `false`, so "not configured" overwrote a stored value | Does "absent" mean something different from the zero value? |
| Nil results | a polling loop stored a `nil` response, then read a field from it | Which values can a call return on "not found" or error, and what reads them later? |
| Same name, other meaning | Go `rsa.SignPSS` treats salt length 0 as "automatic", Node as literal 0 | What does each target call do with 0, empty, and nil? |
| Different input kinds | a source API derived the public key from a private key; the target API requires the public key | What does each call accept, not only what is it named? |
| Structured text built by formatting | JSON policy, connection string, or URL built with `Sprintf`: nested arrays, unescaped passwords | Is the output valid for its grammar for every input? Build the structure, then encode it. |
| Implicit atomicity | an ORM save with relations was one transaction; hand-written statements are not | Must these writes succeed or fail together, or must partial progress stay? |
| Lifetime and ownership | per-config clients became one process-wide singleton (the first caller's credentials win) | Which owner and key did each object have in the source? |
| Cancellation | a cancelled request context also cancelled a cleanup write | Must this work finish after the caller cancels, or stop with it? |
| Identity in callbacks | a closure bound to its socket became a read of the "current" connection field | Which object does each event belong to, and can a newer object replace it meanwhile? |
| Process lifecycle | the server returned before draining, then dependencies closed under active requests | In which order must work drain and dependencies close? |
| Retyped constants | object identifiers retyped by hand, two of them wrong | Is there one source for each constant, and a test that uses data from the other side? |

Test with data that the source produced (keys, signatures, rows, responses). A round trip inside the new code alone does not prove compatibility.

## Write native code

- **Names describe behavior, not origin.** No `js`/`ts`/`legacy` prefixes: `parseLeadingInt`, not `jsParseIntPrefix`.
- **Comments explain in target terms first.** A source name may follow as a reference ("Matches the TS `createPaginationParams`."), never as the only explanation. Check each "mirrors X" claim; such comments go stale silently when X changes or is removed.
- **Design the structure for the target language.** Do not mirror the source file by file. Keep domain logic out of the transport layer: business code that returns HTTP errors is a sign of a one-to-one layer port. Follow the target's module conventions (in Go a folder is a package: split by concern, not by file count).
- **Use the target ecosystem's usual tools.** Do not rebuild the source framework by hand when the target solves the need differently.
- **Do not keep copies of shared code.** When two components need the same code, share one module, or add a check that fails when the copies differ. Copies drift during the port itself.

## Red flags

- A function, type, or file named after the source language.
- A comment whose only explanation is a source function or file name.
- `var _ = pkg.Name` lines that keep imports of a translated file alive.
- A hand-written reproduction of a source standard-library quirk, with no evidence that a caller depends on it.
- Structured data built by string formatting.
- A process-wide singleton where the source created one object per configuration.
- Dead fields or functions carried over "for parity".
- A claim that a stricter or looser version is "safe" without naming the direction (upgrade, coexistence, rollback).
