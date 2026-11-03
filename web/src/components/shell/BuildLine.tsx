import { builtLabel, commitUrl, currentBuild, prUrl } from "@/lib/build";

/**
 * The thin line at the top of the denim bar saying which build is running (Albert, 2026-11-03): the PR
 * it merged and its title, when it was built (Toronto time) and the commit, each linking to GitHub.
 * The values are inlined at build time (next.config.ts), so a page the service worker kept from an
 * older build shows that older build here.
 */
export function BuildLine() {
  const b = currentBuild();
  if (!b) return null;
  const pr = prUrl(b);
  const commit = commitUrl(b);
  const when = builtLabel(b.builtAt);
  const link = "rounded underline-offset-2 hover:text-cream hover:underline focus-visible:outline-2 focus-visible:outline-cream";
  return (
    <div aria-label="App version" className="bg-denim-dark text-[11px] leading-5 text-sky/90">
      <div className="mx-auto flex max-w-5xl items-center gap-1.5 overflow-hidden whitespace-nowrap px-4 sm:px-6">
        <span className="text-sky/70">Running</span>
        {pr && (
          <a href={pr} target="_blank" rel="noreferrer" className={`shrink-0 font-medium text-cream ${link}`}>
            PR #{b.pr}
          </a>
        )}
        {b.title && (
          <span className="min-w-0 truncate" title={b.title}>
            <span aria-hidden className="text-sky/50">· </span>
            {b.title}
          </span>
        )}
        {when && (
          <span className="shrink-0">
            <span aria-hidden className="text-sky/50">· </span>
            <span className="text-sky/70">updated</span>{" "}
            <time dateTime={b.builtAt} suppressHydrationWarning>{when}</time>
          </span>
        )}
        {commit && (
          <a href={commit} target="_blank" rel="noreferrer" className={`ml-auto shrink-0 pl-2 font-mono text-sky/70 ${link}`}>
            {b.short}
          </a>
        )}
      </div>
    </div>
  );
}
