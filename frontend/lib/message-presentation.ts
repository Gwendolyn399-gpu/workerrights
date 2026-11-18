export type MessageCitation = Record<string, unknown>;

/** Remove only verified source markers from prose; keep the sources separately. */
export function readableMessage(content: string, citations: MessageCitation[] = []): string {
  const knownIds = new Set(citations.map(item => String(item.id).toLowerCase()));
  return content.replace(/\[([A-Za-z0-9][A-Za-z0-9_-]*)\]/g, (marker, id: string) =>
    knownIds.has(id.toLowerCase()) ? "" : marker,
  ).replace(/[ \t]+\n/g, "\n").trim();
}

export function citationLabel(citation: MessageCitation, index: number): { title: string; url?: string } {
  const document = citation.document as Record<string, unknown> | undefined;
  const title = [document?.title ?? citation.title, citation.article].filter(value => typeof value === "string" && value).join(" · ");
  const url = document?.official_url ?? citation.official_url;
  return { title: title || `参考资料 ${index + 1}`, url: typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined };
}
