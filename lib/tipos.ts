/*
 * O tipo de cada linha do cálculo, para os totais de abertura de Compras e Vendas: produto, serviço,
 * locação de bem imóvel e locação de bem móvel. Lido do tipo de linha e do tipo de operação que o
 * cálculo traz; o que não se encaixa fica com o próprio nome.
 */

export const TIPOS_LINHA = ["produto", "servico", "locacao_imovel", "locacao_movel"] as const
export type TipoLinha = (typeof TIPOS_LINHA)[number]

export const NOME_TIPO: Record<TipoLinha, string> = {
  produto: "Produto",
  servico: "Serviço",
  locacao_imovel: "Locação de bem imóvel",
  locacao_movel: "Locação de bem móvel",
}

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/** A categoria da linha, ou "outro:<valor>" quando o cálculo traz um tipo fora das quatro. */
export function tipoDaLinha(tipoLinha: unknown, tipoOperacao: unknown): string {
  const t = `${normal(tipoLinha)} ${normal(tipoOperacao)}`
  if (/imove(l|is)/.test(t)) return "locacao_imovel"
  if (/locac|alug|arrend|leasing/.test(t)) return "locacao_movel"
  if (/serv/.test(t)) return "servico"
  if (/prod|mercad|revend|industr|\bbem\b|bens|compra|venda|ativo|consumo|insumo/.test(t) || !t.trim()) return "produto"
  return `outro:${String(tipoLinha ?? tipoOperacao ?? "").trim()}`
}

export function nomeTipo(chave: string): string {
  return chave.startsWith("outro:") ? chave.slice(6) || "Sem tipo" : (NOME_TIPO[chave as TipoLinha] ?? chave)
}
