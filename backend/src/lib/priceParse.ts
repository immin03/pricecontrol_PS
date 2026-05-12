export function parseKrwPrice(text: string): number | null {
  const cleaned = text
    .replace(/\s/g, "")
    .replace(/[,]/g, "")
    .replace(/[^\d]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

