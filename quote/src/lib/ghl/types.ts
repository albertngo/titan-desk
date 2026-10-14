/** Shapes the app reads from GHL. Types only, safe to import anywhere. */

export type GhlContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
};

export type GhlOpportunity = {
  id: string;
  name: string | null;
  status: string | null;
  pipelineId: string | null;
  stageId: string | null;
  updatedAt: string | null;
};

export type GhlPipeline = { id: string; name: string; stages: { id: string; name: string }[] };
