import { otel } from "eve/instrumentation/otel";

// Keep a record of every question, the catalogue searches askBert ran and what they returned
// (Albert, 2026-09-28). Staff sessions are "private", which by default records metadata only;
// this opts in to content. Results include staff pricing, so traces are staff data: they stay in
// the Vercel team. The access token is stripped (agent-runs.ts). View them in Vercel →
// Observability → Agent Runs.
export default otel({
  tracePolicy: () => ({ emit: true, recordInputs: true, recordOutputs: true }),
});
