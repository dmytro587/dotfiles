import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { contentText } from "@earendil-works/pi-ai";
import { isRiskClass, type RiskJudgment } from "./types.ts";

const SYSTEM_PROMPT = "You are a security risk classifier. Classify only the described Pi tool operation as low, medium, or high risk. Consider side effects, scope, reversibility, credentials, privilege, network access, and untrusted code. Return only JSON: {\"risk\":\"low|medium|high\",\"reason\":\"concise rationale\"}.";

function parseJudgment(value: string): RiskJudgment | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		const { risk, reason } = parsed as { risk?: unknown; reason?: unknown };
		if (!isRiskClass(risk) || typeof reason !== "string" || reason.trim() === "" || reason.length > 1_000) return undefined;
		return { risk, reason };
	} catch {
		return undefined;
	}
}

export async function judgeHighRisk(ctx: ExtensionContext, operation: string): Promise<RiskJudgment | undefined> {
	if (!ctx.model) return undefined;
	const provider = ctx.modelRegistry.getProvider(ctx.model.provider);
	if (!provider) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) return undefined;
	const response = await provider.streamSimple(ctx.model, {
		systemPrompt: SYSTEM_PROMPT,
		messages: [{ role: "user", content: operation }],
	}, {
		apiKey: auth.apiKey,
		headers: auth.headers,
		env: auth.env,
		maxTokens: 150,
		temperature: 0,
		maxRetries: 0,
		signal: ctx.signal,
	}).result();
	return parseJudgment(contentText(response.content));
}
