import { basename } from "node:path";
import { canonicalizePath, isProtectedPathPattern, isProtectedResource } from "./canonical.ts";
import { assessGhCommand } from "./gh-policy.ts";
import { maxRisk, riskRank, type RiskClass } from "./types.ts";

type ShellToken = {
	value: string;
	quoted: boolean;
};

type BashAssessment = {
	floor: RiskClass;
	hardDeny: boolean;
	reason: string;
};

const LOW = (reason: string) => ({ floor: "low" as const, hardDeny: false, reason });
const MEDIUM = (reason: string) => ({ floor: "medium" as const, hardDeny: false, reason });
const HIGH = (reason: string, hardDeny = false) => ({ floor: "high" as const, hardDeny, reason });

function tokenize(command: string) {
	const segments: ShellToken[][] = [];
	let tokens: ShellToken[] = [];
	let value = "";
	let quoted = false;
	let quote: "'" | '"' | undefined;

	const pushToken = () => {
		if (value === "") return;
		tokens.push({ value, quoted });
		value = "";
		quoted = false;
	};
	const endSegment = () => {
		pushToken();
		if (tokens.length > 0) segments.push(tokens);
		tokens = [];
	};

	if (/`|\$\(|<\(/.test(command)) return { segments, error: "Command or process substitution cannot be classified safely." };
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index]!;
		if (quote) {
			if (character === quote) {
				quote = undefined;
				continue;
			}
			if (character === "\\" && quote === '"') {
				const escaped = command[index + 1];
				if (escaped === undefined) return { segments, error: "Unterminated escape sequence cannot be classified safely." };
				value += escaped;
				index += 1;
				continue;
			}
			value += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			quoted = true;
			continue;
		}
		if (character === "\\") {
			const escaped = command[index + 1];
			if (escaped === undefined) return { segments, error: "Unterminated escape sequence cannot be classified safely." };
			value += escaped;
			index += 1;
			continue;
		}
		if (/\s/.test(character)) {
			pushToken();
			continue;
		}
		if (character === ";" || character === "\n") {
			endSegment();
			continue;
		}
		if (character === "|") {
			endSegment();
			if (command[index + 1] === "|") index += 1;
			continue;
		}
		if (character === "&") {
			if (command[index + 1] !== "&") return { segments, error: "Background shell operators cannot be classified safely." };
			endSegment();
			index += 1;
			continue;
		}
		if (character === ">" || character === "<") {
			pushToken();
			if (character === "<" && command[index + 1] === "<") return { segments, error: "Here documents cannot be classified safely." };
			if (character === ">" && command[index + 1] === ">") {
				tokens.push({ value: ">>", quoted: false });
				index += 1;
			} else {
				tokens.push({ value: character, quoted: false });
			}
			continue;
		}
		if (character === "(" || character === ")") return { segments, error: "Compound shell syntax cannot be classified safely." };
		value += character;
	}
	if (quote) return { segments, error: "Unterminated quoting cannot be classified safely." };
	endSegment();
	return { segments };
}


function referencesProtectedData(token: string) {
	const normalized = token.replace(/\\/g, "/").toLowerCase();
	const leaf = basename(normalized);
	return /(?:^|\/)(?:\.ssh(?:\/|$)|\.aws(?:\/|$)|\.kube\/config(?:$|\/)|\.gnupg(?:\/|$)|\.env(?:\.|$|[*?\[\]{}]))/.test(normalized) ||
		/(?:^|\/)[^/]*\.env(?:\.|$|[*?\[\]{}])/.test(normalized) ||
		leaf === ".env" ||
		leaf.startsWith(".env.") ||
		["id_dsa", "id_ecdsa", "id_ed25519", "id_rsa"].includes(leaf) ||
		/\.(?:key|pem|p12|pfx|kdbx)$/i.test(leaf) ||
		[".netrc", ".npmrc", ".pypirc", "credentials", "credentials.json", "auth.json", "secrets.json"].includes(leaf) ||
		normalized.endsWith("/.pi/agent/auth.json") ||
		normalized.endsWith("/.pi/agent/models-store.json") ||
		normalized.endsWith("/.config/gcloud/application_default_credentials.json");
}

function publicHttpUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return false;
		if (url.username || url.password) return false;
		const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
		const privateIpv4 = /^(?:0|10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
			/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) ||
			/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
			/^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
		const mappedPrivateIpv4 = host.startsWith("::ffff:") && /^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(host.slice("::ffff:".length));
		return host !== "localhost" &&
			!host.endsWith(".localhost") &&
			!privateIpv4 &&
			!mappedPrivateIpv4 &&
			host !== "::1" &&
			!(/^fe[89ab][\da-f]*:/i.test(host)) &&
			!(/^f[cd][\da-f]*:/i.test(host));
	} catch {
		return false;
	}
}

function carriesCredential(tokens: ShellToken[], command: string) {
	return tokens.some((token, index) => {
		const value = token.value;
		if (/^(?:--)?(?:access[-_]?key|api[-_]?key|authorization|client[-_]?key|cookie|credential|kubeconfig|netrc(?:-file)?|oauth2-bearer|password|secret|token|user(?:name)?|cert|key)(?:=|$)/i.test(value)) return true;
		if (/^-b(?:.|$)|^-E(?:.|$)/.test(value)) return true;
		if (/^(?:gh_token|github_token|gh_enterprise_token|github_enterprise_token)=/i.test(value)) return true;
		if (/^(?:aws_|azure_|gcp_)?(?:access[-_]?key|api[-_]?key|client[-_]?key|password|secret|token)=/i.test(value)) return true;
		if (value === "-u" || value.startsWith("-u") || value.startsWith("--user=")) return true;
		if (value === "-i" || value.startsWith("-i")) return command !== "rg";
		if (value === "-H" || value === "--header") return /\b(?:authorization|cookie|token|api[-_]?key|secret|password|credential)\b/i.test(tokens[index + 1]?.value ?? "");
		return /^(?:authorization:|bearer\s+)/i.test(value);
	});
}

function isGcloudInventory(args: string[]) {
	return args[0] === "projects" && args[1] === "list" ||
		args[0] === "compute" && args[1] === "instances" && args[2] === "list";
}

function isAzureInventory(args: string[]) {
	return args[0] === "account" && args[1] === "show" || args[1] === "list";
}

function combine(left: BashAssessment, right: BashAssessment) {
	const floor = maxRisk(left.floor, right.floor);
	return {
		floor,
		hardDeny: left.hardDeny || right.hardDeny,
		reason: riskRank(right.floor) >= riskRank(left.floor) ? right.reason : left.reason,
	};
}

function stripTransparentPrefix(tokens: ShellToken[]) {
	let index = 0;
	while (index < tokens.length) {
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]!.value)) {
			index += 1;
			continue;
		}
		const wrapper = tokens[index]!.value;
		if (wrapper !== "command" && wrapper !== "env" && wrapper !== "time") break;
		index += 1;
		while (tokens[index]?.value.startsWith("-")) {
			const option = tokens[index]!.value;
			index += 1;
			if ((wrapper === "env" && ["-u", "--unset"].includes(option)) || (wrapper === "time" && option === "-f")) index += 1;
		}
	}
	return tokens.slice(index);
}

async function assessRedirections(tokens: ShellToken[], cwd: string) {
	let floor: RiskClass = "low";
	let hasRedirection = false;
	for (let index = 0; index < tokens.length; index += 1) {
		const operator = tokens[index]!.value;
		if (operator !== ">" && operator !== ">>" && operator !== "<") continue;
		hasRedirection = true;
		const target = tokens[index + 1];
		if (!target) return HIGH("Incomplete redirection cannot be classified safely.");
		if (target.value.startsWith("/dev/")) return HIGH("Device redirection is outside the permission gate's authority.", true);
		try {
			const resource = await canonicalizePath(target.value, cwd);
			if (isProtectedResource(resource)) return HIGH("Protected redirect targets are outside the permission gate's authority.", true);
		} catch {
			return HIGH("Ambiguous, symlinked, or out-of-workspace redirection targets are denied.", true);
		}
		if (operator !== "<") floor = "medium";
		index += 1;
	}
	if (!hasRedirection) return;
	return floor === "medium" ? MEDIUM("Output redirection has bounded local side effects.") : LOW("Input redirection is read-only.");
}

async function assessWorkspaceDownload(destination: string | undefined, cwd: string) {
	if (!destination || destination.startsWith("-")) return HIGH("Cloud downloads require a literal workspace file target.");
	try {
		const resource = await canonicalizePath(destination, cwd);
		if (isProtectedResource(resource)) return HIGH("Protected download targets are outside the permission gate's authority.", true);
		if (resource.exists && !resource.isFile) return HIGH("Cloud downloads require a regular workspace file target.");
		return MEDIUM("Cloud download to a workspace file is bounded.");
	} catch {
		return HIGH("Ambiguous, symlinked, or out-of-workspace download targets are denied.", true);
	}
}

function hasDockerPrivilegeOrHostMount(args: string[]) {
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index]!;
		if (argument === "--privileged") return true;
		let spec: string | undefined;
		let mountSyntax = false;
		if (argument === "-v" || argument === "--volume") {
			spec = args[index + 1];
			index += 1;
		} else if (argument.startsWith("-v") && argument !== "--version") {
			spec = argument.slice(2).replace(/^=/, "");
		} else if (argument.startsWith("--volume=")) {
			spec = argument.slice("--volume=".length);
		} else if (argument === "--mount") {
			spec = args[index + 1];
			mountSyntax = true;
			index += 1;
		} else if (argument.startsWith("--mount=")) {
			spec = argument.slice("--mount=".length);
			mountSyntax = true;
		} else {
			continue;
		}
		if (!spec) return true;
		if (mountSyntax) {
			if (/(?:^|,)type=volume(?:,|$)/.test(spec)) continue;
			return true;
		}
		const source = spec.split(":", 1)[0]!;
		if (source.startsWith("/") || source.startsWith(".") || source.startsWith("~") || source.includes("..")) return true;
	}
	return false;
}

function destructiveCommand(command: string, args: string[]) {
	if (["rm", "rmdir", "unlink"].includes(command) && args.some((argument) => /^-[\w]*[rfR]/.test(argument) || argument === "--force" || argument === "--recursive" || argument.startsWith("--force=") || argument.startsWith("--recursive="))) {
		return HIGH("Recursive or forced deletion is outside the permission gate's authority.", true);
	}
	if (command === "find" && args.includes("-delete")) {
		return HIGH("Destructive find actions are outside the permission gate's authority.", true);
	}
	if (command === "dd" && args.some((argument) => /^of=\/dev\//.test(argument))) return HIGH("Device writes are outside the permission gate's authority.", true);
	if (command === "mkfs" || command.startsWith("mkfs.") || (command === "diskutil" && args[0] === "erase")) {
		return HIGH("Filesystem formatting is outside the permission gate's authority.", true);
	}
	if (
		command === "git" &&
		(
			args[0] === "clean" ||
			(args[0] === "reset" && args.includes("--hard")) ||
			args[0] === "restore" ||
			args[0] === "checkout" ||
			(args[0] === "switch" && !args.includes("-c"))
		)
	) {
		return HIGH("Git operations that can discard work are outside the permission gate's authority.", true);
	}
	if (command === "docker" && (args[0] === "prune" || (args[0] === "compose" && args[1] === "down" && args.some((argument) => argument === "-v" || argument === "--volumes")))) {
		return HIGH("Docker pruning and volume deletion are outside the permission gate's authority.", true);
	}
	if (["psql", "mysql", "sqlite3"].includes(command) && args.some((argument) => /\b(?:delete|drop|truncate|flush)\b/i.test(argument))) {
		return HIGH("Destructive database commands are outside the permission gate's authority.", true);
	}
}

const RIPGREP_SAFE_OPTIONS: Record<string, true> = {
	"-n": true,
	"--line-number": true,
	"-i": true,
	"--ignore-case": true,
	"-F": true,
	"--fixed-strings": true,
	"-l": true,
	"--files-with-matches": true,
	"--files-without-match": true,
	"-c": true,
	"--count": true,
	"--count-matches": true,
	"--no-heading": true,
	"--heading": true,
};
const RIPGREP_VALUE_OPTIONS: Record<string, true> = {
	"-e": true,
	"--regexp": true,
	"-g": true,
	"--glob": true,
	"--iglob": true,
	"--type": true,
	"--type-not": true,
};
const RIPGREP_UNSAFE_OPTIONS: Record<string, true> = {
	"-u": true,
	"-uu": true,
	"-uuu": true,
	"--unrestricted": true,
	"--hidden": true,
	"--no-ignore": true,
	"--no-ignore-vcs": true,
	"--no-ignore-global": true,
	"--no-ignore-dot": true,
	"--follow": true,
	"-L": true,
	"--pre": true,
	"--pre-glob": true,
};

const SORT_SIDE_EFFECT_OPTIONS: Record<string, true> = {
	"-o": true,
	"--output": true,
	"--compress-program": true,
};

function assessSort(args: string[]) {
	for (const argument of args) {
		const separator = argument.indexOf("=");
		const option = separator >= 0 ? argument.slice(0, separator) : argument.startsWith("-o") ? "-o" : argument;
		if (SORT_SIDE_EFFECT_OPTIONS[option]) return HIGH("Sort output and compressor options are High risk.");
	}
	return LOW("Local sorting is read-only.");
}

async function assessRipgrep(tokens: ShellToken[], cwd: string) {
	let patternSeen = false;
	let optionsEnded = false;
	const searchPaths: string[] = [];

	for (let index = 1; index < tokens.length; index += 1) {
		const value = tokens[index]!.value;
		if (!optionsEnded && value === "--") {
			optionsEnded = true;
			continue;
		}
		if (!optionsEnded && value.startsWith("-") && value !== "-") {
			const separator = value.indexOf("=");
			const option = separator >= 0 ? value.slice(0, separator) : value;
			const inlineValue = separator >= 0 ? value.slice(separator + 1) : undefined;
			if (RIPGREP_UNSAFE_OPTIONS[option]) return HIGH("Ripgrep options that traverse hidden or symlinked files are High risk.");
			if (RIPGREP_SAFE_OPTIONS[option]) {
				if (inlineValue !== undefined) return HIGH("Ripgrep inspection options do not accept inline values.");
				continue;
			}
			if (RIPGREP_VALUE_OPTIONS[option]) {
				const optionValue = inlineValue ?? tokens[index + 1]?.value;
				if (optionValue === undefined) return HIGH("Ripgrep value options require literal values.");
				if (inlineValue === undefined) index += 1;
				if ((option === "-g" || option === "--glob" || option === "--iglob") && isProtectedPathPattern(optionValue)) {
					return HIGH("Protected ripgrep glob filters are outside the permission gate's authority.", true);
				}
				continue;
			}
			return HIGH("Only bounded ripgrep inspection options are supported.");
		}
		if (!patternSeen) {
			if (value === "-") return HIGH("Ripgrep stdin reads are outside the permission gate's authority.");
			patternSeen = true;
			continue;
		}
		searchPaths.push(value);
	}

	if (!patternSeen) return HIGH("Ripgrep requires a literal search pattern.");
	for (const path of searchPaths) {
		if (path === "-") return HIGH("Ripgrep stdin reads are outside the permission gate's authority.");
		try {
			const resource = await canonicalizePath(path, cwd);
			if (isProtectedResource(resource)) return HIGH("Protected ripgrep search paths are outside the permission gate's authority.", true);
		} catch {
			return HIGH("Ambiguous, symlinked, or out-of-workspace ripgrep paths are denied.", true);
		}
	}
	return LOW("Ripgrep inspection is read-only.");
}



function nestedCommand(tokens: ShellToken[]) {
	const text = tokens.map((token) => token.value).join(" ").trim();
	return text === "" ? undefined : text;
}

async function assessNestedCommand(tokens: ShellToken[], cwd: string, outer: BashAssessment) {
	const command = nestedCommand(tokens);
	if (!command || tokens.some((token) => /[$`]/.test(token.value))) return HIGH("Non-literal nested shell commands cannot be classified safely.");
	const nested = await assessBashCommand(command, cwd);
	return combine(outer, nested);
}

async function classifyCommand(tokens: ShellToken[], cwd: string): Promise<BashAssessment> {
	const executableTokens = stripTransparentPrefix(tokens);
	if (executableTokens.length === 0) return HIGH("An empty shell segment cannot be classified safely.");
	const executable = executableTokens[0]!.value;
	const command = basename(executable);
	const args = executableTokens.slice(1).map((token) => token.value);
	const findActionIndex = command === "find" ? args.findIndex((argument) => ["-exec", "-execdir", "-ok", "-okdir"].includes(argument)) : -1;
	const dynamicToken = executableTokens.some((token) =>
		/[$`]|[*?\[\]{}]/.test(token.value) &&
		!(findActionIndex >= 0 && token.value === "{}") &&
		!(command === "rg" && token.quoted && !/[$`]/.test(token.value))
	);
	if (dynamicToken) return HIGH("Dynamic shell expansion cannot be classified safely.");
	if (executableTokens.some((token) => referencesProtectedData(token.value))) return HIGH("Direct protected-data access is denied.", true);
	const redirects = await assessRedirections(executableTokens, cwd);
	if (redirects?.hardDeny) return redirects;
	if (carriesCredential(tokens, command) && !(command === "gh" && args[0] === "auth" && args[1] === "token")) return HIGH("Credential-bearing command arguments are High risk.");
	if (findActionIndex >= 0) {
		const nestedTokens = executableTokens.slice(findActionIndex + 2).filter((token) => token.value !== "{}" && token.value !== ";");
		return combine(HIGH("Find execution actions cannot be classified safely."), await classifyCommand(nestedTokens, cwd));
	}
	const destructive = destructiveCommand(command, args);
	if (destructive) return destructive;
	if (/[\\/]/.test(executable)) return HIGH("Path-qualified executables cannot be classified safely.");

	let classified: BashAssessment;
	if (["sh", "bash"].includes(command) && args.includes("-c")) {
		const payload = executableTokens[args.indexOf("-c") + 2];
		classified = payload
			? combine(MEDIUM("Literal shell payload is classified recursively."), await assessBashCommand(payload.value, cwd))
			: HIGH("Shell -c requires a literal command payload.");
	} else if (["eval", "source", ".", "xargs"].includes(command) || (args.includes("-c") && ["node", "python", "python3", "ruby", "perl", "php", "lua"].includes(command)) || (args.includes("-e") && ["node", "ruby", "perl", "php", "lua"].includes(command))) {
		classified = HIGH("Dynamic command evaluation cannot be classified safely.");
	} else if (command === "sudo") {
		classified = HIGH("Privilege escalation is High risk.");
	} else if (command === "ssh") {
		let hostIndex = 0;
		while (hostIndex < args.length && args[hostIndex]!.startsWith("-")) {
			const option = args[hostIndex]!;
			const optionValue = option === "-o" ? args[hostIndex + 1] : option.startsWith("-o") ? option.slice(2) : undefined;
			if (optionValue && /^(?:proxycommand|localcommand|remotecommand|match)=/i.test(optionValue)) {
				const payload = optionValue.slice(optionValue.indexOf("=") + 1);
				return combine(MEDIUM("SSH command options are classified recursively."), await assessBashCommand(payload, cwd));
			}
			if (option === "-F" || option.startsWith("-F")) return HIGH("SSH configuration files are outside the permission gate's authority.", true);
			hostIndex += ["-p", "-i", "-l", "-o"].includes(option) ? 2 : 1;
		}
		const remoteTokens = executableTokens.slice(hostIndex + 2);
		const remote = await assessNestedCommand(remoteTokens, cwd, MEDIUM("A proven read-only remote SSH command remains a bounded external operation."));
		const structuredRemoteTokens = stripTransparentPrefix(remoteTokens);
		classified = ["sh", "bash"].includes(basename(structuredRemoteTokens[0]?.value ?? ""))
			? combine(remote, await classifyCommand(remoteTokens, cwd))
			: remote;
	} else if (command === "scp") {
		const source = args.at(-2);
		const destination = args.at(-1);
		classified = source?.includes(":") && destination && !destination.includes(":")
			? await assessWorkspaceDownload(destination, cwd)
			: HIGH("SCP uploads and ambiguous transfers are High risk.");
	} else if (["curl", "wget"].includes(command)) {
		const mutating = args.some((argument, index) => {
			if (["-d", "--data", "--data-raw", "-F", "--form", "-T", "--upload-file", "--post-data", "--post-file"].includes(argument)) return true;
			if (/^(?:-d|-F|-T|--data(?:-raw)?=|--form=|--upload-file=|--post-(?:data|file)=)/.test(argument)) return true;
			const method = argument === "-X" || argument === "--request"
				? args[index + 1]
				: argument.startsWith("-X") ? argument.slice(2) : argument.startsWith("--request=") ? argument.slice("--request=".length) : undefined;
			return method !== undefined && !["GET", "HEAD"].includes(method.toUpperCase());
		});
		const url = args.find((argument) => /^https?:\/\//i.test(argument));
		classified = mutating ? HIGH("HTTP mutations are High risk.") : url && publicHttpUrl(url)
			? MEDIUM("Public HTTP GET and HEAD requests are bounded external operations.")
			: HIGH("Only literal public HTTP GET and HEAD requests are supported.");
	} else if (command === "git") {
		const subcommand = args[0];
		classified = ["status", "diff", "log", "show", "grep"].includes(subcommand ?? "") || (subcommand === "branch" && args.includes("--show-current")) || subcommand === "fetch"
			? LOW("Git inspection and fetch operations are read-only.")
			: ["add", "commit", "switch", "rebase", "tag"].includes(subcommand ?? "") || (subcommand === "pull" && args.includes("--ff-only")) || (subcommand === "reset" && args.includes("--soft"))
				? MEDIUM("Local Git changes preserve work or are bounded.")
				: HIGH("Git writes and unknown subcommands are High risk.");
	} else if (command === "kubectl") {
		const subcommand = args[0];
		if (subcommand === "exec") {
			const separator = args.indexOf("--");
			classified = separator < 0
				? HIGH("Kubectl exec requires a literal nested command.")
				: combine(MEDIUM("Kubectl exec is a bounded remote operation when its nested command is proven safe."), await classifyCommand(executableTokens.slice(separator + 2), cwd));
		} else if (subcommand === "config" && ["current-context", "get-contexts"].includes(args[1] ?? "")) {
			classified = LOW("Kubernetes context queries are read-only.");
		} else if (args.some((argument) => /^(?:secrets?)(?:\/|$)/.test(argument)) || subcommand === "config") {
			classified = HIGH("Kubernetes credential and secret access is High risk.");
		} else if (["get", "describe", "logs", "diff", "version"].includes(subcommand ?? "") || (subcommand === "auth" && args[1] === "can-i")) {
			classified = LOW("Known Kubernetes inventory commands are read-only.");
		} else if (subcommand === "port-forward") {
			classified = MEDIUM("Kubectl port forwarding is a bounded external operation.");
		} else {
			classified = HIGH("Kubernetes mutations and unknown subcommands are High risk.");
		}
	} else if (command === "helm") {
		const subcommand = args[0];
		classified = ["list", "status", "template", "lint", "diff", "version"].includes(subcommand ?? "")
			? LOW("Known Helm inspection commands are read-only.")
			: ["repo", "dependency"].includes(subcommand ?? "")
				? MEDIUM("Helm repository and dependency changes are bounded.")
				: HIGH("Helm values, mutations, and unknown subcommands are High risk.");
	} else if (command === "kops") {
		classified = ["get", "validate"].includes(args[0] ?? "") ? LOW("Kops inventory commands are read-only.") : HIGH("Kops mutations and unknown subcommands are High risk.");
	} else if (command === "docker") {
		const subcommand = args[0];
		if (subcommand === "exec") {
			let containerIndex = 1;
			while (args[containerIndex]?.startsWith("-")) containerIndex += 1;
			classified = combine(MEDIUM("Docker exec is bounded only when its nested command is proven safe."), await classifyCommand(executableTokens.slice(containerIndex + 2), cwd));
		} else if (subcommand === "compose") {
			classified = ["config", "ps"].includes(args[1] ?? "") ? LOW("Docker Compose inspection is read-only.") : args[1] === "up" ? MEDIUM("Docker Compose startup is a bounded local effect.") : HIGH("Docker Compose mutations are High risk.");
		} else if (["version", "info", "ps", "images", "inspect", "logs", "stats"].includes(subcommand ?? "")) {
			classified = LOW("Docker daemon inspection is read-only.");
		} else if (["build", "pull", "run", "stop"].includes(subcommand ?? "")) {
			classified = hasDockerPrivilegeOrHostMount(args)
				? HIGH("Privileged Docker execution and host mounts are High risk.")
				: MEDIUM("Bounded Docker lifecycle operations are Medium risk.");
		} else {
			classified = HIGH("Docker writes and unknown subcommands are High risk.");
		}
	} else if (["terraform", "tofu", "opentofu", "terragrunt"].includes(command)) {
		const subcommand = args[0];
		classified = ["plan", "init", "import"].includes(subcommand ?? "") || (subcommand === "state" && ["rm", "mv"].includes(args[1] ?? ""))
			? MEDIUM("Terraform planning and bounded state changes are Medium risk.")
			: ["apply", "destroy"].includes(subcommand ?? "") || (subcommand === "output" && args.some((argument) => argument === "-raw" || argument === "--raw"))
				? HIGH("Terraform apply, destroy, and sensitive output are High risk.")
				: HIGH("Unknown Terraform subcommands are High risk.");
	} else if (command === "aws") {
		const [service, operation] = args;
		if (service === "sts" && operation === "get-caller-identity" || service === "s3" && operation === "ls" || operation?.startsWith("describe-")) {
			classified = LOW("Known cloud inventory commands are read-only.");
		} else if (service === "s3" && operation === "cp" && args.at(-2)?.startsWith("s3://")) {
			classified = await assessWorkspaceDownload(args.at(-1), cwd);
		} else {
			classified = HIGH("Cloud secrets, mutations, and unknown commands are High risk.");
		}
	} else if (command === "gcloud") {
		classified = args.includes("secrets") || args.includes("key")
			? HIGH("Cloud credential access is High risk.")
			: isGcloudInventory(args)
				? LOW("Known gcloud inventory commands are read-only.")
				: HIGH("Cloud mutations and unknown commands are High risk.");
	} else if (command === "az") {
		classified = args.includes("keyvault")
			? HIGH("Key Vault access is High risk.")
			: isAzureInventory(args)
				? LOW("Known Azure inventory commands are read-only.")
				: HIGH("Azure mutations and unknown commands are High risk.");
	} else if (command === "gh") {
		classified = await assessGhCommand(args, cwd);
	} else if (command === "npm") {
		classified = ["view", "outdated", "audit"].includes(args[0] ?? "") ? LOW("Package metadata inspection is read-only.") : args[0] === "test" || args[0] === "ci" || args[0] === "install" || args[0] === "update" || args[0] === "run" && args[1] === "build" ? MEDIUM("Known test, build, and dependency operations are bounded.") : HIGH("Unknown project scripts are High risk.");
	} else if (command === "pnpm") {
		classified = args[0] === "list" ? LOW("Package inventory is read-only.") : args[0] === "install" && args.includes("--frozen-lockfile") ? MEDIUM("Frozen dependency installation is bounded.") : HIGH("Unknown pnpm operations are High risk.");
	} else if (command === "yarn") {
		classified = args[0] === "why" ? LOW("Package dependency inspection is read-only.") : HIGH("Unknown yarn operations are High risk.");
	} else if (command === "pip") {
		classified = args[0] === "list" ? LOW("Package inventory is read-only.") : args[0] === "install" ? MEDIUM("Dependency installation is a bounded effect.") : HIGH("Unknown pip operations are High risk.");
	} else if (command === "brew") {
		classified = args[0] === "list" ? LOW("Package inventory is read-only.") : args[0] === "install" ? MEDIUM("Dependency installation is a bounded effect.") : HIGH("Unknown brew operations are High risk.");
	} else if (["cargo"].includes(command)) {
		classified = ["check", "test", "build", "install"].includes(args[0] ?? "") ? MEDIUM("Cargo build and installation operations are bounded.") : HIGH("Unknown Cargo operations are High risk.");
	} else if (command === "go") {
		classified = args[0] === "test" || args[0] === "build" ? MEDIUM("Go tests and builds are bounded.") : HIGH("Unknown Go operations are High risk.");
	} else if (command === "tar") {
		classified = args.includes("-tf") || args.includes("--list") ? LOW("Archive listing is read-only.") : args.includes("--extract") || args.some((argument) => /^-[\w]*x/.test(argument)) ? MEDIUM("Archive extraction is a bounded local effect.") : HIGH("Unknown tar operations are High risk.");
	} else if (command === "sed") {
		const [option, script, ...remaining] = args;
		classified = option === "-n" && remaining.length === 0 && /^\d+(?:,\d+)?p$/.test(script ?? "")
			? LOW("A bounded sed print filter is read-only.")
			: HIGH("Only a literal bounded sed print filter is supported.");
	} else if (command === "rg") {
		classified = await assessRipgrep(executableTokens, cwd);
	} else if (command === "sort") {
		classified = assessSort(args);
	} else if (["pwd", "ls", "find", "cat", "wc", "du", "ps", "whoami", "uname", "echo", "printf", "true"].includes(command)) {
		classified = LOW("Local inspection is read-only.");
	} else if (args.length === 1 && ["--version", "-V", "-v", "version"].includes(args[0]!)) {
		classified = LOW("Tool version reporting is read-only.");
	} else {
		classified = HIGH("Unknown commands and subcommands are High risk.");
	}
	return redirects ? combine(classified, redirects) : classified;
}

export async function assessBashCommand(command: string, cwd: string) {
	const parsed = tokenize(command);
	if (parsed.error) return HIGH(parsed.error);
	if (parsed.segments.length === 0) return HIGH("An empty shell command cannot be classified safely.");
	let result = LOW("All shell segments are read-only.");
	for (const segment of parsed.segments) result = combine(result, await classifyCommand(segment, cwd));
	return result;
}
