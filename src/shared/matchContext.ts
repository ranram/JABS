export function displayPhaseName(phase: string | undefined): string {
  const name = phase?.trim() ?? '';
  return /^pool$/i.test(name) ? 'Pools' : name;
}

export function phaseAndRound(context: { phase?: string; round?: string }): string {
  return [...new Set([displayPhaseName(context.phase), context.round?.trim()].filter(Boolean))].join(' · ');
}
