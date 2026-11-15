// Asks the agent, once per user prompt, to bring the task files in ./docs/task/ in line
// with the current state when one of them changed during the run.
//
// The check and the request text live in ~/.agents/hooks/task-docs-sync.sh, which the
// Claude Code hooks also call, so both agents get the same request.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { homedir } from "node:os"
import { join } from "node:path"

const SCRIPT = join(homedir(), ".agents", "hooks", "task-docs-sync.sh")
const SCRIPT_TIMEOUT_MS = 5_000

export default function (pi: ExtensionAPI) {
  // One marker per OMP process, so parallel sessions do not share it.
  const session = `omp-${process.pid}-${Date.now()}`
  let requested = false
  let requestRunPending = false

  pi.on("before_agent_start", async () => {
    // The run that the request starts must not set a new mark, or the request would
    // repeat after every reconciliation. Pi sends before_agent_start for that run and
    // OMP does not, so the flag is also cleared when that run ends.
    if (requestRunPending) return
    requested = false
    await pi.exec("bash", [SCRIPT, "start", session], { timeout: SCRIPT_TIMEOUT_MS })
  })

  pi.on("agent_end", async (event, ctx) => {
    // OMP marks agent_end events that are not the end of the run with willContinue.
    if ("willContinue" in event && event.willContinue === true) return
    if (requested) {
      requestRunPending = false
      return
    }
    const result = await pi.exec("bash", [SCRIPT, "check", session, ctx.cwd], {
      timeout: SCRIPT_TIMEOUT_MS,
    })
    const request = result.stdout.trim()
    if (result.code !== 0 || !request) return
    requested = true
    requestRunPending = true
    pi.sendMessage(
      { customType: "task-docs-sync", content: request, display: true },
      { triggerTurn: true, deliverAs: "followUp" }
    )
  })
}
