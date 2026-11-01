import "server-only"
import type { Filtros, Metrica, Recorte } from "@pricetax/sdk"
import type {
  AnaliseClassificacao,
  CelulaCst,
  Estimativa,
  FornecedorCritico,
  ItemCritico,
  ParDivergente,
  PorTipo,
  TipoErro,
  PontoProjecao,
  ResumoClassificacao,
  Situacao,
} from "./classificacao"
import type { Sentido } from "./catalogo"
import { ORDEM_TIPOS } from "./classificacao"
import { CST, FONTE_TABELA, fator, nomeCclass, tipoDoPar, type Tributo } from "./cclass"
import { emCache, pricetax } from "./pricetax"

export type Grupo = Record<string, string | number | boolean | null>

const METRICAS = ["itens", "valor_dr", "valor_sem_iva_dr", "valor_ibs_dr", "valor_cbs_dr"] as const satisfies readonly Metrica[]
const LIMITE = 500

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

function situacao(nota: string | null, calculado: string | null): Situacao {
  if (!calculado) return "sem_calculo"
  if (!nota) return "sem_nota"
  return nota === calculado ? "conforme" : "divergente"
}

/**
 * Alíquota cheia (sem redução) de cada tributo no recorte, tirada dos próprios dados:
 * tributo calculado ÷ (base × fator da classificação calculada), nos grupos tributados.
 * Serve para estimar a nota quando a classificação correta não tributa (fator 0).
 */
function aliquotasCheias(grupos: Grupo[]): Record<Tributo, number | null> {
  const resultado = { ibs: null, cbs: null } as Record<Tributo, number | null>
  for (const t of ["ibs", "cbs"] as const) {
    let tributo = 0
    let base = 0
    for (const g of grupos) {
      const f = fator(texto(g.cclass_calculado), t)
      if (!f) continue
      tributo += n(g[`valor_${t}_dr`])
      base += n(g.valor_sem_iva_dr) * f
    }
    resultado[t] = base > 0 ? tributo / base : null
  }
  return resultado
}

/** Tributo pela nota × tributo correto num grupo divergente. */
export type EstimativaDetalhada = Estimativa & { porTributo: Record<Tributo, { nota: number; correto: number }> }

export function estimar(g: Grupo, sentido: "entrada" | "saida", cheias: Record<Tributo, number | null>): EstimativaDetalhada | null {
  const nota = texto(g.cclass_nota)
  const calculado = texto(g.cclass_calculado)
  let correto = 0
  let pelaNota = 0
  const porTributo = {} as Record<Tributo, { nota: number; correto: number }>
  for (const t of ["ibs", "cbs"] as const) {
    const fn = fator(nota, t)
    const fc = fator(calculado, t)
    if (fn === null || fc === null) return null
    const valor = n(g[`valor_${t}_dr`])
    let v: number
    if (fc > 0) v = (valor * fn) / fc
    else if (fn === 0) v = 0
    else if (cheias[t] === null) return null
    else v = n(g.valor_sem_iva_dr) * cheias[t]! * fn
    correto += valor
    pelaNota += v
    porTributo[t] = { nota: v, correto: valor }
  }
  const diferenca = pelaNota - correto
  // Venda: a nota destacar menos que o correto é tributo a recolher (perda); a mais, recuperável (ganho).
  // Compra: crédito a maior que o correto é risco de glosa (perda); a menor, crédito a recuperar (ganho).
  return { correto, pelaNota, impacto: sentido === "saida" ? diferenca : -diferenca, porTributo }
}

export const sentidoDe = (g: Grupo, padrao: Sentido) =>
  (g.tipo_movimentacao === "entrada" || g.tipo_movimentacao === "saida" ? g.tipo_movimentacao : padrao === "entrada" ? "entrada" : "saida") as
    | "entrada"
    | "saida"

const rotuloPar = (g: Grupo) => `${texto(g.cclass_nota)} → ${texto(g.cclass_calculado)}`

export type Base = { recorte: Recorte; sentido: Sentido; filtros?: Filtros }

export function consultarPares(id: string, base: Base) {
  const entrada = {
    ...base,
    agrupar_por: ["tipo_movimentacao", "cclass_nota", "cclass_calculado"] as const,
    metricas: [...METRICAS],
    ordenar_por: { metrica: "valor_dr" as const, direcao: "desc" as const },
    limite: LIMITE,
  }
  return emCache(`cclass-pares:${id}:${JSON.stringify(entrada)}`, 600, () =>
    pricetax().calculos.consultar(id, { ...entrada, agrupar_por: [...entrada.agrupar_por] }),
  )
}

export function analisarPares(grupos: Grupo[], sentido: Sentido) {
  const cheias = aliquotasCheias(grupos)
  const vazio = () => ({ itens: 0, valor: 0 })
  const resumo: ResumoClassificacao = {
    itens: 0,
    valor: 0,
    porSituacao: { conforme: vazio(), divergente: vazio(), sem_nota: vazio(), sem_calculo: vazio() },
    perda: 0,
    ganho: 0,
    naoEstimado: vazio(),
    porTipo: Object.fromEntries(ORDEM_TIPOS.map((t) => [t, { itens: 0, valor: 0, perda: 0, ganho: 0, pares: 0 }])) as Record<TipoErro, PorTipo>,
  }
  const pares: ParDivergente[] = []
  for (const g of grupos) {
    const s = situacao(texto(g.cclass_nota), texto(g.cclass_calculado))
    const itens = n(g.itens)
    const valor = n(g.valor_dr)
    resumo.itens += itens
    resumo.valor += valor
    resumo.porSituacao[s].itens += itens
    resumo.porSituacao[s].valor += valor
    if (s !== "divergente") continue

    const sent = sentidoDe(g, sentido)
    const estimativa = estimar(g, sent, cheias)
    const tipo = tipoDoPar(texto(g.cclass_nota), texto(g.cclass_calculado))
    const pt = resumo.porTipo[tipo]
    pt.itens += itens
    pt.valor += valor
    pt.pares += 1
    if (estimativa) {
      pt.perda += Math.max(0, -estimativa.impacto)
      pt.ganho += Math.max(0, estimativa.impacto)
    }
    if (estimativa) {
      resumo.perda += Math.max(0, -estimativa.impacto)
      resumo.ganho += Math.max(0, estimativa.impacto)
    } else {
      resumo.naoEstimado.itens += itens
      resumo.naoEstimado.valor += valor
    }
    pares.push({
      sentido: sent,
      tipo,
      cfops: [],
      nota: { codigo: texto(g.cclass_nota), nome: nomeCclass(texto(g.cclass_nota)) },
      calculado: { codigo: texto(g.cclass_calculado), nome: nomeCclass(texto(g.cclass_calculado)) },
      itens,
      valor,
      estimativa: estimativa && { correto: estimativa.correto, pelaNota: estimativa.pelaNota, impacto: estimativa.impacto },
    })
  }
  pares.sort((a, b) => (a.estimativa?.impacto ?? 0) - (b.estimativa?.impacto ?? 0) || b.valor - a.valor)
  return { resumo, pares, cheias, notasDivergentes: [...new Set(pares.map((p) => p.nota.codigo!).filter(Boolean))] }
}

/** Soma perda e ganho por uma chave (produto, fornecedor), só nos grupos divergentes. */
function agregar<T extends { itens: number; valor: number; perda: number; ganho: number; pares: string[]; porTipo: Partial<Record<TipoErro, PorTipo>>; cfops: string[] }>(
  grupos: Grupo[],
  sentido: Sentido,
  cheias: Record<Tributo, number | null>,
  chave: (g: Grupo) => string,
  novo: (g: Grupo) => Omit<T, "itens" | "valor" | "perda" | "ganho" | "pares" | "porTipo" | "cfops">,
): T[] {
  const mapa = new Map<string, T>()
  for (const g of grupos) {
    if (situacao(texto(g.cclass_nota), texto(g.cclass_calculado)) !== "divergente") continue
    const k = chave(g)
    const atual = mapa.get(k) ?? ({ ...novo(g), itens: 0, valor: 0, perda: 0, ganho: 0, pares: [], porTipo: {}, cfops: [] } as unknown as T)
    const e = estimar(g, sentidoDe(g, sentido), cheias)
    const tipo = tipoDoPar(texto(g.cclass_nota), texto(g.cclass_calculado))
    const pt = (atual.porTipo[tipo] ??= { itens: 0, valor: 0, perda: 0, ganho: 0, pares: 0 })
    atual.itens += n(g.itens)
    atual.valor += n(g.valor_dr)
    pt.itens += n(g.itens)
    pt.valor += n(g.valor_dr)
    if (e) {
      atual.perda += Math.max(0, -e.impacto)
      atual.ganho += Math.max(0, e.impacto)
      pt.perda += Math.max(0, -e.impacto)
      pt.ganho += Math.max(0, e.impacto)
    }
    const cfop = texto(g.cfop)
    if (cfop && !atual.cfops.includes(cfop)) atual.cfops.push(cfop)
    if (!atual.pares.includes(rotuloPar(g))) {
      atual.pares.push(rotuloPar(g))
      pt.pares += 1
    }
    mapa.set(k, atual)
  }
  return [...mapa.values()].sort((a, b) => b.perda - a.perda || b.ganho - a.ganho || b.valor - a.valor)
}

/** Análise completa de um recorte (um ano): resumo, matriz CST, pares, itens e fornecedores. */
export async function analisarClassificacao(id: string, base: Base): Promise<AnaliseClassificacao> {
  const api = pricetax().calculos
  const pares = await consultarPares(id, base)
  const { resumo, pares: divergentes, cheias, notasDivergentes } = analisarPares(pares.grupos, base.sentido)
  let parcial = pares.total_grupos > pares.grupos.length

  const cst = await emCache(`cclass-cst:${id}:${JSON.stringify(base)}`, 600, () =>
    api.consultar(id, {
      ...base,
      agrupar_por: ["cst_iva_nota", "cst_iva_calculado"],
      metricas: ["itens", "valor_dr"],
      ordenar_por: { metrica: "itens", direcao: "desc" },
      limite: LIMITE,
    }),
  )
  const celulas: CelulaCst[] = cst.grupos.map((g) => ({
    nota: texto(g.cst_iva_nota),
    calculado: texto(g.cst_iva_calculado),
    itens: n(g.itens),
    valor: n(g.valor_dr),
  }))

  let itens: ItemCritico[] = []
  let fornecedores: FornecedorCritico[] | null = base.sentido === "saida" ? null : []

  if (notasDivergentes.length > 0) {
    // Só os itens cuja classificação na nota aparece em alguma divergência: a API não filtra
    // "nota ≠ calculado", então o painel lê esses grupos e separa os divergentes.
    const filtros = { ...base.filtros, cclass_nota: notasDivergentes }
    const produtos = await emCache(`cclass-produtos:${id}:${JSON.stringify({ ...base, filtros })}`, 600, () =>
      api.consultar(id, {
        ...base,
        filtros,
        agrupar_por: ["tipo_movimentacao", "descricao_produto", "cclass_nota", "cclass_calculado"],
        metricas: [...METRICAS],
        ordenar_por: { metrica: "valor_dr", direcao: "desc" },
        limite: LIMITE,
      }),
    )
    parcial ||= produtos.total_grupos > produtos.grupos.length
    itens = agregar<ItemCritico>(
      produtos.grupos,
      base.sentido,
      cheias,
      (g) => `${sentidoDe(g, base.sentido)}|${texto(g.descricao_produto)}`,
      (g) => ({ sentido: sentidoDe(g, base.sentido), descricao: texto(g.descricao_produto) }),
    ).slice(0, 15)

    // CFOPs de cada par e de cada item: a consulta de cima já usa as 4 dimensões, então é outra.
    const cfops = await emCache(`cclass-cfops:${id}:${JSON.stringify({ ...base, filtros })}`, 600, () =>
      api.consultar(id, {
        ...base,
        filtros,
        agrupar_por: ["descricao_produto", "cclass_nota", "cclass_calculado", "cfop"],
        metricas: ["itens", "valor_dr"],
        ordenar_por: { metrica: "valor_dr", direcao: "desc" },
        limite: LIMITE,
      }),
    )
    const juntar = (lista: string[], v: string | null) => {
      if (v && !lista.includes(v) && lista.length < 8) lista.push(v)
    }
    for (const g of cfops.grupos) {
      const cfop = texto(g.cfop)
      const sent = cfop && /^[123]/.test(cfop) ? "entrada" : cfop && /^[567]/.test(cfop) ? "saida" : null
      for (const p of divergentes)
        if (p.nota.codigo === texto(g.cclass_nota) && p.calculado.codigo === texto(g.cclass_calculado) && (!sent || p.sentido === sent)) juntar(p.cfops, cfop)
      for (const it of itens)
        if (it.descricao === texto(g.descricao_produto) && it.pares.includes(rotuloPar(g)) && (!sent || it.sentido === sent)) juntar(it.cfops, cfop)
    }

    if (fornecedores) {
      const compras = await emCache(`cclass-fornecedores:${id}:${JSON.stringify({ ...base, filtros })}`, 600, () =>
        api.consultar(id, {
          ...base,
          sentido: "entrada",
          filtros,
          agrupar_por: ["cnpj_outra_parte", "cclass_nota", "cclass_calculado", "cfop"],
          metricas: [...METRICAS],
          ordenar_por: { metrica: "valor_dr", direcao: "desc" },
          limite: LIMITE,
        }),
      )
      parcial ||= compras.total_grupos > compras.grupos.length
      fornecedores = agregar<FornecedorCritico>(
        compras.grupos,
        "entrada",
        cheias,
        (g) => String(texto(g.cnpj_outra_parte)),
        (g) => ({ cnpj: texto(g.cnpj_outra_parte), razaoSocial: null }),
      ).slice(0, 10)
      // A razão social não é dimensão: lê uma linha de cada fornecedor do ranking (até 10 chamadas, em cache).
      for (const f of fornecedores) {
        if (!f.cnpj) continue
        f.razaoSocial = await emCache(`razao:${id}:${f.cnpj}`, 3600, async () => {
          const p = await api.pagina(id, {
            recorte: base.recorte,
            sentido: "entrada",
            filtros: { cnpj_outra_parte: [f.cnpj] },
            limite: 1,
          })
          return texto((p.linhas[0] as Record<string, unknown> | undefined)?.razao_social_outra_parte)
        })
      }
    }
  }

  const nomesCst = Object.fromEntries(
    [...new Set(celulas.flatMap((c) => [c.nota, c.calculado]).filter((c): c is string => !!c))].map((c) => [c, CST[c]?.nome ?? c]),
  )

  return {
    ano: base.recorte.ano,
    resumo,
    cst: celulas,
    nomesCst,
    pares: divergentes,
    itens,
    fornecedores,
    parcial,
    tabela: FONTE_TABELA,
  }
}

/** Perda e ganho estimados em cada ano da transição, com o fator para anualizar. */
export async function projetarClassificacao(id: string, base: Base, anos: number[], periodoMeses: number | null) {
  const fatorAnual = periodoMeses && periodoMeses > 0 ? 12 / periodoMeses : null
  const pontos: PontoProjecao[] = []
  // Em sequência, não em paralelo: até 9 consultas, dentro do limite de 60/min (e em cache).
  for (const ano of [...anos].sort((a, b) => a - b)) {
    const { grupos } = await consultarPares(id, { ...base, recorte: { ...base.recorte, ano } })
    const { resumo } = analisarPares(grupos, base.sentido)
    pontos.push({ ano, perda: resumo.perda, ganho: resumo.ganho, fatorAnual })
  }
  return pontos
}
