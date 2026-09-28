import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { supabaseStaff } from "../lib/auth";

// Signed-in staff only. localDev() admits nobody outside `eve dev` / `vercel dev`, and there is
// deliberately no none(): an unrecognised caller gets 401.
export default eveChannel({
  auth: [supabaseStaff(), localDev()],
});
