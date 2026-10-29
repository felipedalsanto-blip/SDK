// Nomes do catálogo da API de cálculos usados pelo painel. Compartilhado entre servidor e
// navegador: só nomes e rótulos, nada de credencial.
import type { Dimensao, Metrica } from "@pricetax/sdk"

export type Sentido = "entrada" | "saida" | "ambas"

export const SENTIDOS: Record<Sentido, string> = {
  ambas: "Compras e vendas",
  saida: "Vendas (saída)",
  entrada: "Compras (entrada)",
}

export const REGIMES: Record<string, string> = {
  simplesNacional: "Simples Nacional",
  lucroReal: "Lucro Real",
  lucroPresumido: "Lucro Presumido",
}

export const TIPOS_LINHA: Record<string, string> = {
  produto: "Produto",
  servico: "Serviço",
  locacaoBensMoveis: "Locação de bens móveis",
  locacaoBensImoveis: "Locação de imóveis",
  compraVendaBensImoveis: "Compra e venda de imóveis",
}

/** Dimensões que o ranking aceita (o servidor recusa qualquer outra). */
export const DIMENSOES_RANKING = {
  ncm: "NCM",
  cfop: "CFOP",
  cnpj_outra_parte: "CNPJ da outra parte",
  uf_emitente: "UF do emitente",
  tipo_linha: "Tipo de item",
  tipo_operacao: "Tipo de operação",
  segmento: "Segmento",
  descricao_produto: "Produto",
} as const satisfies Partial<Record<Dimensao, string>>
export type DimensaoRanking = keyof typeof DIMENSOES_RANKING

/** Medidas comparadas antes × depois: cada uma vira o par `<medida>_ar` / `<medida>_dr`. */
export const MEDIDAS = {
  valor_impostos: "Tributos",
  valor: "Valor do item",
  debito: "Débito (vendas)",
  credito: "Crédito (compras)",
} as const
export type Medida = keyof typeof MEDIDAS

export const metricaAr = (m: Medida) => `${m}_ar` as Metrica
export const metricaDr = (m: Medida) => `${m}_dr` as Metrica

/** Métricas do quadro de totais. */
export const METRICAS_RESUMO = [
  "itens",
  "parceiros_distintos",
  "produtos_distintos",
  "valor_ar",
  "valor_dr",
  "valor_impostos_ar",
  "valor_impostos_dr",
  "carga_efetiva_ar",
  "carga_efetiva_dr",
  "debito_ar",
  "debito_dr",
  "credito_ar",
  "credito_dr",
] as const satisfies readonly Metrica[]

/** Métricas da evolução ano a ano. */
export const METRICAS_SERIE = [
  "valor_impostos_ar",
  "valor_impostos_dr",
  "carga_efetiva_ar",
  "carga_efetiva_dr",
] as const satisfies readonly Metrica[]

/** Colunas da tabela de linhas (todas do catálogo; a API devolve as 194, o servidor recorta estas). */
export const COLUNAS_LINHAS = [
  "input_id",
  "data_operacao",
  "tipo_movimentacao",
  "tipo_linha",
  "descricao_produto",
  "ncm",
  "cfop",
  "razao_social_outra_parte",
  "valor_ar",
  "valor_dr",
  "valor_impostos_ar",
  "valor_impostos_dr",
  "porcentagem_carga_tributaria_ar",
  "porcentagem_carga_tributaria_dr",
] as const
export type ColunaLinha = (typeof COLUNAS_LINHAS)[number]
export type LinhaResumida = Record<ColunaLinha, string | number | boolean | null>

/** Recorte e filtros que o navegador manda ao servidor. */
export type Selecao = {
  recorte: { regime: string; ano: number; cenario_vendas: string; cenario_compras: string }
  sentido: Sentido
  filtro?: { dimensao: DimensaoRanking; valor: string | null } | null
}
