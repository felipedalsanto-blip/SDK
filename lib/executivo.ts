import "server-only"
import type { CalculoDetalhe, Metrica, Recorte } from "@pricetax/sdk"
import { REGIMES } from "./catalogo"
import { emCache, pricetax } from "./pricetax"

/** Números de um cenário (Hoje ou um ano da reforma), todos lidos da API. */
export type Bloco = {
  vendas: { valor: number; tributos: number; itens: number }
  compras: { valor: number; tributos: number; credito: number; custo: number; itens: number }
  /** Derivado: tributos sobre as vendas menos crédito das compras. */
  saldo: number
}

export type PontoAno = { ano: number } & Bloco

export type Executivo = {
  regime: { id: string; nome: string; atual: boolean }
  cenarios: { vendas: string; compras: string }
  hoje: Bloco
  serie: PontoAno[]
}

const METRICAS = [
  "valor_ar_saida",
  "valor_dr_saida",
  "debito_ar_saida",
  "debito_dr_saida",
  "itens_saida",
  "valor_ar_entrada",
  "valor_dr_entrada",
  "valor_impostos_ar_entrada",
  "valor_impostos_dr_entrada",
  "credito_ar_entrada",
  "credito_dr_entrada",
  "custo_ar_entrada",
  "custo_dr_entrada",
  "itens_entrada",
] as const satisfies readonly Metrica[]

type Total = Record<(typeof METRICAS)[number], number>

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

function total(id: string, recorte: Recorte): Promise<Total> {
  return emCache(`exec-total:${id}:${JSON.stringify(recorte)}`, 600, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { recorte, sentido: "ambas", metricas: [...METRICAS] })
    const g = grupos[0] ?? {}
    return Object.fromEntries(METRICAS.map((m) => [m, n(g[m])])) as Total
  })
}

function bloco(t: Total, lado: "ar" | "dr"): Bloco {
  const tributosVendas = t[`debito_${lado}_saida`]
  const credito = t[`credito_${lado}_entrada`]
  return {
    vendas: { valor: t[`valor_${lado}_saida`], tributos: tributosVendas, itens: t.itens_saida },
    compras: {
      valor: t[`valor_${lado}_entrada`],
      tributos: t[`valor_impostos_${lado}_entrada`],
      credito,
      custo: t[`custo_${lado}_entrada`],
      itens: t.itens_entrada,
    },
    saldo: tributosVendas - credito,
  }
}

/** Primeira e última competência com movimento: o exercício de onde os dados saíram. */
export function periodo(id: string, recorte: Recorte) {
  return emCache(`exec-periodo:${id}:${JSON.stringify(recorte)}`, 3600, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, {
      recorte,
      agrupar_por: ["competencia"],
      metricas: ["itens"],
      limite: 500,
    })
    const meses = grupos.map((g) => g.competencia).filter((c): c is string => typeof c === "string" && !!c).sort()
    return { inicio: meses[0] ?? null, fim: meses[meses.length - 1] ?? null }
  })
}

/** Hoje (regras atuais) e cada ano da transição, no regime e nos cenários escolhidos. */
export async function montarExecutivo(calculo: CalculoDetalhe, recorte: Recorte): Promise<Executivo> {
  // Uma consulta por ano, em sequência (até 9, com cache). "Hoje" é o lado AR de qualquer ano.
  const serie: PontoAno[] = []
  let hoje: Bloco | null = null
  for (const ano of [...calculo.anos].sort((a, b) => a - b)) {
    const t = await total(calculo.id, { ...recorte, ano })
    hoje ??= bloco(t, "ar")
    serie.push({ ano, ...bloco(t, "dr") })
  }
  const nomeCenario = (cid: string | undefined) => calculo.cenarios.find((c) => c.id === cid)?.nome ?? cid ?? "Ajustado"
  return {
    regime: { id: recorte.regime, nome: REGIMES[recorte.regime] ?? recorte.regime, atual: recorte.regime === calculo.regime_tributario },
    cenarios: { vendas: nomeCenario(recorte.cenario_vendas), compras: nomeCenario(recorte.cenario_compras) },
    hoje: hoje!,
    serie,
  }
}
