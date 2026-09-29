import { agentRuns } from "eve/instrumentation/otel";

// Agent Runs keeps questions, searches and results (instrumentation/otel.ts), but never the
// staff member's access token that route auth hands to the catalogue tool.
export default agentRuns({
  exportPolicy: {
    attribute: ({ key }) => (key.toLowerCase().includes("access_token") ? { emit: false } : { emit: true }),
  },
});
