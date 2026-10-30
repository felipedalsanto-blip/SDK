import "server-only"
import type { CalculoDetalhe, Metrica, Recorte } from "@pricetax/sdk"
import { REGIMES } from "./catalogo"
import { emCache, pricetax } from "./pricetax"

/** Números de um cenário (Hoje, transição ou regime pleno), todos lidos da API. */
export type Bloco = {
  vendas: { valor: number; tributos: number; debito: number; itens: number }
  compras: { valor: number; tributos: number; credito: number; custo: number; itens: number }
  /** Derivado: débito nas vendas menos crédito nas compras. */
  saldo: number
}

export type PontoAno = { ano: number } & Bloco

export type RegimeComparado = {
  regime: string
  nome: string
  hoje: number
  transicao: number
  pleno: number
  /** Motivo pelo qual o regime não é opção para a empresa, quando a receita passa do limite legal. */
  vedado: string | null
}

export type Executivo = {
  calculo: { id: string; nome: string; empresa: string | null; cnpj: string | null; criadoEm: string; periodoMeses: number | null }
  raiz: { inicio: string | null; fim: string | null }
  geradoEm: string
  regime: { id: string; nome: string; atual: boolean }
  cenarios: { vendas: string; compras: string }
  hoje: Bloco
  transicao: PontoAno
  pleno: PontoAno
  serie: PontoAno[]
  /** Receita bruta anual estimada: vendas do período (com os tributos de hoje) × 12 ÷ meses. */
  receitaAnual: number | null
  regimes: RegimeComparado[]
  sensibilidade: {
    nome: string
    transicao: { custo: number; saldo: number }
    pleno: { custo: number; saldo: number }
  } | null
}

const METRICAS = [
  "valor_ar_saida",
  "valor_dr_saida",
  "valor_impostos_ar_saida",
  "valor_impostos_dr_saida",
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

/** Limites de receita bruta anual (LC 123/2006 para o Simples; Lei 9.718/1998 para o Presumido). */
const LIMITES: Record<string, { valor: number; texto: string }> = {
  simplesNacional: { valor: 4_800_000, texto: "receita bruta acima de R$ 4,8 milhões por ano, limite do Simples Nacional" },
  lucroPresumido: { valor: 78_000_000, texto: "receita bruta acima de R$ 78 milhões por ano, limite do Lucro Presumido" },
}

function total(id: string, recorte: Recorte): Promise<Total> {
  return emCache(`exec-total:${id}:${JSON.stringify(recorte)}`, 600, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { recorte, sentido: "ambas", metricas: [...METRICAS] })
    const g = grupos[0] ?? {}
    return Object.fromEntries(METRICAS.map((m) => [m, n(g[m])])) as Total
  })
}

function bloco(t: Total, lado: "ar" | "dr"): Bloco {
  const debito = t[`debito_${lado}_saida`]
  const credito = t[`credito_${lado}_entrada`]
  return {
    vendas: { valor: t[`valor_${lado}_saida`], tributos: t[`valor_impostos_${lado}_saida`], debito, itens: t.itens_saida },
    compras: {
      valor: t[`valor_${lado}_entrada`],
      tributos: t[`valor_impostos_${lado}_entrada`],
      credito,
      custo: t[`custo_${lado}_entrada`],
      itens: t.itens_entrada,
    },
    saldo: debito - credito,
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

export async function montarExecutivo(
  calculo: CalculoDetalhe,
  recorte: Recorte,
  anoTransicao: number,
): Promise<Executivo> {
  const id = calculo.id
  const anos = [...calculo.anos].sort((a, b) => a - b)
  const anoPleno = anos[anos.length - 1]

  // Uma consulta por ano, em sequência (até 9, com cache): a série e os dois cenários saem daqui.
  const serie: PontoAno[] = []
  let hoje: Bloco | null = null
  for (const ano of anos) {
    const t = await total(id, { ...recorte, ano })
    hoje ??= bloco(t, "ar")
    serie.push({ ano, ...bloco(t, "dr") })
  }
  const daSerie = (ano: number) => serie.find((p) => p.ano === ano) ?? serie[0]

  const raiz = await periodo(id, { ...recorte, ano: anoTransicao })
  const meses = calculo.periodo_meses
  const receitaAnual = meses && meses > 0 ? (hoje!.vendas.valor * 12) / meses : null

  // Os mesmos números nos outros regimes simulados, só para os dois anos-base (2 consultas por regime).
  const regimes: RegimeComparado[] = []
  for (const r of calculo.regimes) {
    let hojeR: number
    let transicao: number
    let pleno: number
    if (r === recorte.regime) {
      hojeR = hoje!.saldo
      transicao = daSerie(anoTransicao).saldo
      pleno = daSerie(anoPleno).saldo
    } else {
      const rec = { ...recorte, regime: r as Recorte["regime"] }
      const tt = await total(id, { ...rec, ano: anoTransicao })
      const tp = await total(id, { ...rec, ano: anoPleno })
      hojeR = bloco(tt, "ar").saldo
      transicao = bloco(tt, "dr").saldo
      pleno = bloco(tp, "dr").saldo
    }
    const limite = LIMITES[r]
    regimes.push({
      regime: r,
      nome: REGIMES[r] ?? r,
      hoje: hojeR,
      transicao,
      pleno,
      vedado: limite && receitaAnual !== null && receitaAnual > limite.valor ? limite.texto : null,
    })
  }

  // Sensibilidade: muda só o cenário de compras (Ajustado para Sem Reajuste), nos dois anos-base.
  let sensibilidade: Executivo["sensibilidade"] = null
  const pior = calculo.cenarios.find((c) => c.id === "sem_reajuste")
  if (pior && recorte.cenario_compras !== "sem_reajuste") {
    const comPior = { ...recorte, cenario_compras: "sem_reajuste" }
    const st = bloco(await total(id, { ...comPior, ano: anoTransicao }), "dr")
    const sp = bloco(await total(id, { ...comPior, ano: anoPleno }), "dr")
    sensibilidade = {
      nome: pior.nome,
      transicao: { custo: st.compras.custo, saldo: st.saldo },
      pleno: { custo: sp.compras.custo, saldo: sp.saldo },
    }
  }

  const nomeCenario = (cid: string | undefined) => calculo.cenarios.find((c) => c.id === cid)?.nome ?? cid ?? "Ajustado"

  return {
    calculo: {
      id,
      nome: calculo.nome,
      empresa: calculo.empresa,
      cnpj: calculo.cnpj,
      criadoEm: calculo.criado_em,
      periodoMeses: meses,
    },
    raiz,
    geradoEm: new Date().toISOString(),
    regime: { id: recorte.regime, nome: REGIMES[recorte.regime] ?? recorte.regime, atual: recorte.regime === calculo.regime_tributario },
    cenarios: { vendas: nomeCenario(recorte.cenario_vendas), compras: nomeCenario(recorte.cenario_compras) },
    hoje: hoje!,
    transicao: daSerie(anoTransicao),
    pleno: daSerie(anoPleno),
    serie,
    receitaAnual,
    regimes,
    sensibilidade,
  }
}
