import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { fetchPublicImage } from "./lib/safe-image.mjs";
import { ResearchResultSchema } from "./lib/result-schema.mjs";

const shortText = Type.String({ minLength: 1, maxLength: 2_000 });

const inspectProductImage = defineTool({
  name: "inspect_product_image",
  label: "Inspect product image",
  description: "Safely fetch the exact product image for a visual requirement check.",
  promptSnippet: "Inspect exact product images before treating a visual hard gate as verified",
  promptGuidelines: [
    "Use only the exact candidate image URL, never a generic or search-result substitute.",
    "If inspection fails, record the visual requirement as unknown instead of inferring it.",
  ],
  parameters: Type.Object({
    url: shortText,
    alt: Type.Union([shortText, Type.Null()]),
  }),
  async execute(_toolCallId, params) {
    try {
      const image = await fetchPublicImage(params.url);
      return {
        content: [
          { type: "text", text: `Exact product image inspected${params.alt ? `: ${params.alt}` : ""}.` },
          {
            type: "image",
            data: image.bytes.toString("base64"),
            mimeType: image.mimeType,
          },
        ],
        details: {
          url: params.url,
          alt: params.alt,
          inspected: true,
          mimeType: image.mimeType,
        },
      };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "The exact product image could not be safely inspected. Treat visual requirements as unknown.",
          },
        ],
        details: {
          url: params.url,
          alt: params.alt,
          inspected: false,
        },
      };
    }
  },
});

const requestGoodsClarification = defineTool({
  name: "request_goods_clarification",
  label: "Request goods clarification",
  description: "Ask the one user question required to resolve a winner-changing hard gate.",
  promptSnippet: "Ask one winner-changing clarification and terminate this turn",
  promptGuidelines: [
    "Use this only when an unanswered hard gate can change the winner.",
    "Ask exactly one concise question. Do not make assumptions while waiting for the answer.",
    "After this tool call, do not emit another assistant response in the same turn.",
  ],
  parameters: Type.Object({
    question: shortText,
    reason: shortText,
    suggestedAnswers: Type.Array(shortText, { maxItems: 4 }),
  }),
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: "Waiting for the user's clarification." }],
      details: params,
      terminate: true,
    };
  },
});

const submitGoodsResearch = defineTool({
  name: "submit_goods_research",
  label: "Submit goods research",
  description: "Submit the verified goods catalog as the final structured result.",
  promptSnippet: "Submit the final verified catalog and terminate this turn",
  promptGuidelines: [
    "Use this as the only final action after verification and ranking are complete.",
    "Do not include out-of-stock or unverified offers as candidates.",
    "Keep partial prices and unverified facts explicit instead of filling gaps.",
    "After this tool call, do not emit another assistant response in the same turn.",
  ],
  parameters: ResearchResultSchema,
  async execute(_toolCallId, params) {
    return {
      content: [{ type: "text", text: "Verified goods research submitted." }],
      details: params,
      terminate: true,
    };
  },
});

export default function (pi) {
  pi.registerTool(inspectProductImage);
  pi.registerTool(requestGoodsClarification);
  pi.registerTool(submitGoodsResearch);
}
