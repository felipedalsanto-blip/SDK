/*
 * Qualidade da base de compras: descrição genérica e NCM ausente. Funções puras (sem servidor),
 * usadas no aviso ao fim de Compras e cobertas pelos testes em test/.
 */

const GENERICAS = [
  "diversos", "diversas", "material", "materiais", "mercadoria", "mercadorias", "produto", "produtos", "outros", "outras", "item", "itens",
  "peca", "pecas", "servico", "servicos", "despesa", "despesas", "consumo", "uso e consumo", "conforme nota", "conforme pedido", "cf nota", "ref nf",
  "material de consumo", "material de escritorio", "material de limpeza", "revenda", "insumo", "insumos", "componentes", "acessorios", "sucata",
  "nota fiscal", "nf", "venda", "compra", "kit", "lote", "volume", "volumes", "embalagem", "embalagens",
]
export const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()

/** Descrição que não identifica o item: vazia, curta, só números ou só palavras genéricas. */
export function descricaoGenerica(d: string | null): boolean {
  if (!d) return true
  const t = normalizar(d)
  if (t.length < 5 || /^[0-9 ]+$/.test(t)) return true
  const semNumeros = t.replace(/[0-9]+/g, " ").replace(/\s+/g, " ").trim()
  // Abreviações ("PA SX MA 8.8 X 120") identificam o item: só é genérica a descrição feita só de palavras genéricas.
  const palavras = semNumeros.split(" ").filter((p) => p.length > 1 && p !== "x")
  return GENERICAS.includes(semNumeros) || (palavras.length > 0 && palavras.every((p) => GENERICAS.includes(p)))
}
export const ncmAusente = (ncm: string | null) => !ncm || !/^\d{8}$/.test(ncm) || /^0+$/.test(ncm)
