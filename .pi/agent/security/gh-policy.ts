import { canonicalizePath, isProtectedResource } from "./canonical.ts";
import type { RiskClass } from "./types.ts";

export const GH_REFERENCE_VERSION = "2.89.0";

const LOW_COMMAND_PATHS = [
	"agent-task list",
	"agent-task view",
	"alias list",
	"auth status",
	"cache list",
	"codespace list",
	"codespace logs",
	"codespace ports",
	"codespace view",
	"completion",
	"config get",
	"config list",
	"extension list",
	"gist list",
	"gist view",
	"gpg-key list",
	"issue list",
	"issue status",
	"issue view",
	"label list",
	"licenses",
	"org list",
	"pr checks",
	"pr diff",
	"pr list",
	"pr status",
	"pr view",
	"project field-list",
	"project item-list",
	"project list",
	"project view",
	"release list",
	"release verify",
	"release view",
	"repo autolink list",
	"repo autolink view",
	"repo deploy-key list",
	"repo gitignore list",
	"repo gitignore view",
	"repo license list",
	"repo license view",
	"repo list",
	"repo view",
	"ruleset check",
	"ruleset list",
	"ruleset view",
	"run list",
	"run view",
	"run watch",
	"search code",
	"search commits",
	"search issues",
	"search prs",
	"search repos",
	"ssh-key list",
	"status",
	"variable list",
	"workflow list",
	"workflow view",
] as const;

const MEDIUM_COMMAND_PATHS = [
	"attestation download",
	"attestation trusted-root",
	"attestation verify",
	"co",
	"codespace cp",
	"codespace ports forward",
	"config clear-cache",
	"gist clone",
	"pr checkout",
	"release download",
	"release verify-asset",
	"repo clone",
	"repo set-default",
	"run download",
] as const;

const HIGH_COMMAND_PATHS = [
	"agent-task",
	"agent-task create",
	"alias",
	"alias delete",
	"alias import",
	"alias set",
	"api",
	"attestation",
	"auth",
	"auth login",
	"auth logout",
	"auth refresh",
	"auth setup-git",
	"auth switch",
	"auth token",
	"browse",
	"cache",
	"cache delete",
	"codespace",
	"codespace code",
	"codespace create",
	"codespace delete",
	"codespace edit",
	"codespace jupyter",
	"codespace ports visibility",
	"codespace rebuild",
	"codespace ssh",
	"codespace stop",
	"config",
	"config set",
	"copilot",
	"extension",
	"extension browse",
	"extension create",
	"extension exec",
	"extension install",
	"extension remove",
	"extension search",
	"extension upgrade",
	"gist",
	"gist create",
	"gist delete",
	"gist edit",
	"gist rename",
	"gpg-key",
	"gpg-key add",
	"gpg-key delete",
	"issue",
	"issue close",
	"issue comment",
	"issue create",
	"issue delete",
	"issue develop",
	"issue edit",
	"issue lock",
	"issue pin",
	"issue reopen",
	"issue transfer",
	"issue unlock",
	"issue unpin",
	"label",
	"label clone",
	"label create",
	"label delete",
	"label edit",
	"org",
	"pr",
	"pr close",
	"pr comment",
	"pr create",
	"pr edit",
	"pr lock",
	"pr merge",
	"pr ready",
	"pr reopen",
	"pr revert",
	"pr review",
	"pr unlock",
	"pr update-branch",
	"preview",
	"preview prompter",
	"project",
	"project close",
	"project copy",
	"project create",
	"project delete",
	"project edit",
	"project field-create",
	"project field-delete",
	"project item-add",
	"project item-archive",
	"project item-create",
	"project item-delete",
	"project item-edit",
	"project link",
	"project mark-template",
	"project unlink",
	"release",
	"release create",
	"release delete",
	"release delete-asset",
	"release edit",
	"release upload",
	"repo",
	"repo archive",
	"repo autolink",
	"repo autolink create",
	"repo autolink delete",
	"repo create",
	"repo delete",
	"repo deploy-key",
	"repo deploy-key add",
	"repo deploy-key delete",
	"repo edit",
	"repo fork",
	"repo gitignore",
	"repo license",
	"repo rename",
	"repo sync",
	"repo unarchive",
	"ruleset",
	"run",
	"run cancel",
	"run delete",
	"run rerun",
	"search",
	"secret",
	"secret delete",
	"secret list",
	"secret set",
	"ssh-key",
	"ssh-key add",
	"ssh-key delete",
	"variable",
	"variable delete",
	"variable get",
	"variable set",
	"workflow",
	"workflow disable",
	"workflow enable",
	"workflow run",
] as const;

function buildManifest() {
	const manifest: Record<string, RiskClass> = {};
	const add = (floor: RiskClass, paths: readonly string[]) => {
		for (const path of paths) {
			if (manifest[path] !== undefined) throw new Error(`Duplicate GitHub CLI policy path: ${path}`);
			manifest[path] = floor;
		}
	};
	add("low", LOW_COMMAND_PATHS);
	add("medium", MEDIUM_COMMAND_PATHS);
	add("high", HIGH_COMMAND_PATHS);
	return Object.freeze(manifest);
}

export const GH_2_89_0_COMMANDS = buildManifest();

const BUILTIN_ALIAS_REWRITES = [
	["repo autolink new", "repo autolink create"],
	["repo autolink ls", "repo autolink list"],
	["repo deploy-key ls", "repo deploy-key list"],
	["repo gitignore ls", "repo gitignore list"],
	["repo license ls", "repo license list"],
	["pr co", "pr checkout"],
	["agent-tasks", "agent-task"],
	["agents", "agent-task"],
	["agent", "agent-task"],
	["at", "attestation"],
	["cache ls", "cache list"],
	["co", "pr checkout"],
	["cs", "codespace"],
	["codespace ls", "codespace list"],
	["config ls", "config list"],
	["extensions", "extension"],
	["ext", "extension"],
	["gist new", "gist create"],
	["gist ls", "gist list"],
	["gpg-key ls", "gpg-key list"],
	["issue new", "issue create"],
	["issue ls", "issue list"],
	["label ls", "label list"],
	["org ls", "org list"],
	["pr new", "pr create"],
	["pr ls", "pr list"],
	["project ls", "project list"],
	["release new", "release create"],
	["release ls", "release list"],
	["repo new", "repo create"],
	["repo ls", "repo list"],
	["rs", "ruleset"],
	["ruleset ls", "ruleset list"],
	["run ls", "run list"],
	["secret remove", "secret delete"],
	["secret ls", "secret list"],
	["ssh-key ls", "ssh-key list"],
	["variable remove", "variable delete"],
	["variable ls", "variable list"],
	["workflow ls", "workflow list"],
] as const;

const ATTESTATION_DOWNLOAD_OPTIONS = [
	["--digest-alg", "-d"],
	["--hostname"],
	["--limit", "-L"],
	["--owner", "-o"],
	["--predicate-type"],
	["--repo", "-R"],
] as const;

const ATTESTATION_VERIFY_OPTIONS = [
	["--bundle", "-b"],
	["--cert-identity"],
	["--cert-identity-regex", "-i"],
	["--cert-oidc-issuer"],
	["--custom-trusted-root"],
	["--digest-alg", "-d"],
	["--format"],
	["--hostname"],
	["--jq", "-q"],
	["--limit", "-L"],
	["--owner", "-o"],
	["--predicate-type"],
	["--repo", "-R"],
	["--signer-digest"],
	["--signer-repo"],
	["--signer-workflow"],
	["--source-digest"],
	["--source-ref"],
	["--template", "-t"],
] as const;

const ATTESTATION_VERIFY_BOOLEAN_OPTIONS = ["--bundle-from-oci", "--deny-self-hosted-runners", "--no-public-good"] as const;

const RELEASE_VERIFY_ASSET_OPTIONS = [
	["--format"],
	["--jq", "-q"],
	["--repo", "-R"],
	["--template", "-t"],
] as const;

function hasLongFlag(args: string[], flag: string) {
	return args.some((argument) => argument === flag || argument.startsWith(`${flag}=`));
}

function browserFlag(args: string[]) {
	return hasLongFlag(args, "--web") || args.some((argument) => argument.startsWith("-w") && !argument.startsWith("--"));
}

function aliasTokens(args: string[]) {
	let normalized = args;
	for (let pass = 0; pass < 3; pass += 1) {
		const rewrite = BUILTIN_ALIAS_REWRITES.find(([source]) => {
			const sourceTokens = source.split(" ");
			return sourceTokens.every((token, index) => normalized[index] === token);
		});
		if (!rewrite) return normalized;
		const [source, target] = rewrite;
		normalized = [...target.split(" "), ...normalized.slice(source.split(" ").length)];
	}
	return normalized;
}

function documentedPath(args: string[]) {
	for (let count = Math.min(3, args.length); count > 0; count -= 1) {
		const path = args.slice(0, count).join(" ");
		if (Object.hasOwn(GH_2_89_0_COMMANDS, path)) return path;
	}
}

function option(args: string[], longFlag: string, shortFlag?: string) {
	const values: Array<string | undefined> = [];
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index]!;
		if (argument === longFlag || shortFlag !== undefined && argument === shortFlag) values.push(args[index + 1]);
		else if (argument.startsWith(`${longFlag}=`)) values.push(argument.slice(longFlag.length + 1));
		else if (shortFlag !== undefined && argument.startsWith(shortFlag) && argument !== shortFlag && !argument.startsWith("--")) values.push(argument.slice(shortFlag.length).replace(/^=/, ""));
	}
	return { present: values.length > 0, repeated: values.length > 1, value: values[values.length - 1] };
}

function literalPositionals(args: string[], start: number, valueOptions: readonly (readonly [string, string?])[], booleanOptions: readonly string[]) {
	const positionals: string[] = [];
	for (let index = start; index < args.length; index += 1) {
		const argument = args[index]!;
		if (booleanOptions.includes(argument)) continue;
		const optionDefinition = valueOptions.find(([longFlag, shortFlag]) =>
			argument === longFlag ||
			shortFlag !== undefined && argument === shortFlag ||
			argument.startsWith(`${longFlag}=`) ||
			shortFlag !== undefined && argument.startsWith(shortFlag) && argument !== shortFlag && !argument.startsWith("--"),
		);
		if (optionDefinition) {
			const [longFlag, shortFlag] = optionDefinition;
			if (argument === longFlag || shortFlag !== undefined && argument === shortFlag) {
				const value = args[index + 1];
				if (!value || value.startsWith("-")) return;
				index += 1;
				continue;
			}
			if (argument.startsWith(`${longFlag}=`)) {
				if (argument.length === longFlag.length + 1) return;
				continue;
			}
			if (!shortFlag || argument.slice(shortFlag.length).replace(/^=/, "") === "") return;
			continue;
		}
		if (argument.startsWith("-")) return;
		positionals.push(argument);
	}
	return positionals;
}

async function workspacePath(path: string | undefined, cwd: string, kind: "file" | "directory" | "either", reason: string) {
	if (!path || path.startsWith("-")) return { floor: "high" as const, hardDeny: false, reason: "GitHub CLI file operations require a literal workspace path." };
	try {
		const resource = await canonicalizePath(path, cwd);
		if (isProtectedResource(resource)) return { floor: "high" as const, hardDeny: true, reason: "Protected GitHub CLI paths are denied." };
		if (kind === "file" && resource.exists && !resource.isFile) return { floor: "high" as const, hardDeny: false, reason: "GitHub CLI file input must be a regular workspace file." };
		if (kind === "directory" && resource.exists && !resource.isDirectory) return { floor: "high" as const, hardDeny: false, reason: "GitHub CLI directory output must be a workspace directory." };
		return { floor: "medium" as const, hardDeny: false, reason };
	} catch {
		return { floor: "high" as const, hardDeny: true, reason: "Ambiguous, symlinked, or out-of-workspace GitHub CLI paths are denied." };
	}
}

function codespacePath(value: string) {
	return /^(?:[^/:\s]+:|:)/.test(value);
}

async function assessCodespaceCopy(args: string[], cwd: string) {
	const operands = args.slice(2);
	if (operands.length !== 2 || operands.some((operand) => operand.startsWith("-"))) {
		return { floor: "high" as const, hardDeny: false, reason: "Codespace copies require one literal local path and one literal codespace path." };
	}
	const [source, destination] = operands;
	if (codespacePath(source!) === codespacePath(destination!)) {
		return { floor: "high" as const, hardDeny: false, reason: "Codespace copies require an unambiguous local-to-remote direction." };
	}
	return workspacePath(codespacePath(source!) ? destination : source, cwd, "either", "A literal codespace copy has bounded workspace side effects.");
}

async function assessAttestationArtifact(value: string, cwd: string) {
	if (value.startsWith("oci://")) {
		if (value.length === "oci://".length) {
			return { floor: "high" as const, hardDeny: false, reason: "Attestation OCI references must be complete." };
		}
		return { floor: "medium" as const, hardDeny: false, reason: "Attestation OCI inspection is a bounded external operation." };
	}
	return workspacePath(value, cwd, "file", "Attestation operations use a bounded workspace artifact.");
}

async function assessOptionalWorkspaceFile(args: string[], cwd: string, longFlag: string, shortFlag?: string) {
	const candidate = option(args, longFlag, shortFlag);
	if (!candidate.present) return;
	if (candidate.repeated || candidate.value === undefined) {
		return { floor: "high" as const, hardDeny: false, reason: `${longFlag} requires one literal workspace file.` };
	}
	return workspacePath(candidate.value, cwd, "file", `${longFlag} uses a bounded workspace file.`);
}

async function assessAttestationDownload(args: string[], cwd: string) {
	const positionals = literalPositionals(args, 2, ATTESTATION_DOWNLOAD_OPTIONS, []);
	if (!positionals || positionals.length !== 1) {
		return { floor: "high" as const, hardDeny: false, reason: "Attestation download requires one literal artifact path or OCI reference." };
	}
	return assessAttestationArtifact(positionals[0]!, cwd);
}

async function assessAttestationVerify(args: string[], cwd: string) {
	const positionals = literalPositionals(args, 2, ATTESTATION_VERIFY_OPTIONS, ATTESTATION_VERIFY_BOOLEAN_OPTIONS);
	if (!positionals || positionals.length !== 1) {
		return { floor: "high" as const, hardDeny: false, reason: "Attestation verification requires one literal artifact path or OCI reference." };
	}
	const artifact = await assessAttestationArtifact(positionals[0]!, cwd);
	if (artifact.floor === "high") return artifact;
	const bundle = await assessOptionalWorkspaceFile(args, cwd, "--bundle", "-b");
	if (bundle?.floor === "high") return bundle;
	const trustedRoot = await assessOptionalWorkspaceFile(args, cwd, "--custom-trusted-root");
	if (trustedRoot?.floor === "high") return trustedRoot;
	return { floor: "medium" as const, hardDeny: false, reason: "Attestation verification has bounded local and external effects." };
}

async function assessReleaseVerifyAsset(args: string[], cwd: string) {
	const positionals = literalPositionals(args, 2, RELEASE_VERIFY_ASSET_OPTIONS, []);
	if (!positionals || positionals.length < 1 || positionals.length > 2) {
		return { floor: "high" as const, hardDeny: false, reason: "Release asset verification requires one literal workspace file and an optional tag." };
	}
	return workspacePath(positionals[positionals.length - 1]!, cwd, "file", "Release asset verification reads a bounded workspace file.");
}

async function assessMediumPath(path: string, args: string[], cwd: string) {
	if (path === "codespace cp") return assessCodespaceCopy(args, cwd);
	if (path === "attestation download") return assessAttestationDownload(args, cwd);
	if (path === "attestation verify") return assessAttestationVerify(args, cwd);
	if (path === "release verify-asset") return assessReleaseVerifyAsset(args, cwd);
	if (path === "release download") {
		const output = option(args, "--output", "-O");
		const directory = option(args, "--dir", "-D");
		if (output.repeated || directory.repeated) {
			return { floor: "high" as const, hardDeny: false, reason: "Release download path options cannot be repeated." };
		}
		if (output.present && directory.present) {
			return { floor: "high" as const, hardDeny: false, reason: "Release download requires one output destination." };
		}
		if (output.present && output.value === undefined || directory.present && directory.value === undefined) {
			return { floor: "high" as const, hardDeny: false, reason: "Release download path options require literal values." };
		}
		if (output.value === "-") {
			if (hasLongFlag(args, "--clobber")) return { floor: "high" as const, hardDeny: false, reason: "Release download overwrite is High risk." };
			return { floor: "medium" as const, hardDeny: false, reason: "Release download to standard output is a bounded external operation." };
		}
		const destination = await workspacePath(output.value ?? directory.value ?? ".", cwd, output.present ? "file" : "directory", "Release download has bounded workspace side effects.");
		if (destination.hardDeny) return destination;
		if (hasLongFlag(args, "--clobber")) return { floor: "high" as const, hardDeny: false, reason: "Release download overwrite is High risk." };
		return destination;
	}
	if (path === "run download") {
		const directory = option(args, "--dir", "-D");
		if (directory.repeated) {
			return { floor: "high" as const, hardDeny: false, reason: "Workflow artifact download path options cannot be repeated." };
		}
		if (directory.present && directory.value === undefined) {
			return { floor: "high" as const, hardDeny: false, reason: "Workflow artifact download paths require literal values." };
		}
		return workspacePath(directory.value ?? ".", cwd, "directory", "Workflow artifact download has bounded workspace side effects.");
	}
	if (path === "gist clone" || path === "repo clone") {
		if (args.includes("--") || args.some((argument) => argument.startsWith("-"))) {
			return { floor: "high" as const, hardDeny: false, reason: "Git clone pass-through options are outside the permission gate's authority." };
		}
		const destination = args[3] ?? ".";
		return workspacePath(destination, cwd, "directory", "GitHub clone has bounded workspace side effects.");
	}
	return { floor: "medium" as const, hardDeny: false, reason: "Known GitHub CLI operation has bounded local or external side effects." };
}

export async function assessGhCommand(args: string[], cwd: string) {
	if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h" || args[0] === "--version" || args[0] === "version") {
		return { floor: "low" as const, hardDeny: false, reason: "GitHub CLI help and version reporting are read-only." };
	}

	const normalized = aliasTokens(args);
	const path = documentedPath(normalized);
	if (!path) return { floor: "high" as const, hardDeny: false, reason: "Unknown GitHub CLI commands and aliases are High risk." };
	if (normalized.includes("--help") || normalized.includes("-h")) {
		return { floor: "low" as const, hardDeny: false, reason: "GitHub CLI help is read-only." };
	}
	if (path === "auth token" || path === "auth status" && (hasLongFlag(normalized, "--show-token") || normalized.some((argument) => argument.startsWith("-t") && !argument.startsWith("--")))) {
		return { floor: "high" as const, hardDeny: true, reason: "GitHub authentication token disclosure is denied." };
	}
	if ((path === "auth login" || path === "auth refresh") && (hasLongFlag(normalized, "--with-token") || hasLongFlag(normalized, "--insecure-storage"))) {
		return { floor: "high" as const, hardDeny: true, reason: "Credential-bearing GitHub authentication is denied." };
	}
	if (normalized.includes("--")) return { floor: "high" as const, hardDeny: false, reason: "GitHub CLI pass-through arguments are High risk." };
	if (browserFlag(normalized)) return { floor: "high" as const, hardDeny: false, reason: "GitHub browser-launching operations are High risk." };
	if (path === "browse" && hasLongFlag(normalized, "--no-browser")) {
		return { floor: "low" as const, hardDeny: false, reason: "GitHub URL rendering without a browser is read-only." };
	}
	if (path === "repo set-default" && hasLongFlag(normalized, "--view")) {
		return { floor: "low" as const, hardDeny: false, reason: "GitHub default-repository inspection is read-only." };
	}
	if (path === "pr checkout" && (hasLongFlag(normalized, "--force") || normalized.includes("-f"))) {
		return { floor: "high" as const, hardDeny: true, reason: "Forced pull-request checkout can discard workspace changes." };
	}

	const floor = GH_2_89_0_COMMANDS[path]!;
	if (floor === "medium") return assessMediumPath(path, normalized, cwd);
	if (floor === "low") return { floor, hardDeny: false, reason: "Known GitHub CLI inspection is read-only." };
	return { floor, hardDeny: false, reason: "Known GitHub CLI operation is High risk." };
}
