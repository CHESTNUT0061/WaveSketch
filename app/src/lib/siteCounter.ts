const COUNTER_HOSTS = new Set(['chestnut0061.github.io']);

export function isProductionCounterHost(hostname: string): boolean {
  return COUNTER_HOSTS.has(hostname.trim().toLowerCase());
}

export function parseCounterText(text: string | null | undefined): number | null {
  const normalized = text?.replace(/[^\d]/g, '') ?? '';
  if (!normalized) return null;
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}
