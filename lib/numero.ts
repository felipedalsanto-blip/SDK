// Número no formato do CSV da exportação (pt-BR). Puro, para usar fora do servidor e nos testes.

/** "1.234,56" → 1234.56; vazio → 0. */
export function numeroCsv(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
