import "server-only"
import type { CalculoDetalhe, Recorte } from "@pricetax/sdk"
import { numeroCsv, registrosCsv } from "./csv"
import { emCache, pricetax } from "./pricetax"
import { tipoDaLinha } from "./tipos"

/*
 * IPI e ICMS ESTIMADOS: quando o documento não destaca o tributo (revenda de distribuidor, compra do
 * Simples…), a Pricetax estima o quanto dele veio embutido no preço pela cadeia. Esse valor não veio
 * do fornecedor nem do cliente. A API marca a linha (estimou_ipi, estimou_icms), mas a marca não é
 * dimensão da consulta agregada: aqui lemos as linhas do ano (uma exportação, com cache), somamos o
 * estimado e montamos o ajuste para ver o cálculo SEM o efeito dos estimados.
 *
 * Sem o estimado, o tributo deixa de existir e o valor volta a ser preço:
 * - AR: o valor pago é o mesmo; sai o tributo estimado (e o crédito dele, que volta ao custo);
 * - DR: o preço desonerado fica maior pelo estimado de hoje, o IBS e a CBS incidem sobre ele na mesma
 *   proporção da linha, e sai a parte estimada que ainda restaria no ano (ICMS da transição).
 * O ajuste é calculado no cenário Ajustado (compras) e Com Reajuste (vendas) e aplicado aos demais.
 */

export const ESTIMAVEIS = ["ipi", "icms"] as const
export type Estimavel = (typeof ESTIMAVEIS)[number]

export type Ajuste = Record<string, number>
export type ResumoEstimado = Record<Estimavel, { linhas: number; valorAr: number; valorDr: number; creditoAr: number }>
type Lado = {
  resumo: ResumoEstimado
  total: Ajuste
  porCnpj: Map<string, Ajuste>
  porRegime: Map<string, Ajuste>
  porNcm: Map<string, Ajuste>
  porDescricao: Map<string, Ajuste>
  porItem: Map<string, Ajuste>
  porTipo: Map<string, Ajuste>
}
export type Estimados = { entrada: Lado; saida: Lado }

const SIM = new Set(["true", "1", "s", "sim", "t", "y", "yes", "verdadeiro"])
const marcado = (v: string | undefined) => !!v && SIM.has(v.trim().toLowerCase())
export const chaveItem = (descricao: unknown, ncm: unknown, cnpj: unknown) => `${descricao ?? ""}|${ncm ?? ""}|${cnpj ?? ""}`

const vazio = (): Lado => ({
  resumo: { ipi: { linhas: 0, valorAr: 0, valorDr: 0, creditoAr: 0 }, icms: { linhas: 0, valorAr: 0, valorDr: 0, creditoAr: 0 } },
  total: {},
  porCnpj: new Map(),
  porRegime: new Map(),
  porNcm: new Map(),
  porDescricao: new Map(),
  porItem: new Map(),
  porTipo: new Map(),
})

function somar(alvo: Ajuste, d: Ajuste) {
  for (const [k, v] of Object.entries(d)) alvo[k] = (alvo[k] ?? 0) + v
}
function noMapa(m: Map<string, Ajuste>, chave: string, d: Ajuste) {
  if (!m.has(chave)) m.set(chave, {})
  somar(m.get(chave)!, d)
}

/** O ajuste de uma linha: o que muda em cada métrica se os tributos estimados dela não existissem. */
function ajusteDaLinha(r: Record<string, string>, entrada: boolean, lado: Lado): Ajuste | null {
  const v = (k: string) => numeroCsv(r[k])
  const d: Ajuste = {}
  const add = (k: string, x: number) => {
    if (x) d[k] = (d[k] ?? 0) + x
  }
  const des = v("valor_desonerado_dr")
  const ibs = v("valor_ibs_dr")
  const cbs = v("valor_cbs_dr")
  const mov = entrada ? "credito" : "debito"
  const movIbs = v(`${mov}_ibs_dr`)
  const movCbs = v(`${mov}_cbs_dr`)
  let algum = false
  for (const t of ESTIMAVEIS) {
    if (!marcado(r[`estimou_${t}`])) continue
    const estAr = v(`valor_${t}_ar`)
    const estDr = v(`valor_${t}_dr`)
    if (!estAr && !estDr) continue
    algum = true
    const res = lado.resumo[t]
    res.linhas++
    res.valorAr += estAr
    res.valorDr += estDr
    res.creditoAr += entrada ? v(`credito_${t}_ar`) : 0

    // IBS e CBS sobre o pedaço que volta a ser preço, na proporção da própria linha.
    const pIbs = des > 0 ? (ibs / des) * estAr : 0
    const pCbs = des > 0 ? (cbs / des) * estAr : 0
    const pMovIbs = des > 0 ? (movIbs / des) * estAr : 0
    const pMovCbs = des > 0 ? (movCbs / des) * estAr : 0
    const dValorDr = estAr - estDr + pIbs + pCbs

    add(`valor_${t}_ar`, -estAr)
    add("valor_impostos_ar", -estAr)
    add("valor_desonerado_ar", estAr)
    add(`valor_${t}_dr`, -estDr)
    add("valor_ibs_dr", pIbs)
    add("valor_cbs_dr", pCbs)
    add("valor_impostos_dr", -estDr + pIbs + pCbs)
    add("valor_desonerado_dr", estAr)
    add("valor_sem_iva_dr", estAr - estDr)
    add("valor_dr", dValorDr)

    const movAr = v(`${mov}_${t}_ar`)
    const movDr = v(`${mov}_${t}_dr`)
    add(`${mov}_${t}_ar`, -movAr)
    add(`${mov}_ar`, -movAr)
    add(`${mov}_${t}_dr`, -movDr)
    add(`${mov}_ibs_dr`, pMovIbs)
    add(`${mov}_cbs_dr`, pMovCbs)
    const dMovDr = -movDr + pMovIbs + pMovCbs
    add(`${mov}_dr`, dMovDr)
    if (entrada) {
      // Crédito que deixa de existir volta ao custo.
      add("custo_ar", movAr)
      add("custo_dr", dValorDr - dMovDr)
    }
  }
  return algum ? d : null
}

/** Lê as linhas do ano (compras e vendas, cenário Ajustado/Com Reajuste) e soma os estimados. */
export function lerEstimados(calculo: CalculoDetalhe, regime: Recorte["regime"], ano: number): Promise<Estimados> {
  const recorte: Recorte = { regime, ano, cenario_vendas: "base", cenario_compras: "base" }
  return emCache(`estimados:${calculo.id}:${JSON.stringify(recorte)}`, 900, async () => {
    const res: Estimados = { entrada: vazio(), saida: vazio() }
    const stream = await pricetax().calculos.exportar(calculo.id, { recorte, sentido: "ambas" })
    for await (const r of registrosCsv(stream)) {
      const entrada = r.tipo_movimentacao === "entrada"
      const lado = entrada ? res.entrada : res.saida
      const d = ajusteDaLinha(r, entrada, lado)
      if (!d) continue
      somar(lado.total, d)
      noMapa(lado.porCnpj, r.cnpj_outra_parte ?? "", d)
      noMapa(lado.porRegime, r.regime_outra_parte ?? "", d)
      noMapa(lado.porNcm, r.ncm ?? "", d)
      noMapa(lado.porDescricao, r.descricao_produto ?? "", d)
      noMapa(lado.porItem, chaveItem(r.descricao_produto ?? "", r.ncm ?? "", r.cnpj_outra_parte ?? ""), d)
      noMapa(lado.porTipo, tipoDaLinha(r.tipo_linha, r.tipo_operacao), d)
    }
    return res
  })
}

type Grupo = Record<string, string | number | boolean | null>

/** Aplica o ajuste aos grupos de uma consulta: cada grupo recebe o ajuste da sua chave. */
export function semEstimados<G extends Grupo>(grupos: G[], mapa: Map<string, Ajuste>, chave: (g: G) => string): G[] {
  return grupos.map((g) => {
    const d = mapa.get(chave(g))
    if (!d) return g
    const novo: Grupo = { ...g }
    for (const [k, v] of Object.entries(d)) if (k in novo) novo[k] = (typeof novo[k] === "number" ? (novo[k] as number) : 0) + v
    return novo as G
  })
}

/** Aplica um ajuste a uma soma única (sem agrupar). */
export function somaSemEstimados<S extends Record<string, number>>(s: S, d: Ajuste): S {
  const novo: Record<string, number> = { ...s }
  for (const [k, v] of Object.entries(d)) if (k in novo) novo[k] = (novo[k] ?? 0) + v
  return novo as S
}

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v))
export const chaves = {
  cnpj: (g: Grupo) => texto(g.cnpj_outra_parte),
  regime: (g: Grupo) => texto(g.regime_outra_parte),
  ncm: (g: Grupo) => texto(g.ncm),
  item: (g: Grupo) => chaveItem(texto(g.descricao_produto), texto(g.ncm), texto(g.cnpj_outra_parte)),
  tipo: (g: Grupo) => tipoDaLinha(g.tipo_linha, g.tipo_operacao),
}
