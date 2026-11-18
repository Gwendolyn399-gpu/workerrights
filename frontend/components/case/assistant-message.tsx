import { Fragment } from "react";
import { citationLabel, readableMessage, type MessageCitation } from "@/lib/message-presentation";

function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-ink-50 px-1">{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function AssistantMessage({ content, citations = [] }: { content: string; citations?: MessageCitation[] }) {
  const text = readableMessage(content, citations);
  return <div className="space-y-3 break-words leading-7">
    {text.split(/\n\s*\n/).map((paragraph, index) => <p className="whitespace-pre-wrap" key={index}>
      {inline(paragraph.replace(/^#{1,6}\s+/gm, ""))}
    </p>)}
    {citations.length > 0 && <details className="text-sm text-ink-600">
      <summary className="cursor-pointer">查看依据（{citations.length}）</summary>
      <ul className="mt-2 space-y-2">
        {citations.map((citation, index) => {
          const source = citationLabel(citation, index);
          const document = citation.document as Record<string, unknown> | undefined;
          const verified = (citation.verification_status ?? document?.verification_status) === "verified";
          return <li key={String(citation.id ?? index)}>
            {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a> : source.title}
            {!verified && <span className="ml-2 text-xs">资料仍需核对</span>}
          </li>;
        })}
      </ul>
    </details>}
  </div>;
}
