import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import { getProduct } from "@/lib/db/queries";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const preferredRegion = "yul1";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return { title: decodeURIComponent(sku) };
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const supabase = await supabaseServer();
  const product = await getProduct(supabase, decodeURIComponent(sku));
  if (!product) return notFound();
  return <ProductDetail product={product} />;
}
