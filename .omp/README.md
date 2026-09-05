# .omp

This folder configures one agent: OMP (Oh My Pi). Do not put configuration for
other agents here.

## File classes

| Class | Location | Bootstrap action |
|---|---|---|
| Mirror | everything except `_bootstrap/` | Copied to the same relative path under `~/.omp/` (rsync in `bootstrap_agents.sh`) |
| Repo-only | `_bootstrap/` | Read and executed from the repository. Never copied to `$HOME` |

Only mirror files that OMP itself reads. Do not track runtime state: `plugins/`
(lockfile, `node_modules`), `cache/`, `logs/`, `run/`, sessions, credentials.
OMP creates and owns those.

## Local plugins

Declaration: `_bootstrap/plugins.json`. One entry per plugin.

```json
{
  "pi-provider-factory": {
    "source": "~/Documents/www/pi-provider-factory",
    "sourceEnv": "OMP_FACTORY_PLUGIN_SOURCE",
    "targets": ["user", "profile:personal"]
  }
}
```

Fields:

- `source`: path to the plugin checkout. Lives outside this repository.
  `~` prefix allowed.
- `sourceEnv`: optional. Name of an environment variable that overrides
  `source` when set. Use for per-machine paths.
- `targets`: `user` for `~/.omp/plugins`, `profile:<name>` for
  `~/.omp/profiles/<name>/plugins`.

## Adding a plugin

1. Add an entry to `_bootstrap/plugins.json`.
2. Run `bash .omp/_bootstrap/install.sh` (or the full bootstrap).
3. Nothing else. The script calls OMP for every target.

## How linking works

`install.sh` runs `omp plugin link <source>` per target, and
`OMP_PROFILE=<name> omp plugin link <source>` for profile targets. OMP
creates the symlink and writes its own lockfile. `omp plugin link` is
idempotent, so re-running the installer changes nothing when state is correct.

The installer never writes symlinks or lockfiles itself. Do not add code that
does; OMP owns `~/.omp/plugins`, and its formats change between versions.

## Rejected alternatives

Do not reintroduce these:

- OMP marketplace installs for local checkouts: `plugin install` copies the
  plugin into a versioned cache. Edits in the checkout do not apply until
  re-install. Profile-scope install is broken on OMP 18.1.11 (fetches npm and
  fails with 404).
- Per-agent subfolders (`agent-plugins/<agent>/<plugin>`): `.omp` already
  identifies the agent.
- Hardcoded plugin blocks in `bootstrap.sh`: the manifest is the only place
  plugins are declared.
