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
  /** Quote Origin and the contact's own Source (2026-10-27): replaced by the pick unless already an exact option. */
  origin?: string | null;
  source?: string | null;
};

export type GhlOpportunity = {
  id: string;
  name: string | null;
  status: string | null;
  pipelineId: string | null;
  stageId: string | null;
  updatedAt: string | null;
  /** When it was last opened, won, lost or abandoned. */
  statusChangedAt: string | null;
  /** Its CompanyCam URL: set once the job's folder and CompanyCam project were made. */
  companyCamUrl: string | null;
  /** Its Project Address, to tell two jobs of one customer apart. */
  siteAddress: string | null;
  /** Its Source (2026-10-27): replaced by the picked origin unless it is already one of the exact options. */
  source?: string | null;
};

/** One of a contact's conversations in GHL; its messages come separately (src/lib/conversation/thread.ts). */
export type GhlConversation = { id: string; lastMessageAt: string | null };

/** One opportunity's site, from its Project Address / Project City custom fields. */
export type GhlSite = { address: string | null; city: string | null };

export type GhlPipeline = { id: string; name: string; stages: { id: string; name: string }[] };
