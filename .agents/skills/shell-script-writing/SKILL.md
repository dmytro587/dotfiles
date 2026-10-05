---
name: shell-script-writing
description: Use when writing or reviewing Bash shell scripts, especially sourceable helpers, process supervisors, deployment orchestration, or cloud-resource automation.
---
# Shell Script Writing

Assume baseline shell knowledge. Keep this skill focused on boundaries that commonly cause real failures.

## Rules

1. **Namespace functions.** Every function definition MUST use `function <name>() {`; never use `<name>() {`. Zoom out before naming: the path and file role already identify the component. Prefix functions and exported mutable globals (`function <component>_<verb>() {`, `COMPONENT_*`) only when those names will enter another shell's namespace. A sourced module must not define `main`; use a guarded prefixed dispatcher such as `function <component>_cli() {`. A directly executed entrypoint may use unprefixed `function main() {` and unprefixed private helpers; do not prefix those helpers with the enclosing directory or component. Do not add generic shared helpers or clobber shared names casually.
2. **Declare immutable variables readonly.** Every script-defined variable initialized once and never intentionally reassigned MUST use a readonly declaration. Use `readonly NAME=value` for module or global constants.
3. **Keep sourced modules inert.** Sourcing may define functions and constants only; it must not run a command handler or change caller shell options. Resolve module-relative assets from `${BASH_SOURCE[0]}`, never the caller's working directory.
4. **Preserve command and output boundaries.** Pass commands through `"$@"` or argv arrays; never evaluate command strings or accept arbitrary shell fragments for probes and workers. If stdout carries a PID, identifier, or structured result, emit only that data there; send diagnostics and progress to stderr through the entire call chain.
5. **Own the process lifecycle.** One component must own every worker: registration, bounded readiness/liveness checks, signal forwarding, bounded TERM-to-KILL shutdown, and reaping. Choose a supervisor or pre-start initialization followed by one `exec`; never start a child and later `exec` a duplicate.
6. **Bound waits.** Every waiter, probe, and retry needs an explicit timeout/deadline; each individual probe needs its own timeout. Perform a final state read. Fixed sleeps are not readiness or eventual-consistency proof.
7. **Reconcile before mutation.** Read authoritative state first and return a real no-op when the desired healthy state already exists. Transform JSON/YAML structurally, select exactly one owned resource rather than an arbitrary list item, and verify the postcondition after mutation.
8. **Constrain destructive work.** Rollback and deletion may target only exact, proven-owned identifiers. Emit stable machine-readable recovery state. Re-read state before rollback; if state is unknown, preserve resources and report the required operator action. Do not put speculative remote cleanup in a generic `EXIT` trap.
9. **Keep security boundaries explicit.** Never expose secrets in logs or stdout. Do not interpolate untrusted input into SQL or policy documents. Keep cloud and IAM permissions least-privilege.

## Scripting Techniques

- Implement comprehensive argument parsing with `getopts` and usage functions.
- Create temporary files and directories safely with `mktemp` and cleanup traps.
- Design scripts to be idempotent and support dry-run modes.
- Validate inputs with `: "${VAR:?message}"` for required environment variables.
- Handle GNU vs BSD tool differences (for example, `sed -i` vs `sed -i ''` on macOS).

## Readability &amp; Maintainability

- Add section headers with comment blocks to organize related functions.
- Employ consistent naming: snake\_case for functions/variables, UPPER\_CASE for constants.
- Use descriptive function names that explain  purpose: `validate_input_file`, not `check_file`. Zoom out first — inspect the directory, filename, and whether this file is a folder entrypoint or a sourced module. Do not encode the directory, tool, or component into a private name when the path already does, and do not restyle conventional helpers (`usage`, `cleanup`) whose meaning is obvious in this script. Looking only at the script body is a naming error.
- Add inline comments for non-obvious logic, avoid stating the obvious.

## Non-rules

Do not spend skill context on generic Bash tutorials, quoting primers, ordinary argument parsing, logging syntax, or basic exit-status advice. State only reusable conventions and non-obvious failure boundaries.