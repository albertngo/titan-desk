import { Suspense } from "react";
import { SearchView } from "@/components/SearchView";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-zinc-500">Loading…</p>}>
      <SearchView />
    </Suspense>
  );
}
