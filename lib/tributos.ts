// Tributos e métricas de detalhe, compartilhados entre servidor e navegador (só nomes).
import type { Dimensao, Metrica } from "@pricetax/sdk"

export const TRIBUTOS = [
  { id: "icms", nome: "ICMS" },
  { id: "icms_st", nome: "ICMS-ST" },
  { id: "icms_difal", nome: "DIFAL" },
  { id: "iss", nome: "ISS" },
  { id: "ipi", nome: "IPI" },
  { id: "pis_cofins", nome: "PIS/COFINS" },
  { id: "ibs", nome: "IBS" },
  { id: "cbs", nome: "CBS" },
] as const
export type TributoId = (typeof TRIBUTOS)[number]["id"]

const lados = ["ar", "dr"] as const

/** Métricas que abrem as colunas de impostos e créditos (totais e por tributo, AR e DR). */
export const METRICAS_DETALHE = [
  "valor_impostos_ar",
  "valor_impostos_dr",
  "credito_ar",
  "credito_dr",
  ...TRIBUTOS.flatMap((t) => lados.map((l) => `valor_${t.id}_${l}` as Metrica)),
  ...TRIBUTOS.flatMap((t) => lados.map((l) => `credito_${t.id}_${l}` as Metrica)),
] as Metrica[]

/** Débitos por tributo (para as vendas na DRE e no fluxo). */
export const METRICAS_DEBITO = TRIBUTOS.flatMap((t) => lados.map((l) => `debito_${t.id}_${l}` as Metrica))

/** Agrupadores que a visão montável aceita. */
export const AGRUPADORES = {
  descricao_produto: "Item",
  codigo_produto: "Código do item",
  cnpj_outra_parte: "Fornecedor / cliente",
  regime_outra_parte: "Regime da outra parte",
  ncm: "NCM",
  cfop: "CFOP",
  uf_emitente: "UF do emitente",
  tipo_linha: "Tipo de item",
  tipo_operacao: "Tipo de operação",
  segmento: "Segmento",
  cst_icms: "CST ICMS",
  cclass_calculado: "cClassTrib calculado",
  competencia: "Competência",
} as const satisfies Partial<Record<Dimensao, string>>
export type Agrupador = keyof typeof AGRUPADORES

/** Colunas que a visão montável oferece, em grupos que expandem. */
export const GRUPOS_COLUNAS: { id: string; nome: string; metricas: { id: Metrica; nome: string }[] }[] = [
  {
    id: "valor",
    nome: "Valor e custo",
    metricas: [
      { id: "itens", nome: "Itens" },
      { id: "quantidade", nome: "Quantidade" },
      { id: "valor_ar", nome: "Valor AR" },
      { id: "valor_dr", nome: "Valor DR" },
      { id: "custo_ar", nome: "Custo AR" },
      { id: "custo_dr", nome: "Custo DR" },
      { id: "carga_efetiva_ar", nome: "Carga efetiva AR" },
      { id: "carga_efetiva_dr", nome: "Carga efetiva DR" },
    ],
  },
  {
    id: "impostos",
    nome: "Impostos",
    metricas: [
      { id: "valor_impostos_ar", nome: "Impostos AR" },
      { id: "valor_impostos_dr", nome: "Impostos DR" },
      ...TRIBUTOS.flatMap((t) => [
        { id: `valor_${t.id}_ar` as Metrica, nome: `${t.nome} AR` },
        { id: `valor_${t.id}_dr` as Metrica, nome: `${t.nome} DR` },
      ]),
    ],
  },
  {
    id: "creditos",
    nome: "Créditos",
    metricas: [
      { id: "credito_ar", nome: "Crédito AR" },
      { id: "credito_dr", nome: "Crédito DR" },
      ...TRIBUTOS.flatMap((t) => [
        { id: `credito_${t.id}_ar` as Metrica, nome: `Crédito ${t.nome} AR` },
        { id: `credito_${t.id}_dr` as Metrica, nome: `Crédito ${t.nome} DR` },
      ]),
    ],
  },
  {
    id: "debitos",
    nome: "Débitos (vendas)",
    metricas: [
      { id: "debito_ar", nome: "Débito AR" },
      { id: "debito_dr", nome: "Débito DR" },
      ...TRIBUTOS.flatMap((t) => [
        { id: `debito_${t.id}_ar` as Metrica, nome: `Débito ${t.nome} AR` },
        { id: `debito_${t.id}_dr` as Metrica, nome: `Débito ${t.nome} DR` },
      ]),
    ],
  },
]
export const METRICAS_EXPLORAR = new Set<string>(GRUPOS_COLUNAS.flatMap((g) => g.metricas.map((m) => m.id)))
