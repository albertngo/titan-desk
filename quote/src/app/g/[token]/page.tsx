import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { timeOf } from "@/lib/companycam/photos";
import { loadGallery } from "@/lib/gallery/load";

/**
 * Job photos for an installer (2026-11-25), opened from their Project Week page. Customer deployment only. Every photo
 * on the job's CompanyCam project, newest day first, each with its description and time; tap one for full size.
 */

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Job photos · Titan Flooring" },
  description: "Job photos from Titan Flooring.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await loadGallery(token);
  if (!g) notFound();
  if (g === "error") {
    return (
      <main className="gal">
        <header className="gal-head">
          <div className="cq-logo">Titan Flooring</div>
          <h1>Job photos</h1>
          <p className="muted">The photos didn&apos;t load. Try again in a minute.</p>
        </header>
      </main>
    );
  }
  return (
    <main className="gal">
      <header className="gal-head">
        <div className="cq-logo">Titan Flooring</div>
        <h1>{g.project.address ?? g.project.name ?? "Job photos"}</h1>
        <p className="muted">
          {g.count} photo{g.count === 1 ? "" : "s"}. Tap a photo to open it full size.
        </p>
      </header>
      {g.count === 0 && <p className="gal-empty muted">No photos on this job yet.</p>}
      {g.days.map((d) => (
        <section key={d.day || "unknown"} className="gal-day">
          <h2>{d.label}</h2>
          <ul className="gal-grid">
            {d.photos.map((p) => (
              <li key={p.id} className="gal-item">
                <a href={p.full} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- CompanyCam's own image address, read fresh each open */}
                  <img src={p.thumb} alt={p.description ?? "Job photo"} loading="lazy" referrerPolicy="no-referrer" />
                </a>
                {p.description && <p className="gal-desc">{p.description}</p>}
                {p.at && <p className="gal-time faint">{timeOf(p.at)}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {g.more && <p className="gal-empty muted">This job has more photos than this page shows. Ask the office for the rest.</p>}
    </main>
  );
}
