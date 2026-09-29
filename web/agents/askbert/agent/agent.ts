import { defineAgent } from "eve";

export default defineAgent({
  // Read-only: no bash, file, web, sub-agent or skill tools. askBert's only tool is
  // tools/query_catalogue.ts (a read-only catalogue search).
  defaultTools: false,
  // Claude Sonnet through the Vercel AI Gateway (project OIDC on Vercel; AI_GATEWAY_API_KEY locally).
  model: "anthropic/claude-sonnet-5",
  limits: {
    // Per-conversation cap on model cost (USD). Raise here if staff need longer chats.
    maxTokenCostUsdPerSession: 0.25,
    maxInputTokensPerSession: 200_000,
    // Counter questions are short-lived; a conversation expires after a day.
    sessionTimeoutMs: 24 * 60 * 60 * 1000,
  },
});
