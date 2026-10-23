/** Stock status as a small flag, in the brand palette. Blank status = not confirmed = no flag. */
export function StockBadge({ status, comingSoon }: { status: string | null; comingSoon: boolean }) {
  if (comingSoon) return <span className="rounded-md bg-sky px-2 py-0.5 text-[11px] font-semibold text-denim">Coming soon</span>;
  if (!status) return null;
  const tone: Record<string, string> = {
    "In stock": "bg-sky text-denim",
    "Low stock": "bg-peach text-campfire-dark",
    "Special order": "bg-cream-deep text-ink",
    Discontinued: "bg-ink text-cream",
    Clearance: "bg-campfire-dark text-cream",
  };
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone[status] ?? "bg-cream-deep text-ink"}`}>{status}</span>;
}
