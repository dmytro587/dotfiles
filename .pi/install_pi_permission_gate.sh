#!/bin/bash

# Install the Pi permission gate without replacing the user's other Pi settings.
# Run from bootstrap.sh or directly after reviewing this repository.
set -euo pipefail

repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source_agent_dir="$repo_dir/agent"
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
security_dir="$agent_dir/security"
policy_source="$source_agent_dir/permission-policy.json"
settings_path="$agent_dir/settings.json"
extension_path="$security_dir/permission-gate.ts"

if [ ! -f "$policy_source" ] || [ ! -f "$source_agent_dir/security/permission-gate.ts" ]; then
	echo "Permission gate source files are missing from $source_agent_dir" >&2
	exit 1
fi

install -d -m 0700 "$security_dir"
for source_file in "$source_agent_dir/security"/*.ts; do
	case "$source_file" in
		*.test.ts) continue ;; # Test modules stay in the repository and are never loaded by Pi.
	esac
	install -m 0600 "$source_file" "$security_dir/$(basename "$source_file")"
done
install -m 0600 "$policy_source" "$agent_dir/permission-policy.json"

node - "$settings_path" "$extension_path" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [settingsPath, extensionPath] = process.argv.slice(2);
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") {
    throw new Error(`Refusing to overwrite invalid Pi settings at ${settingsPath}: ${error.message}`);
  }
}
if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
  throw new Error(`Refusing to overwrite non-object Pi settings at ${settingsPath}`);
}
if (settings.extensions !== undefined && !Array.isArray(settings.extensions)) {
  throw new Error(`Refusing to overwrite non-array extensions in ${settingsPath}`);
}
const extensions = Array.isArray(settings.extensions) ? settings.extensions.filter((entry) => entry !== extensionPath) : [];
extensions.push(extensionPath); // configured paths load after auto-discovered extensions
settings.extensions = extensions;
const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, settingsPath);
NODE

echo "Installed Pi permission gate at $extension_path"
echo "Default mode is configured in $agent_dir/permission-policy.json; use /permission-mode high for unattended High operations."
