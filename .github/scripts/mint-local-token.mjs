// askBert evals only: mint a short-lived "authenticated" JWT for the throwaway local Supabase
// stack in CI, signed with that stack's public default HS256 secret (never a real project).
import { createHmac, randomUUID } from "node:crypto";
const secret = process.env.JWT_SECRET;
if (!secret) { console.error("JWT_SECRET missing"); process.exit(1); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: "HS256", typ: "JWT" });
const body = b64({ sub: randomUUID(), role: "authenticated", aud: "authenticated", email: "evals@askbert.local", iat: now, exp: now + 3600 });
const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
process.stdout.write(`${head}.${body}.${sig}`);
