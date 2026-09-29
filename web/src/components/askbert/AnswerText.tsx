import { Fragment } from "react";

/**
 * askBert's answer text with the little markdown it uses: **bold**, `code`, and line breaks.
 * Rendered as React nodes (no HTML injection).
 */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split(/\n+/).map((line, i) => (
        <p key={i}>{inline(line.replace(/^\s*[-*]\s+/, "• "))}</p>
      ))}
    </div>
  );
}

function inline(line: string) {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) return <strong key={i}>{seg.slice(2, -2)}</strong>;
    if (seg.startsWith("`") && seg.endsWith("`")) return <code key={i} className="rounded bg-zinc-100 px-1 font-mono text-[12px]">{seg.slice(1, -1)}</code>;
    return <Fragment key={i}>{seg}</Fragment>;
  });
}
