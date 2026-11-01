import "server-only"
import { cfopNaoOneroso, type DetalheNotas, type NotaDivergente, type TipoErro } from "./classificacao"
import { detalheCclass, fundamento, tipoDoPar } from "./cclass"
import { analisarPares, consultarPares, estimar, sentidoDe, type Base, type Grupo } from "./divergencias"
import { emCache, ErroDoPainel, pricetax } from "./pricetax"

/** O que foi clicado: um par, um item, um fornecedor ou um tipo de erro (combináveis). */
export type Alvo = {
  sentido?: "entrada" | "saida"
  nota?: string | null
  calculado?: string | null
  descricao?: string | null
  cnpj?: string | null
  tipo?: TipoErro
}

const LIMITE = 500
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

export function lerAlvo(v: unknown): Alvo {
  const a = (v ?? {}) as Record<string, unknown>
  const str = (x: unknown) => (typeof x === "string" && x.length <= 300 ? x : x === null ? null : undefined)
  const alvo: Alvo = {}
  if (a.sentido === "entrada" || a.sentido === "saida") alvo.sentido = a.sentido
  for (const k of ["nota", "calculado", "descricao", "cnpj"] as const) {
    const x = str(a[k])
    if (x !== undefined) alvo[k] = x
  }
  if (typeof a.tipo === "string") alvo.tipo = a.tipo as TipoErro
  if (!alvo.nota && !alvo.descricao && !alvo.cnpj && !alvo.tipo) throw new ErroDoPainel(400, "requisicao_invalida", "Diga o par, item, fornecedor ou tipo de erro.")
  return alvo
}

/** As notas (documentos) por trás de uma divergência, com nota × correto e o fundamento oficial. */
export async function detalharNotas(id: string, base: Base, alvo: Alvo): Promise<DetalheNotas> {
  const api = pricetax().calculos
  const { grupos } = await consultarPares(id, base)
  const { cheias, notasDivergentes, pares } = analisarPares(grupos, base.sentido)
  const codigosNota = alvo.nota ? [alvo.nota] : alvo.tipo ? [...new Set(pares.filter((p) => p.tipo === alvo.tipo).map((p) => p.nota.codigo!))] : notasDivergentes
  if (!codigosNota.length) return { notas: [], total: 0, parcial: false }

  const filtros: Record<string, (string | number | null)[]> = { ...base.filtros, cclass_nota: codigosNota }
  if (alvo.calculado) filtros.cclass_calculado = [alvo.calculado]
  if (alvo.sentido) filtros.tipo_movimentacao = [alvo.sentido]
  if (alvo.descricao !== undefined) filtros.descricao_produto = [alvo.descricao]
  if (alvo.cnpj !== undefined) filtros.cnpj_outra_parte = [alvo.cnpj]
  const sentido = alvo.sentido ?? base.sentido
  const consulta = (agrupar_por: Parameters<typeof api.consultar>[1]["agrupar_por"], metricas: Parameters<typeof api.consultar>[1]["metricas"]) => {
    const entrada = { ...base, sentido, filtros, agrupar_por, metricas, ordenar_por: { metrica: "valor_dr" as const, direcao: "desc" as const }, limite: LIMITE }
    return emCache(`cclass-notas:${id}:${JSON.stringify(entrada)}`, 600, () => api.consultar(id, entrada))
  }

  // A API agrupa por até 4 dimensões: três consultas, unidas pela chave do documento.
  const [valores, cabecalhos, itens] = await Promise.all([
    consulta(["chave_documento", "tipo_movimentacao", "cclass_nota", "cclass_calculado"], ["itens", "valor_dr", "valor_sem_iva_dr", "valor_ibs_dr", "valor_cbs_dr"]),
    consulta(["chave_documento", "numero_nf", "data_operacao", "cfop"], ["itens", "valor_dr"]),
    consulta(["chave_documento", "descricao_produto", "ncm", "cnpj_outra_parte"], ["itens", "valor_dr"]),
  ])

  const porChave = <T>(gs: Grupo[], f: (g: Grupo) => T) => {
    const m = new Map<string, T[]>()
    for (const g of gs) {
      const k = String(texto(g.chave_documento))
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(f(g))
    }
    return m
  }
  const cab = porChave(cabecalhos.grupos, (g) => ({ numero: texto(g.numero_nf), data: texto(g.data_operacao), cfop: texto(g.cfop) }))
  const its = porChave(itens.grupos, (g) => ({ descricao: texto(g.descricao_produto), ncm: texto(g.ncm), parceiro: texto(g.cnpj_outra_parte), valor: n(g.valor_dr) }))

  const notas: NotaDivergente[] = []
  for (const g of valores.grupos) {
    const cn = texto(g.cclass_nota)
    const cc = texto(g.cclass_calculado)
    if (!cn || !cc || cn === cc) continue
    const tipo = tipoDoPar(cn, cc)
    if (alvo.tipo && tipo !== alvo.tipo) continue
    const sent = sentidoDe(g, base.sentido)
    const e = estimar(g, sent, cheias)
    const k = String(texto(g.chave_documento))
    const c = cab.get(k) ?? []
    const i = its.get(k) ?? []
    const cfops = [...new Set(c.map((x) => x.cfop).filter((x): x is string => !!x))]
    const baseCalc = n(g.valor_sem_iva_dr)
    notas.push({
      chave: texto(g.chave_documento),
      numero: [...new Set(c.map((x) => x.numero).filter(Boolean))].join(", ") || null,
      data: c.map((x) => x.data).filter(Boolean).sort()[0] ?? null,
      cfops,
      parceiro: i.find((x) => x.parceiro)?.parceiro ?? null,
      sentido: sent,
      tipo,
      itens: i.slice(0, 20).map(({ descricao, ncm, valor }) => ({ descricao, ncm, valor })),
      nota: detalheCclass(cn),
      correto: detalheCclass(cc),
      base: baseCalc,
      valor: n(g.valor_dr),
      aliqIbs: baseCalc > 0 ? n(g.valor_ibs_dr) / baseCalc : null,
      aliqCbs: baseCalc > 0 ? n(g.valor_cbs_dr) / baseCalc : null,
      ibs: { nota: e ? e.porTributo.ibs.nota : null, correto: n(g.valor_ibs_dr) },
      cbs: { nota: e ? e.porTributo.cbs.nota : null, correto: n(g.valor_cbs_dr) },
      impacto: e ? e.impacto : null,
      possivelFalsoPositivo: cfops.some(cfopNaoOneroso),
      fundamento: fundamento(cc),
    })
  }
  notas.sort((a, b) => Math.abs(b.impacto ?? 0) - Math.abs(a.impacto ?? 0) || b.valor - a.valor)
  return {
    notas: notas.slice(0, 200),
    total: notas.length,
    parcial: [valores, cabecalhos, itens].some((r) => r.total_grupos > r.grupos.length) || notas.length > 200,
  }
}
