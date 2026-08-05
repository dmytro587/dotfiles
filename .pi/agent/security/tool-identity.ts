const TOOL_NORMALIZATIONS: Record<string, string> = {
	ffgrep: "grep",
	fffind: "find",
};

export function canonicalToolName(toolName: string) {
	const unqualified = toolName.startsWith("functions.") ? toolName.slice("functions.".length) : toolName;
	return TOOL_NORMALIZATIONS[unqualified] ?? unqualified;
}
