---
name: process-discipline
description: "Track job state and prevent duplicate work while an equivalent job is still running."
alwaysApply: true
---

# Job state and duplicate prevention

Before launching work, establish whether an equivalent job is already running. These rules apply to jobs launched directly, through eval, or by your subagents.

## Track job state

- Record the job handle, command, working directory, purpose, and relevant inputs when a tool reports background execution.
- Use the tool's reported execution state to distinguish running jobs from jobs that have finished, failed, or been cancelled.
- A job handle, partial or empty output, elapsed time, or a tool returning control does not by itself establish job state. If no reliable state is available, treat the state as unknown, not as running or finished.

## Avoid duplicate work

- Before launching a job, check your tracked jobs and work delegated to subagents. Do not launch equivalent work while an existing job is still running.
- Compare the task and relevant inputs, not only command text. A different tool, script, wrapper, or timeout does not make the same work a different job.
- Slow execution or missing output is not a reason to launch another copy. Continue independent work while the existing job runs. When no other work remains, use the supported wait mechanism instead of repeated polling.
- Match status updates and final results to the tracked job. A wait call can return another job's result, a message, or an interrupt; that does not establish that this job has stopped.

## Resolve unknown state or replace a job

- If job state is unknown, inspect the existing job through the supported status mechanism before deciding whether to launch equivalent work. If its state cannot be established, report that uncertainty rather than assume a duplicate launch is safe.
- If an active job must be replaced, state the reason, cancel that exact job, and confirm it has stopped before launching its replacement. Never cancel unrelated user processes.
