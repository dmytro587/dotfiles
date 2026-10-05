# Orca configuration

`keybindings.json` mirrors Orca's macOS shortcuts in `~/.orca/keybindings.json`.
`source-control.json` is a curated copy of the global branch, pull request, and
commit-message settings from Orca's local profile. It contains no repository
settings, credentials, sessions, or browser data. Orca does not read this file
directly.

`_bootstrap/install.js` is repository-only. The full `bootstrap.sh` calls
`bootstrap_agents.sh`, which copies the two configuration files into `~/.orca/`
and runs the importer. It merges the saved settings into
`~/Library/Application Support/orca/profiles/local-default/orca-data.json`,
without replacing other settings or per-repository overrides. It creates a
backup next to that profile before a change. Repeating the install when settings
already match does not rewrite the profile.

To restore only Orca after cloning this repository:

```sh
rsync -a --exclude=_bootstrap .orca/ "$HOME/.orca/"
node .orca/_bootstrap/install.js
```

Node.js and an initialized macOS Orca profile are required. Launch Orca once
and quit it before restoring changed settings. The importer refuses unknown
profile formats and does not edit a running Orca profile. Keep `_bootstrap/`
out of `~/.orca/`; never copy Orca's application-support directory into this
repository.
