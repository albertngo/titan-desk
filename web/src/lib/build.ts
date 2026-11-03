/**
 * Which build is running (Albert, 2026-11-03: "at the top of every page … the most recent repo as
 * well as when it was updated last, so that I can see if the app is up to date").
 *
 * next.config.ts stamps the commit and the build time into BUILD_SHA / BUILD_MESSAGE / BUILD_TIME
 * when the app is built, so the line shows what this deployment really is, not what GitHub has now.
 * This file is a copy in web/ and quote/; tests/build.test.ts in each app pins the same behaviour.
 */

export type BuildInfo = {
  /** Full commit SHA, or "" when the build had none (a local build outside git). */
  sha: string;
  short: string;
  /** The PR this commit merged, when it is a GitHub merge commit. */
  pr: number | null;
  /** What changed, in the commit's own words: the PR title for a merge, else the subject line. */
  title: string;
  /** ISO time the app was built, i.e. when this deployment was last updated. */
  builtAt: string;
};

const REPO_URL = "https://github.com/albertngo/titan-desk";

/** "Merge pull request #137 from owner/branch\n\nquote: the title" → { pr: 137, title: "quote: the title" }. */
export function parseCommitMessage(message: string): { pr: number | null; title: string } {
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  const subject = lines[0] ?? "";
  const merge = /^Merge pull request #(\d+)\b/.exec(subject);
  if (merge) {
    const body = lines.slice(1).find((l) => l !== "") ?? "";
    return { pr: Number(merge[1]), title: body };
  }
  // A squash merge reads "title (#137)".
  const squash = /^(.*\S)\s+\(#(\d+)\)$/.exec(subject);
  if (squash) return { pr: Number(squash[2]), title: squash[1] };
  return { pr: null, title: subject };
}

export function buildInfo(env: { sha?: string; message?: string; time?: string }): BuildInfo | null {
  const sha = (env.sha ?? "").trim();
  const builtAt = (env.time ?? "").trim();
  if (!sha && !builtAt) return null;
  const { pr, title } = parseCommitMessage(env.message ?? "");
  return { sha, short: sha.slice(0, 7), pr, title, builtAt };
}

/** This deployment's build. process.env.BUILD_* are inlined at build time by next.config.ts. */
export function currentBuild(): BuildInfo | null {
  return buildInfo({ sha: process.env.BUILD_SHA, message: process.env.BUILD_MESSAGE, time: process.env.BUILD_TIME });
}

/** "Nov 3, 4:12 p.m." in Toronto time, whatever the server's zone. */
export function builtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function commitUrl(b: BuildInfo): string | null {
  return b.sha ? `${REPO_URL}/commit/${b.sha}` : null;
}

export function prUrl(b: BuildInfo): string | null {
  return b.pr ? `${REPO_URL}/pull/${b.pr}` : null;
}
