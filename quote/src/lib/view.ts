import "server-only";
import { cookies } from "next/headers";
import { CUSTOMER_VIEW, VIEW_COOKIE } from "./viewMode";

/** Whether this device has Customer view on (see viewMode.ts). */
export async function customerView(): Promise<boolean> {
  return (await cookies()).get(VIEW_COOKIE)?.value === CUSTOMER_VIEW;
}
