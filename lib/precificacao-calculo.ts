import { fator } from "./cclass"

/*
 * Formação do preço de um produto, serviço ou locação novo (vale no navegador). Parte do valor
 * líquido que a empresa quer receber, L = custo + margem + outras despesas (frete, seguro, outras
 * acessórias), e monta a nota hoje (AR, regras de 2026) e em cada ano da reforma:
 *
 *   IBS e CBS   base = L (sem ICMS, ISS, PIS/COFINS e IPI); alíquota cheia × (1 − redução do cClassTrib)
 *   ICMS        base = valor da operação + IBS + CBS (+ IPI quando o destinatário não revende nem
 *               industrializa), com o próprio ICMS por dentro (gross-up)
 *   ISS         base = valor do serviço + IBS + CBS, com o próprio ISS por dentro (gross-up)
 *   PIS/COFINS  só hoje: sobre a receita, com o ICMS fora da base (Tema 69), se marcado
 *   IPI         sobre o valor da operação (com o ICMS dentro); entra na base do ICMS para consumo final
 *   ICMS-ST     (valor da operação + IBS + CBS + IPI) × (1 + MVA) × alíquota interna do destino
 *               − ICMS próprio; MVA ajustada nas operações interestaduais
 *   DIFAL       venda interestadual a consumidor final: não contribuinte paga o remetente (base única,
 *               entra no preço); contribuinte (uso e consumo) paga o destinatário (base dupla, fora da nota)
 *
 * O valor da operação G é achado numericamente: o maior G em que a empresa, depois de recolher
 * ICMS, ISS, PIS/COFINS e o DIFAL que lhe cabe, fica com L. IBS, CBS, IPI e ST vão por fora.
 * Cronograma da EC 132/2023: PIS e COFINS extintos e IPI zerado em 2027 (fora a Zona Franca);
 * ICMS e ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033.
 */

export const IMPOSTOS = ["icms", "icms_st", "icms_difal", "iss", "pis_cofins", "ipi", "ibs", "cbs"] as const
export type Imposto = (typeof IMPOSTOS)[number]
export type Aliqs = Record<Imposto, number>
export type Atual = "icms" | "iss" | "pis_cofins" | "ipi"
export const ATUAIS: Atual[] = ["icms", "iss", "pis_cofins", "ipi"]

export type RefNcm = {
  ncm: string
  itens: number
  valorAr: number
  classes: { cclass: string; itens: number; valor: number }[]
  ar: Aliqs
  anos: Record<string, Aliqs>
}

export type Precificacao = {
  anos: number[]
  cheias: Record<number, { ibs: number | null; cbs: number | null }>
  media: { ar: Aliqs; anos: Record<string, Aliqs> }
  ncms: RefNcm[]
  parcial: boolean
}

export type Tipo = "produto" | "servico" | "locacao"
export type Metodo = "transicao" | "novos"
/** Revenda ou industrialização; uso, consumo ou ativo de contribuinte; consumidor final não contribuinte. */
export type Destino = "revenda" | "consumo" | "final"

export type Entrada = {
  tipo: Tipo
  descricao: string
  ncm: string
  nbs: string
  metodo: Metodo
  custo: number
  margemModo: "margem" | "markup" | "preco"
  margem: number // % (ou R$ do preço líquido no modo "preco")
  despesas: number // R$: frete, seguro e outras despesas acessórias cobradas na nota
  ano: number
  destino: Destino
  interestadual: boolean
  hoje: Record<Atual, number> // alíquotas de hoje, em %: ICMS da operação (interna ou interestadual)
  tema69: boolean // ICMS fora da base do PIS e da COFINS
  st: { ativo: boolean; mva: number; aliqDestino: number } // %
  difal: { ativo: boolean; aliqDestino: number } // % (alíquota interna do destino, com FCP se houver)
  ipiZfm: boolean
  cclass: string
  cheias: Record<string, { ibs: number; cbs: number }> // alíquotas cheias de IBS e CBS por ano, em %
  manual: { ibs: number; cbs: number } // alíquota efetiva, em %, quando o CST tem regra própria
}

/** Quanto do tributo atual ainda vale no ano (1 = inteiro, 0 = extinto). */
export function transicao(t: Atual, ano: number | "ar", ipiZfm = false): number {
  if (ano === "ar") return 1
  if (t === "pis_cofins") return ano >= 2027 ? 0 : 1
  if (t === "ipi") return ano >= 2027 && !ipiZfm ? 0 : 1
  if (ano <= 2028) return 1
  return ({ 2029: 0.9, 2030: 0.8, 2031: 0.7, 2032: 0.6 } as Record<number, number>)[ano] ?? 0
}

/**
 * Alíquotas do histórico (medidas sobre o valor sem tributos) convertidas nas nominais da nota, em %:
 * ICMS e ISS por dentro do valor da operação, PIS/COFINS sobre a receita, IPI sobre a operação.
 */
export function nominais(a: Aliqs): Record<Atual, number> {
  const dentro = a.icms + a.iss + a.pis_cofins
  const r = (v: number) => Math.round((v / (1 + dentro)) * 10000) / 100
  return { icms: r(a.icms), iss: r(a.iss), pis_cofins: r(a.pis_cofins), ipi: r(a.ipi) }
}

export function precoLiquido(e: Entrada): number {
  const m = e.margem / 100
  if (e.margemModo === "preco") return e.margem
  if (e.margemModo === "markup") return e.custo * (1 + m)
  return m < 1 ? e.custo / (1 - m) : 0
}

export type Nota = {
  periodo: number | "ar"
  /** Valor líquido: custo + margem + outras despesas. Base do IBS e da CBS. */
  liquido: number
  precoLiquido: number
  despesas: number
  /** Valor da operação: produto ou serviço + despesas, com ICMS, ISS e PIS/COFINS dentro. */
  operacao: number
  vProd: number
  bases: { ibsCbs: number; icms: number; iss: number; pisCofins: number; ipi: number; st: number; difal: number }
  aliq: { icms: number; iss: number; pisCofins: number; ipi: number; stDestino: number; mva: number; difalDestino: number } // fração
  valores: Aliqs
  /** Quem recolhe o DIFAL: o remetente (está no preço) ou o destinatário (fora da nota). */
  difalPagoPor: "remetente" | "destinatario" | null
  cheia: { ibs: number | null; cbs: number | null } // fração
  efetiva: { ibs: number; cbs: number } // fração
  fator: { ibs: number | null; cbs: number | null }
  /** O que o cliente paga na nota: operação + IPI + ST + IBS + CBS. */
  total: number
}

const pct = (v: number) => (Number.isFinite(v) ? v / 100 : 0)

export function simular(e: Entrada, periodo: number | "ar"): Nota {
  const pl = precoLiquido(e)
  const liquido = pl + e.despesas
  const reforma = periodo !== "ar"
  const soNovos = e.metodo === "novos" && reforma
  const produto = e.tipo === "produto"
  const f = (t: Atual) => (soNovos ? 0 : transicao(t, periodo, e.ipiZfm))

  const a = pct(e.hoje.icms) * f("icms")
  const s = pct(e.hoje.iss) * f("iss")
  const c = pct(e.hoje.pis_cofins) * f("pis_cofins")
  const p = pct(e.hoje.ipi) * f("ipi")
  const ipiNaBase = e.destino !== "revenda"

  // IBS e CBS: sobre o valor líquido, com a redução do cClassTrib.
  const fat = { ibs: fator(e.cclass, "ibs"), cbs: fator(e.cclass, "cbs") }
  const cheia = { ibs: null as number | null, cbs: null as number | null }
  const efetiva = { ibs: 0, cbs: 0 }
  if (reforma) {
    for (const t of ["ibs", "cbs"] as const) {
      const v = e.cheias[String(periodo)]?.[t]
      cheia[t] = v === undefined ? null : v / 100
      efetiva[t] = fat[t] === null ? pct(e.manual[t]) : (cheia[t] ?? 0) * fat[t]!
    }
  }
  const ibs = liquido * efetiva.ibs
  const cbs = liquido * efetiva.cbs
  const iva = ibs + cbs

  // DIFAL: só em venda interestadual de produto a quem não revende.
  const temDifal = produto && e.difal.ativo && e.interestadual && e.destino !== "revenda" && a > 0
  const difalDestino = temDifal ? pct(e.difal.aliqDestino) * f("icms") : 0
  const difalPagoPor = temDifal ? (e.destino === "final" ? "remetente" : "destinatario") : null

  const conta = (G: number) => {
    const ipi = produto ? p * G : 0
    const baseIcms = G + iva + (ipiNaBase ? ipi : 0)
    const icms = produto ? a * baseIcms : 0
    const baseIss = G + iva
    const iss = produto ? 0 : s * baseIss
    const basePc = G - (e.tema69 ? icms : 0)
    const pc = c * basePc
    const difalRem = difalPagoPor === "remetente" ? Math.max(0, difalDestino - a) * baseIcms : 0
    return { ipi, baseIcms, icms, baseIss, iss, basePc, pc, difalRem, liquidoFica: G - icms - iss - pc - difalRem }
  }
  // O que fica para a empresa cresce com G: busca binária até fechar no valor líquido.
  let lo = 0
  let hi = Math.max(1, liquido) * 50
  for (let i = 0; i < 200; i++) {
    const meio = (lo + hi) / 2
    if (conta(meio).liquidoFica < liquido) lo = meio
    else hi = meio
  }
  const G = (lo + hi) / 2
  const k = conta(G)

  // ICMS-ST: MVA ajustada quando a alíquota interestadual é menor que a interna do destino.
  const stDestino = produto && e.st.ativo ? pct(e.st.aliqDestino) * f("icms") : 0
  const mvaOriginal = pct(e.st.mva)
  const mva =
    stDestino > 0 && e.interestadual && stDestino > a && a > 0 ? ((1 + mvaOriginal) * (1 - a)) / (1 - stDestino) - 1 : mvaOriginal
  const baseSt = stDestino > 0 ? (G + iva + k.ipi) * (1 + mva) : 0
  const st = Math.max(0, baseSt * stDestino - k.icms)

  // DIFAL do destinatário (base dupla): fora da nota, mas é custo de quem compra.
  const baseDupla = difalPagoPor === "destinatario" && difalDestino < 1 ? (k.baseIcms - k.icms) / (1 - difalDestino) : 0
  const difal = difalPagoPor === "remetente" ? k.difalRem : Math.max(0, baseDupla * difalDestino - k.icms)

  return {
    periodo,
    liquido,
    precoLiquido: pl,
    despesas: e.despesas,
    operacao: G,
    vProd: G - e.despesas,
    bases: {
      ibsCbs: reforma ? liquido : 0,
      icms: produto ? k.baseIcms : 0,
      iss: produto ? 0 : k.baseIss,
      pisCofins: k.basePc,
      ipi: produto ? G : 0,
      st: baseSt,
      difal: difalPagoPor === "remetente" ? k.baseIcms : baseDupla,
    },
    aliq: { icms: produto ? a : 0, iss: produto ? 0 : s, pisCofins: c, ipi: produto ? p : 0, stDestino, mva, difalDestino },
    valores: { icms: k.icms, icms_st: st, icms_difal: difal, iss: k.iss, pis_cofins: k.pc, ipi: k.ipi, ibs, cbs },
    difalPagoPor,
    cheia,
    efetiva,
    fator: fat,
    total: G + k.ipi + st + iva,
  }
}

/**
 * No formato que o "custo do seu cliente" lê: o desembolso do cliente (a nota e, quando é dele, o
 * DIFAL) e cada tributo, hoje (ar) e no ano (dr).
 */
export function baseCliente(hoje: Nota, ano: Nota): Record<string, number> {
  const desembolso = (n: Nota) => n.total + (n.difalPagoPor === "destinatario" ? n.valores.icms_difal : 0)
  const b: Record<string, number> = { valor_ar: desembolso(hoje), valor_dr: desembolso(ano) }
  for (const t of IMPOSTOS) {
    b[`valor_${t}_ar`] = hoje.valores[t]
    b[`valor_${t}_dr`] = ano.valores[t]
  }
  return b
}
