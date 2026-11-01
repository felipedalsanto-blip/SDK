/*
 * CFOPs da reforma tributária (operações onerosas com bens e serviços, que geram débito ou crédito de
 * IBS e CBS) e fora dela (transferências, remessas e retornos sem transmissão de propriedade).
 * É a regra PADRÃO do painel: a tela permite incluir ou excluir CFOPs, e todas as análises seguem a
 * lista em uso.
 */

/** Grupos fora da reforma por padrão: transferências (x15x, x408, x409, x552, x557) e o grupo x9xx de remessas e retornos, exceto prestação de serviço (x933). */
export function ehReformaPadrao(cfop: string): boolean {
  if (!/^\d{4}$/.test(cfop)) return false
  const g = cfop.slice(1)
  if (/^15\d$/.test(g)) return false
  if (["408", "409", "552", "557"].includes(g)) return false
  if (g.startsWith("9") && g !== "933") return false
  return true
}

export type RegraCfop = { incluir: string[]; excluir: string[] }
export const REGRA_VAZIA: RegraCfop = { incluir: [], excluir: [] }

export function classificador(regra: RegraCfop) {
  const inc = new Set(regra.incluir)
  const exc = new Set(regra.excluir)
  return (cfop: string) => (inc.has(cfop) ? true : exc.has(cfop) ? false : ehReformaPadrao(cfop))
}

/** Devoluções (não são compra nem venda para medir representatividade). */
export const ehDevolucao = (cfop: string) => /^[1256](20[1-9]|21[0-9]|41[0-1]|50[3-4]|55[3-5]|66[0-2]|91[89])$/.test(cfop)
/** Aquisições (compras para revenda, industrialização, ativo, uso e consumo, com ST, serviços). */
export const ehCompra = (cfop: string) => /^[123](10\d|11\d|12\d|40[0-7]|55[0-6]|933|35\d|25\d|30\d)$/.test(cfop)
/** Vendas e prestações. */
export const ehVenda = (cfop: string) => /^[567](10\d|11\d|12\d|40[0-5]|933|35\d|25\d|30\d)$/.test(cfop)

export const ehImportacao = (cfop: string) => cfop.startsWith("3")
export const ehExportacao = (cfop: string) => cfop.startsWith("7")
