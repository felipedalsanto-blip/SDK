import "server-only"
import type { CalculoDetalhe, Metrica, Recorte } from "@pricetax/sdk"
import { ANO_ACAO, consultarTudo } from "./capitulos"
import { fator } from "./cclass"
import { IMPOSTOS, type Aliqs, type Precificacao, type RefNcm } from "./precificacao-calculo"

/*
 * Referências para precificar um produto novo, tiradas das vendas do cálculo:
 * - por NCM: o cClassTrib que a Pricetax calculou e as alíquotas efetivas de hoje e de cada ano;
 * - média das vendas, para quando o NCM não aparece no histórico;
 * - alíquota cheia de IBS e CBS de cada ano (tributo ÷ base × fator da classificação).
 * Alíquotas medidas sobre o valor desonerado (sem tributos), como no cálculo.
 */

type Grupo = Record<string, string | number | boolean | null>
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

const METRICAS = [
  "itens",
  "valor_ar",
  "valor_desonerado_ar",
  "valor_desonerado_dr",
  ...IMPOSTOS.flatMap((t) => [`valor_${t}_ar`, `valor_${t}_dr`]),
] as Metrica[]
// A alíquota que a própria API calcula, para medir a cheia nas vendas de tributação integral.
const METRICAS_ALIQ = ["aliq_ibs_dr", "aliq_cbs_dr"] as Metrica[]

type Somas = Record<string, number>
const somar = (alvo: Somas, g: Grupo) => {
  for (const m of METRICAS) alvo[m] = (alvo[m] ?? 0) + n(g[m])
}
const aliqs = (s: Somas, lado: "ar" | "dr"): Aliqs => {
  const base = s[`valor_desonerado_${lado}`] ?? 0
  return Object.fromEntries(IMPOSTOS.map((t) => [t, base > 0 ? (s[`valor_${t}_${lado}`] ?? 0) / base : 0])) as Aliqs
}

export async function montarPrecificacao(calculo: CalculoDetalhe, regime: Recorte["regime"]): Promise<Precificacao> {
  const id = calculo.id
  const todos = [...calculo.anos].sort((a, b) => a - b)
  const anos = todos.filter((a) => a >= ANO_ACAO).length ? todos.filter((a) => a >= ANO_ACAO) : todos

  const porNcm = new Map<string, { classes: Map<string, { itens: number; valor: number }>; ar: Somas; anos: Record<number, Somas> }>()
  const media: { ar: Somas; anos: Record<number, Somas> } = { ar: {}, anos: {} }
  const cheias: Precificacao["cheias"] = {}
  let parcial = false

  for (const [i, ano] of anos.entries()) {
    const r = await consultarTudo(id, {
      recorte: { regime, ano, cenario_vendas: "base", cenario_compras: "base" },
      sentido: "saida",
      agrupar_por: ["ncm", "cclass_calculado"],
      metricas: [...METRICAS, ...METRICAS_ALIQ],
    })
    parcial ||= r.parcial
    media.anos[ano] = {}
    const cheia = { ibs: { t: 0, b: 0 }, cbs: { t: 0, b: 0 } }
    const integral = { ibs: { t: 0, b: 0 }, cbs: { t: 0, b: 0 } }
    for (const g of r.grupos) {
      const ncm = texto(g.ncm) ?? "sem NCM"
      const cclass = texto(g.cclass_calculado)
      let ref = porNcm.get(ncm)
      if (!ref) porNcm.set(ncm, (ref = { classes: new Map(), ar: {}, anos: {} }))
      somar((ref.anos[ano] ??= {}), g)
      somar(media.anos[ano], g)
      // O lado AR não muda com o ano: soma uma vez só.
      if (i === 0) {
        somar(ref.ar, g)
        somar(media.ar, g)
        if (cclass) {
          const c = ref.classes.get(cclass) ?? { itens: 0, valor: 0 }
          ref.classes.set(cclass, { itens: c.itens + n(g.itens), valor: c.valor + n(g.valor_ar) })
        }
      }
      for (const t of ["ibs", "cbs"] as const) {
        const f = fator(cclass, t)
        if (!f) continue
        const aliq = g[`aliq_${t}_dr`]
        if (f === 1 && typeof aliq === "number" && aliq > 0) {
          integral[t].t += aliq * n(g.valor_desonerado_dr)
          integral[t].b += n(g.valor_desonerado_dr)
        }
        cheia[t].t += n(g[`valor_${t}_dr`])
        cheia[t].b += n(g.valor_desonerado_dr) * f
      }
    }
    // Primeiro a alíquota da API nas vendas de tributação integral; sem elas, tributo ÷ base ajustada.
    const medir = (t: "ibs" | "cbs") =>
      integral[t].b > 0 ? integral[t].t / integral[t].b : cheia[t].b > 0 ? cheia[t].t / cheia[t].b : null
    cheias[ano] = { ibs: medir("ibs"), cbs: medir("cbs") }
  }

  const ncms: RefNcm[] = [...porNcm.entries()]
    .map(([ncm, r]) => ({
      ncm,
      itens: r.ar.itens ?? 0,
      valorAr: r.ar.valor_ar ?? 0,
      classes: [...r.classes.entries()].map(([cclass, c]) => ({ cclass, ...c })).sort((a, b) => b.valor - a.valor),
      ar: aliqs(r.ar, "ar"),
      anos: Object.fromEntries(Object.entries(r.anos).map(([a, s]) => [a, aliqs(s, "dr")])),
    }))
    .sort((a, b) => b.valorAr - a.valorAr)

  return {
    anos,
    cheias,
    media: { ar: aliqs(media.ar, "ar"), anos: Object.fromEntries(Object.entries(media.anos).map(([a, s]) => [a, aliqs(s, "dr")])) },
    ncms,
    parcial,
  }
}
