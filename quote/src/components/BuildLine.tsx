import { builtLabel, commitUrl, currentBuild, prUrl } from "@/lib/build";

/**
 * The line above the top bar saying which build is running (Albert, 2026-11-03): the PR it merged and
 * its title, when it was built (Toronto time) and the commit, each linking to GitHub. Staff only:
 * TopBar leaves it out in Customer view, and customer pages never draw TopBar.
 */
export function BuildLine() {
  const b = currentBuild();
  if (!b) return null;
  const pr = prUrl(b);
  const commit = commitUrl(b);
  const when = builtLabel(b.builtAt);
  return (
    <div className="buildline" aria-label="App version">
      <span className="bl-k">Running</span>
      {pr ? (
        <a href={pr} target="_blank" rel="noreferrer">
          PR #{b.pr}
        </a>
      ) : null}
      {b.title ? <span className="bl-title" title={b.title}>{b.title}</span> : null}
      {when ? (
        <span className="bl-when">
          <span className="bl-k">updated</span> <time dateTime={b.builtAt}>{when}</time>
        </span>
      ) : null}
      {commit ? (
        <a className="bl-sha" href={commit} target="_blank" rel="noreferrer">
          {b.short}
        </a>
      ) : null}
    </div>
  );
}
