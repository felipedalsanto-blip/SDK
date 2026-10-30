import { fator } from "./cclass"

/*
 * Formação do preço de um produto, serviço ou locação novo, sem item no histórico (vale no navegador).
 * Do valor líquido (custo + margem) até o total da nota, hoje (AR) e em cada ano da transição:
 * - ICMS, ISS e PIS/COFINS são "por dentro": valor do produto = preço líquido ÷ (1 − soma das alíquotas);
 * - IPI, IBS e CBS são "por fora"; IBS e CBS incidem sobre o preço líquido (o valor desonerado, a mesma
 *   base em que o cálculo da Pricetax mede as alíquotas) com a redução do cClassTrib;
 * - os tributos atuais seguem o cronograma da EC 132/2023: PIS e COFINS extintos e IPI zerado em 2027
 *   (fora a Zona Franca de Manaus); ICMS e ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033.
 */

export const IMPOSTOS = ["icms", "iss", "pis_cofins", "ipi", "ibs", "cbs"] as const
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

export type Entrada = {
  tipo: Tipo
  descricao: string
  ncm: string
  custo: number
  margemModo: "margem" | "markup" | "preco"
  margem: number // % (ou R$ do preço líquido no modo "preco")
  ano: number
  hoje: Record<Atual, number> // alíquotas nominais de hoje, em %
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

/** Alíquotas do histórico (sobre o valor desonerado) convertidas em nominais, em %: as que a nota mostra. */
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
  pl: number
  vProd: number
  valores: Aliqs
  nominal: Record<Atual, number> // fração
  cheia: { ibs: number | null; cbs: number | null } // fração
  efetiva: { ibs: number; cbs: number } // fração
  fator: { ibs: number | null; cbs: number | null }
  vNF: number
}

export function simular(e: Entrada, periodo: number | "ar"): Nota {
  const pl = precoLiquido(e)
  const nominal = Object.fromEntries(ATUAIS.map((t) => [t, (e.hoje[t] / 100) * transicao(t, periodo, e.ipiZfm)])) as Record<Atual, number>
  const dentro = nominal.icms + nominal.iss + nominal.pis_cofins
  const vProd = dentro < 1 ? pl / (1 - dentro) : 0
  const fat = { ibs: fator(e.cclass, "ibs"), cbs: fator(e.cclass, "cbs") }
  const cheia = { ibs: null as number | null, cbs: null as number | null }
  const efetiva = { ibs: 0, cbs: 0 }
  if (periodo !== "ar") {
    for (const t of ["ibs", "cbs"] as const) {
      const c = e.cheias[String(periodo)]?.[t]
      cheia[t] = c === undefined ? null : c / 100
      efetiva[t] = fat[t] === null ? e.manual[t] / 100 : (cheia[t] ?? 0) * fat[t]!
    }
  }
  const valores: Aliqs = {
    icms: vProd * nominal.icms,
    iss: vProd * nominal.iss,
    pis_cofins: vProd * nominal.pis_cofins,
    ipi: vProd * nominal.ipi,
    ibs: pl * efetiva.ibs,
    cbs: pl * efetiva.cbs,
  }
  return { periodo, pl, vProd, valores, nominal, cheia, efetiva, fator: fat, vNF: vProd + valores.ipi + valores.ibs + valores.cbs }
}

/** No formato que o "custo do seu cliente" lê: valor da nota e cada tributo, hoje (ar) e no ano (dr). */
export function baseCliente(hoje: Nota, ano: Nota): Record<string, number> {
  const b: Record<string, number> = { valor_ar: hoje.vNF, valor_dr: ano.vNF }
  for (const t of IMPOSTOS) {
    b[`valor_${t}_ar`] = hoje.valores[t]
    b[`valor_${t}_dr`] = ano.valores[t]
  }
  return b
}
