export function isResultStale(factsRevision: number, generatedFromRevision: number): boolean {
  return factsRevision !== generatedFromRevision;
}
