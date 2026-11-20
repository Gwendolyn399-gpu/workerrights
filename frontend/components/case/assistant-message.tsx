import { Fragment } from "react";
import { citationLabel, readableMessage, type MessageCitation } from "@/lib/message-presentation";

function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={index} className="rounded-control bg-sand px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function AssistantMessage({ content, citations = [] }: { content: string; citations?: MessageCitation[] }) {
  const text = readableMessage(content, citations);
  return (
    <div className="space-y-2.5 break-words">
      {text.split(/\n\s*\n/).map((paragraph, index) => (
        <p className="whitespace-pre-wrap" key={index}>
          {inline(paragraph.replace(/^#{1,6}\s+/gm, ""))}
        </p>
      ))}
      {citations.length > 0 && (
        <details className="border-t border-rule pt-2 text-xs leading-5 text-muted">
          <summary className="cursor-pointer font-bold text-signal-deep">查看依据（{citations.length}）</summary>
          <ul className="mt-2 space-y-1.5">
            {citations.map((citation, index) => {
              const source = citationLabel(citation, index);
              const document = citation.document as Record<string, unknown> | undefined;
              const verified = (citation.verification_status ?? document?.verification_status) === "verified";
              return (
                <li key={String(citation.id ?? index)}>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-signal-deep"
                    >
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                  {!verified && <span className="ml-2 text-note">资料仍需核对</span>}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
