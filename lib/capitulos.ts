import "server-only"
import type { CalculoDetalhe, EntradaConsulta, Metrica, Recorte } from "@pricetax/sdk"
import { numeroCsv, registrosCsv } from "./csv"
import { emCache, pricetax } from "./pricetax"
import { lado, receitaLiquidaDe } from "./demonstrativos"
import { METRICAS_DEBITO, METRICAS_DETALHE, TRIBUTOS } from "./tributos"

/*
 * Os quatro capítulos do Diagnóstico da Reforma (Compras, Vendas, DRE e Fluxo de Caixa),
 * montados só com o que a API de cálculos devolve. Convenções:
 * - AR = antes da reforma (regras de hoje); DR = depois, no ano do recorte.
 * - Compras e as listas de vendas são analisadas em 2027, o ano das ações.
 * - DRE e Fluxo de Caixa seguem de 2027 a 2033, nos três cenários de venda.
 * - Cenários de venda: Sem Ajuste = "sem_reajuste" (preço de hoje), Com Reajuste = "base"
 *   (Ajustado: sai o tributo atual, entra o novo, mantida a margem) e Preço Alvo = a margem
 *   criada no app (qualquer cenário com id próprio). Compras sempre no Ajustado.
 * - Custo Neutro: derivado aqui, não vem da API. É o Com Reajuste com o preço líquido mexido só
 *   pela variação do custo das compras, para zerar a diferença do lucro bruto (sem despesas).
 */

type Grupo = Record<string, string | number | boolean | null>
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

export const ANO_ACAO = 2027
const MAX_GRUPOS = 2000

export type CenarioVenda = { id: string; nome: string; rotulo: "Sem Ajuste" | "Com Reajuste" | "Preço Alvo" | "Custo Neutro" }

export const CUSTO_NEUTRO: CenarioVenda = { id: "custo_neutro", nome: "Repassa só a variação do custo das compras", rotulo: "Custo Neutro" }

/** Multiplica pelo fator os valores do lado DR (as chaves que terminam em _dr ou Dr), em qualquer profundidade. */
export function escalarDr<T>(x: T, k: number): T {
  if (Array.isArray(x)) return x.map((v) => escalarDr(v, k)) as T
  if (x && typeof x === "object") {
    return Object.fromEntries(
      Object.entries(x).map(([chave, v]) => [chave, typeof v === "number" && /(_dr|Dr|ibsCbs)$/.test(chave) && !/^(aliq|carga)_/.test(chave) ? v * k : escalarDr(v, k)]),
    ) as T
  }
  return x
}

/**
 * Fator do Custo Neutro num ano: quanto multiplicar as vendas do Com Reajuste para que a receita
 * líquida varie exatamente o que variou o custo das compras (lucro bruto igual ao de hoje).
 * Com Reajuste mantém a receita líquida de hoje; o fator só acrescenta (ou tira) a diferença de custo.
 */
function fatorCustoNeutro(vendasBase: Somas, compras: Somas): number {
  const rlHoje = receitaLiquidaDe(lado(vendasBase, "ar"), false)
  const rlBase = receitaLiquidaDe(lado(vendasBase, "dr"), true)
  const alvo = rlHoje + (compras.custo_dr ?? 0) - (compras.custo_ar ?? 0)
  return rlBase > 0 ? alvo / rlBase : 1
}

/** Os cenários de venda que o cálculo tem, na ordem do diagnóstico. */
export function cenariosDeVenda(calculo: CalculoDetalhe): CenarioVenda[] {
  const lista: CenarioVenda[] = []
  const achar = (id: string) => calculo.cenarios.find((c) => c.id === id)
  const sem = achar("sem_reajuste")
  const base = achar("base")
  if (sem) lista.push({ id: sem.id, nome: sem.nome, rotulo: "Sem Ajuste" })
  if (base) lista.push({ id: base.id, nome: base.nome, rotulo: "Com Reajuste" })
  const alvo = calculo.cenarios.find((c) => c.id !== "base" && c.id !== "sem_reajuste")
  if (alvo) lista.push({ id: alvo.id, nome: alvo.nome, rotulo: "Preço Alvo" })
  return lista
}

export function anoAcao(calculo: CalculoDetalhe) {
  return calculo.anos.includes(ANO_ACAO) ? ANO_ACAO : [...calculo.anos].sort((a, b) => a - b)[0]
}

/** Todas as páginas de uma consulta agrupada, até MAX_GRUPOS grupos. */
export async function consultarTudo(id: string, entrada: EntradaConsulta) {
  return emCache(`cap:${id}:${JSON.stringify(entrada)}`, 900, async () => {
    const grupos: Grupo[] = []
    let total = 0
    for (let offset = 0; offset < MAX_GRUPOS; offset += 500) {
      const r = await pricetax().calculos.consultar(id, { ...entrada, limite: 500, offset })
      grupos.push(...r.grupos)
      total = r.total_grupos
      if (grupos.length >= total) break
    }
    return { grupos, parcial: total > grupos.length }
  })
}

/** Razão social e regime de uma lista de CNPJs, lidos de uma exportação filtrada (uma chamada). */
async function nomesPorCnpj(id: string, recorte: Recorte, sentido: "entrada" | "saida", cnpjs: string[]) {
  const lista = [...new Set(cnpjs.filter(Boolean))].sort()
  if (lista.length === 0) return new Map<string, string>()
  const mapa = await emCache(`cap-nomes:${id}:${sentido}:${JSON.stringify(recorte)}:${lista.join(",")}`, 3600, async () => {
    const stream = await pricetax().calculos.exportar(id, { recorte, sentido, filtros: { cnpj_outra_parte: lista } })
    const nomes: [string, string][] = []
    const vistos = new Set<string>()
    for await (const r of registrosCsv(stream)) {
      const cnpj = r.cnpj_outra_parte
      if (cnpj && !vistos.has(cnpj) && r.razao_social_outra_parte) {
        vistos.add(cnpj)
        nomes.push([cnpj, r.razao_social_outra_parte])
      }
    }
    return nomes
  })
  return new Map(mapa)
}

const NOMES_REGIME: Record<string, string> = {
  simplesNacional: "Simples Nacional",
  lucroReal: "Lucro Real",
  lucroPresumido: "Lucro Presumido",
}
export const nomeRegime = (r: string | null) => (r ? (NOMES_REGIME[r] ?? r) : "Não informado")

/* ───────────────────────────── COMPRAS 2027 ───────────────────────────── */

export type Valores = {
  itens: number
  valorAr: number
  valorDr: number
  custoAr: number
  custoDr: number
  /** Impostos e créditos, totais e por tributo (AR e DR), para as colunas que expandem. */
  extras: Record<string, number>
}
export type PorRegime = Valores & { regime: string | null; nome: string; parceiros: number; creditoAr: number; creditoDr: number }
export type Parceiro = Valores & { cnpj: string | null; nome: string | null; regime: string | null }
export type Item = Valores & { descricao: string | null; ncm: string | null; cnpj: string | null; nome: string | null }
export type FatiaPareto = { chave: string; rotulo: string; valor: number; acumulado: number }
export type Pareto = { fatias: FatiaPareto[]; total: number; para80: number; universo: number }

const METRICAS_COMPRA = ["itens", "valor_ar", "valor_dr", "custo_ar", "custo_dr"] as const satisfies readonly Metrica[]

const valores = (g: Grupo): Valores => ({
  itens: n(g.itens),
  valorAr: n(g.valor_ar),
  valorDr: n(g.valor_dr),
  custoAr: n(g.custo_ar),
  custoDr: n(g.custo_dr),
  extras: Object.fromEntries(METRICAS_DETALHE.filter((m) => m in g).map((m) => [m, n(g[m])])),
})
const METRICAS_LISTA = [...METRICAS_COMPRA, ...METRICAS_DETALHE]

/** Ordena por uma diferença e fica com os N maiores (aumento) ou menores (redução). */
function topo<T>(lista: T[], dif: (x: T) => number, sentido: "aumento" | "reducao", qtd: number) {
  return lista
    .filter((x) => (sentido === "aumento" ? dif(x) > 0.005 : dif(x) < -0.005))
    .sort((a, b) => (sentido === "aumento" ? dif(b) - dif(a) : dif(a) - dif(b)))
    .slice(0, qtd)
}

/** Pareto: quantos grupos concentram 80% do total de uma medida (só valores positivos). */
function pareto(lista: { chave: string; rotulo: string; valor: number }[], mostrar = 15): Pareto {
  const positivos = lista.filter((x) => x.valor > 0.005).sort((a, b) => b.valor - a.valor)
  const total = positivos.reduce((s, x) => s + x.valor, 0)
  let acum = 0
  let para80 = 0
  const fatias = positivos.map((x, i) => {
    acum += x.valor
    if (!para80 && total && acum / total >= 0.8) para80 = i + 1
    return { ...x, acumulado: total ? acum / total : 0 }
  })
  return { fatias: fatias.slice(0, mostrar), total, para80, universo: positivos.length }
}

export type Compras = {
  ano: number
  cenario: string
  totais: Omit<Valores, "extras"> & { fornecedores: number; creditoAr: number; creditoDr: number }
  porRegime: PorRegime[]
  fornecedores: { aumento: Parceiro[]; reducao: Parceiro[] }
  itens: { aumento: Item[]; reducao: Item[] }
  simples: { aumento: Parceiro[]; reducao: Parceiro[] }
  pareto: {
    custoSobeFornecedor: Pareto
    custoSobeNcm: Pareto
    custoSobeGrupo: Pareto
    custoCaiFornecedor: Pareto
    custoCaiNcm: Pareto
  }
  parcial: boolean
}

export async function montarCompras(calculo: CalculoDetalhe, regime: Recorte["regime"]): Promise<Compras> {
  const id = calculo.id
  const ano = anoAcao(calculo)
  const recorte: Recorte = { regime, ano, cenario_vendas: "base", cenario_compras: "base" }
  const base = { recorte, sentido: "entrada" as const }

  const regimes = await consultarTudo(id, {
    ...base,
    agrupar_por: ["regime_outra_parte"],
    metricas: [...METRICAS_COMPRA, "parceiros_distintos", "credito_ar", "credito_dr"],
  })
  const porRegime: PorRegime[] = regimes.grupos
    .map((g) => ({
      ...valores(g),
      regime: texto(g.regime_outra_parte),
      nome: nomeRegime(texto(g.regime_outra_parte)),
      parceiros: n(g.parceiros_distintos),
      creditoAr: n(g.credito_ar),
      creditoDr: n(g.credito_dr),
    }))
    .sort((a, b) => b.valorAr - a.valorAr)

  const forn = await consultarTudo(id, {
    ...base,
    agrupar_por: ["cnpj_outra_parte", "regime_outra_parte"],
    metricas: METRICAS_LISTA,
    ordenar_por: { metrica: "valor_ar", direcao: "desc" },
  })
  const parceiros: Parceiro[] = forn.grupos.map((g) => ({
    ...valores(g),
    cnpj: texto(g.cnpj_outra_parte),
    nome: null,
    regime: texto(g.regime_outra_parte),
  }))

  const itensG = await consultarTudo(id, {
    ...base,
    agrupar_por: ["descricao_produto", "ncm", "cnpj_outra_parte"],
    metricas: METRICAS_LISTA,
    ordenar_por: { metrica: "valor_ar", direcao: "desc" },
  })
  const itens: Item[] = itensG.grupos.map((g) => ({
    ...valores(g),
    descricao: texto(g.descricao_produto),
    ncm: texto(g.ncm),
    cnpj: texto(g.cnpj_outra_parte),
    nome: null,
  }))

  const ncms = await consultarTudo(id, { ...base, agrupar_por: ["ncm"], metricas: [...METRICAS_COMPRA] })

  const difPreco = (x: Valores) => x.valorDr - x.valorAr
  const difCusto = (x: Valores) => x.custoDr - x.custoAr
  const simplesLista = parceiros.filter((p) => p.regime === "simplesNacional")
  const resultado = {
    fornecedores: { aumento: topo(parceiros, difPreco, "aumento", 10), reducao: topo(parceiros, difPreco, "reducao", 10) },
    itens: { aumento: topo(itens, difPreco, "aumento", 10), reducao: topo(itens, difPreco, "reducao", 10) },
    simples: { aumento: topo(simplesLista, difCusto, "aumento", 10), reducao: topo(simplesLista, difCusto, "reducao", 10) },
  }

  // Nomes só dos CNPJs que aparecem nas listas (uma exportação filtrada).
  const cnpjs = [
    ...resultado.fornecedores.aumento,
    ...resultado.fornecedores.reducao,
    ...resultado.simples.aumento,
    ...resultado.simples.reducao,
    ...resultado.itens.aumento,
    ...resultado.itens.reducao,
  ]
    .map((x) => x.cnpj)
    .filter((c): c is string => !!c)
  const nomes = await nomesPorCnpj(id, recorte, "entrada", cnpjs)
  const comNome = <T extends { cnpj: string | null; nome: string | null }>(l: T[]) => l.map((x) => ({ ...x, nome: (x.cnpj && nomes.get(x.cnpj)) || null }))

  const ncmLista = ncms.grupos.map((g) => ({ ncm: texto(g.ncm), ...valores(g) }))
  const grupos = new Map<string, number>()
  for (const x of ncmLista) {
    const cap = x.ncm ? x.ncm.slice(0, 2) : "sem NCM"
    grupos.set(cap, (grupos.get(cap) ?? 0) + difCusto(x))
  }

  const totais = porRegime.reduce(
    (t, r) => ({
      itens: t.itens + r.itens,
      valorAr: t.valorAr + r.valorAr,
      valorDr: t.valorDr + r.valorDr,
      custoAr: t.custoAr + r.custoAr,
      custoDr: t.custoDr + r.custoDr,
      fornecedores: t.fornecedores + r.parceiros,
      creditoAr: t.creditoAr + r.creditoAr,
      creditoDr: t.creditoDr + r.creditoDr,
    }),
    { itens: 0, valorAr: 0, valorDr: 0, custoAr: 0, custoDr: 0, fornecedores: 0, creditoAr: 0, creditoDr: 0 },
  )

  const rotuloForn = (p: Parceiro) => (p.cnpj && nomes.get(p.cnpj)) || p.cnpj || "Sem CNPJ"
  return {
    ano,
    cenario: calculo.cenarios.find((c) => c.id === "base")?.nome ?? "Ajustado",
    totais,
    porRegime,
    fornecedores: { aumento: comNome(resultado.fornecedores.aumento), reducao: comNome(resultado.fornecedores.reducao) },
    itens: { aumento: comNome(resultado.itens.aumento), reducao: comNome(resultado.itens.reducao) },
    simples: { aumento: comNome(resultado.simples.aumento), reducao: comNome(resultado.simples.reducao) },
    pareto: {
      custoSobeFornecedor: pareto(parceiros.map((p) => ({ chave: String(p.cnpj), rotulo: rotuloForn(p), valor: difCusto(p) }))),
      custoSobeNcm: pareto(ncmLista.map((x) => ({ chave: String(x.ncm), rotulo: x.ncm ?? "Sem NCM", valor: difCusto(x) }))),
      custoSobeGrupo: pareto([...grupos].map(([k, v]) => ({ chave: k, rotulo: k === "sem NCM" ? "Sem NCM" : `Capítulo ${k}`, valor: v }))),
      custoCaiFornecedor: pareto(parceiros.map((p) => ({ chave: String(p.cnpj), rotulo: rotuloForn(p), valor: -difCusto(p) }))),
      custoCaiNcm: pareto(ncmLista.map((x) => ({ chave: String(x.ncm), rotulo: x.ncm ?? "Sem NCM", valor: -difCusto(x) }))),
    },
    parcial: regimes.parcial || forn.parcial || itensG.parcial || ncms.parcial,
  }
}

/* ───────────────────────────── VENDAS 2027 ───────────────────────────── */

export type TotaisVenda = {
  clientes: number
  itens: number
  valorAr: number
  valorDr: number
  tributosAr: number
  tributosDr: number
  /** IBS + CBS destacados por fora no preço de 2027. */
  ibsCbs: number
}
export type VendaPorRegime = TotaisVenda & { regime: string | null; nome: string }
export type Desvio = {
  ncm: string
  valor: number
  min: { cfop: string | null; regime: string; carga: number; valor: number }
  max: { cfop: string | null; regime: string; carga: number; valor: number }
  amplitude: number
}

export type Vendas = {
  ano: number
  cenarios: (CenarioVenda & { totais: TotaisVenda; porRegime: VendaPorRegime[] })[]
  cenario: CenarioVenda
  clientes: { aumento: Parceiro[]; reducao: Parceiro[] }
  itens: { aumento: Item[]; reducao: Item[] }
  simples: { aumento: Parceiro[]; reducao: Parceiro[] }
  desvios: Desvio[]
  /** Valor das vendas e tributo de cada item (AR e DR), base do custo do cliente por perfil. */
  custoCliente: Record<string, number>
  pareto: { precoSobeCliente: Pareto; precoSobeNcm: Pareto; precoSobeGrupo: Pareto; precoCaiCliente: Pareto; precoCaiNcm: Pareto }
  parcial: boolean
}

const METRICAS_VENDA_REGIME = [
  "itens",
  "parceiros_distintos",
  "valor_ar",
  "valor_dr",
  "debito_ar",
  "debito_dr",
  "valor_ibs_dr",
  "valor_cbs_dr",
] as const satisfies readonly Metrica[]

export async function montarVendas(calculo: CalculoDetalhe, regime: Recorte["regime"], cenarioId: string, qtd: number): Promise<Vendas> {
  const id = calculo.id
  const ano = anoAcao(calculo)
  const cenarios = cenariosDeVenda(calculo)
  const temBase = cenarios.some((c) => c.id === "base")
  // Custo Neutro: lê o Com Reajuste e multiplica o lado DR pelo fator do ano.
  const neutro = cenarioId === CUSTO_NEUTRO.id && temBase
  const k = temBase
    ? fatorCustoNeutro(
        await somas(id, { regime, ano, cenario_vendas: "base", cenario_compras: "base" }, "saida"),
        await somas(id, { regime, ano, cenario_vendas: "base", cenario_compras: "base" }, "entrada"),
      )
    : 1
  const cenario = neutro ? CUSTO_NEUTRO : (cenarios.find((c) => c.id === cenarioId) ?? cenarios.find((c) => c.id === "base") ?? cenarios[0])
  const recorteDe = (c: string): Recorte => ({ regime, ano, cenario_vendas: c, cenario_compras: "base" })

  // Volume por regime do cliente, nos três cenários (uma consulta por cenário).
  const porCenario = []
  for (const c of cenarios) {
    const r = await consultarTudo(id, {
      recorte: recorteDe(c.id),
      sentido: "saida",
      agrupar_por: ["regime_outra_parte"],
      metricas: [...METRICAS_VENDA_REGIME],
    })
    const porRegime: VendaPorRegime[] = r.grupos
      .map((g) => ({
        regime: texto(g.regime_outra_parte),
        nome: nomeRegime(texto(g.regime_outra_parte)),
        clientes: n(g.parceiros_distintos),
        itens: n(g.itens),
        valorAr: n(g.valor_ar),
        valorDr: n(g.valor_dr),
        tributosAr: n(g.debito_ar),
        tributosDr: n(g.debito_dr),
        ibsCbs: n(g.valor_ibs_dr) + n(g.valor_cbs_dr),
      }))
      .sort((a, b) => b.valorAr - a.valorAr)
    const totais = porRegime.reduce(
      (t, x) => ({
        clientes: t.clientes + x.clientes,
        itens: t.itens + x.itens,
        valorAr: t.valorAr + x.valorAr,
        valorDr: t.valorDr + x.valorDr,
        tributosAr: t.tributosAr + x.tributosAr,
        tributosDr: t.tributosDr + x.tributosDr,
        ibsCbs: t.ibsCbs + x.ibsCbs,
      }),
      { clientes: 0, itens: 0, valorAr: 0, valorDr: 0, tributosAr: 0, tributosDr: 0, ibsCbs: 0 },
    )
    porCenario.push({ ...c, totais, porRegime })
    if (c.id === "base") porCenario.push(escalarDr({ ...CUSTO_NEUTRO, totais, porRegime }, k))
  }

  const recorte = recorteDe(neutro ? "base" : cenario.id)
  const kLista = neutro ? k : 1
  const base = { recorte, sentido: "saida" as const }

  // Custo do cliente: o valor das vendas e cada tributo da nota, para aplicar os créditos de cada perfil.
  const metricasCliente = ["valor_ar", "valor_dr", ...TRIBUTOS.flatMap((t) => [`valor_${t.id}_ar`, `valor_${t.id}_dr`])] as Metrica[]
  const custoCliente = escalarDr(await emCache(`cap-custo-cliente:${id}:${JSON.stringify(recorte)}`, 900, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { ...base, metricas: metricasCliente })
    const g = grupos[0] ?? {}
    return Object.fromEntries(metricasCliente.map((m) => [m, n(g[m])])) as Record<string, number>
  }), kLista)
  const cli = await consultarTudo(id, {
    ...base,
    agrupar_por: ["cnpj_outra_parte", "regime_outra_parte"],
    metricas: METRICAS_LISTA,
    ordenar_por: { metrica: "valor_ar", direcao: "desc" },
  })
  const clientes: Parceiro[] = escalarDr(cli.grupos, kLista).map((g) => ({ ...valores(g), cnpj: texto(g.cnpj_outra_parte), nome: null, regime: texto(g.regime_outra_parte) }))
  const itensG = await consultarTudo(id, {
    ...base,
    agrupar_por: ["descricao_produto", "ncm", "cnpj_outra_parte"],
    metricas: METRICAS_LISTA,
    ordenar_por: { metrica: "valor_ar", direcao: "desc" },
  })
  const itens: Item[] = escalarDr(itensG.grupos, kLista).map((g) => ({ ...valores(g), descricao: texto(g.descricao_produto), ncm: texto(g.ncm), cnpj: texto(g.cnpj_outra_parte), nome: null }))
  const ncms = await consultarTudo(id, { ...base, agrupar_por: ["ncm"], metricas: [...METRICAS_COMPRA] })

  // Desvios: o mesmo NCM com carga diferente conforme o destino (CFOP) e o regime do cliente.
  const desv = await consultarTudo(id, {
    ...base,
    agrupar_por: ["ncm", "cfop", "regime_outra_parte"],
    metricas: ["itens", "valor_dr", "carga_efetiva_dr"],
    ordenar_por: { metrica: "valor_dr", direcao: "desc" },
  })
  const porNcm = new Map<string, Grupo[]>()
  for (const g of desv.grupos) {
    const k = texto(g.ncm)
    if (!k || g.carga_efetiva_dr === null) continue
    porNcm.set(k, [...(porNcm.get(k) ?? []), g])
  }
  const desvios: Desvio[] = []
  for (const [ncm, gs] of porNcm) {
    if (gs.length < 2) continue
    const ordenados = [...gs].sort((a, b) => n(a.carga_efetiva_dr) - n(b.carga_efetiva_dr))
    const lo = ordenados[0]
    const hi = ordenados[ordenados.length - 1]
    const amplitude = n(hi.carga_efetiva_dr) - n(lo.carga_efetiva_dr)
    if (amplitude < 0.005) continue
    const fmt = (g: Grupo) => ({ cfop: texto(g.cfop), regime: nomeRegime(texto(g.regime_outra_parte)), carga: n(g.carga_efetiva_dr), valor: n(g.valor_dr) })
    desvios.push({ ncm, valor: gs.reduce((s, g) => s + n(g.valor_dr), 0), min: fmt(lo), max: fmt(hi), amplitude })
  }
  desvios.sort((a, b) => b.amplitude * b.valor - a.amplitude * a.valor)

  const difPreco = (x: Valores) => x.valorDr - x.valorAr
  const simplesLista = clientes.filter((p) => p.regime === "simplesNacional")
  const listas = {
    clientes: { aumento: topo(clientes, difPreco, "aumento", qtd), reducao: topo(clientes, difPreco, "reducao", qtd) },
    itens: { aumento: topo(itens, difPreco, "aumento", qtd), reducao: topo(itens, difPreco, "reducao", qtd) },
    simples: { aumento: topo(simplesLista, difPreco, "aumento", qtd), reducao: topo(simplesLista, difPreco, "reducao", qtd) },
  }
  const cnpjs = [...listas.clientes.aumento, ...listas.clientes.reducao, ...listas.simples.aumento, ...listas.simples.reducao, ...listas.itens.aumento, ...listas.itens.reducao]
    .map((x) => x.cnpj)
    .filter((c): c is string => !!c)
  const nomes = await nomesPorCnpj(id, recorte, "saida", cnpjs)
  const comNome = <T extends { cnpj: string | null; nome: string | null }>(l: T[]) => l.map((x) => ({ ...x, nome: (x.cnpj && nomes.get(x.cnpj)) || null }))
  const rotuloCli = (p: Parceiro) => (p.cnpj && nomes.get(p.cnpj)) || p.cnpj || "Sem CNPJ"

  const ncmLista = escalarDr(ncms.grupos, kLista).map((g) => ({ ncm: texto(g.ncm), ...valores(g) }))
  const grupos = new Map<string, number>()
  for (const x of ncmLista) {
    const cap = x.ncm ? x.ncm.slice(0, 2) : "sem NCM"
    grupos.set(cap, (grupos.get(cap) ?? 0) + difPreco(x))
  }

  return {
    ano,
    cenarios: porCenario,
    cenario,
    clientes: { aumento: comNome(listas.clientes.aumento), reducao: comNome(listas.clientes.reducao) },
    itens: { aumento: comNome(listas.itens.aumento), reducao: comNome(listas.itens.reducao) },
    simples: { aumento: comNome(listas.simples.aumento), reducao: comNome(listas.simples.reducao) },
    desvios: desvios.slice(0, 15),
    custoCliente,
    pareto: {
      precoSobeCliente: pareto(clientes.map((p) => ({ chave: String(p.cnpj), rotulo: rotuloCli(p), valor: difPreco(p) }))),
      precoSobeNcm: pareto(ncmLista.map((x) => ({ chave: String(x.ncm), rotulo: x.ncm ?? "Sem NCM", valor: difPreco(x) }))),
      precoSobeGrupo: pareto([...grupos].map(([k, v]) => ({ chave: k, rotulo: k === "sem NCM" ? "Sem NCM" : `Capítulo ${k}`, valor: v }))),
      precoCaiCliente: pareto(clientes.map((p) => ({ chave: String(p.cnpj), rotulo: rotuloCli(p), valor: -difPreco(p) }))),
      precoCaiNcm: pareto(ncmLista.map((x) => ({ chave: String(x.ncm), rotulo: x.ncm ?? "Sem NCM", valor: -difPreco(x) }))),
    },
    parcial: cli.parcial || itensG.parcial || ncms.parcial || desv.parcial,
  }
}

/* ───────────────────────── DRE e FLUXO DE CAIXA (2027 a 2033) ───────────────────────── */

/** Somas de um recorte, por nome de métrica. */
export type Somas = Record<string, number>

/**
 * A base da DRE e do fluxo de caixa: as vendas de cada ano em cada cenário e as compras de cada
 * ano (iguais nos três cenários de venda), com o detalhe por tributo. A montagem das linhas fica
 * no navegador, a partir destas somas.
 */
export type Trilha = {
  anos: number[]
  ar: { vendas: Somas; compras: Somas }
  compras: Somas[]
  cenarios: (CenarioVenda & { vendas: Somas[] })[]
}

const METRICAS_SAIDA = [
  "itens",
  "valor_ar",
  "valor_dr",
  "valor_sem_iva_dr",
  "valor_impostos_ar",
  "valor_impostos_dr",
  "debito_ar",
  "debito_dr",
  ...METRICAS_DEBITO,
] as Metrica[]
const METRICAS_ENTRADA = [
  "itens",
  "valor_ar",
  "valor_dr",
  "valor_impostos_ar",
  "valor_impostos_dr",
  "credito_ar",
  "credito_dr",
  "custo_ar",
  "custo_dr",
  ...METRICAS_DETALHE.filter((m) => !["valor_impostos_ar", "valor_impostos_dr", "credito_ar", "credito_dr"].includes(m)),
] as Metrica[]

function somas(id: string, recorte: Recorte, sentido: "entrada" | "saida") {
  const metricas = sentido === "saida" ? METRICAS_SAIDA : METRICAS_ENTRADA
  return emCache(`cap-somas:${id}:${sentido}:${JSON.stringify(recorte)}`, 900, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { recorte, sentido, metricas })
    const g = grupos[0] ?? {}
    return Object.fromEntries(metricas.map((m) => [m, n(g[m])])) as Somas
  })
}

export async function montarTrilha(calculo: CalculoDetalhe, regime: Recorte["regime"]): Promise<Trilha> {
  const id = calculo.id
  const todos = [...calculo.anos].sort((a, b) => a - b)
  const anos = todos.filter((a) => a >= ANO_ACAO).length ? todos.filter((a) => a >= ANO_ACAO) : todos
  const cenarios = cenariosDeVenda(calculo)
  // Compras: uma consulta por ano (o cenário de venda não muda as compras).
  const compras: Somas[] = []
  for (const ano of anos) compras.push(await somas(id, { regime, ano, cenario_vendas: "base", cenario_compras: "base" }, "entrada"))
  // Vendas: uma consulta por ano e cenário (até 7 × 3), em sequência e com cache.
  const resultado: Trilha["cenarios"] = []
  for (const c of cenarios) {
    const vendas: Somas[] = []
    for (const ano of anos) vendas.push(await somas(id, { regime, ano, cenario_vendas: c.id, cenario_compras: "base" }, "saida"))
    resultado.push({ ...c, vendas })
  }
  const base = resultado.find((c) => c.id === "base")
  if (base) {
    resultado.push({ ...CUSTO_NEUTRO, vendas: base.vendas.map((v, i) => escalarDr(v, fatorCustoNeutro(v, compras[i] ?? {}))) })
  }
  return {
    anos,
    ar: { vendas: resultado[0]?.vendas[0] ?? {}, compras: compras[0] ?? {} },
    compras,
    cenarios: resultado,
  }
}

/* ───────────────────────────── ESTORNO DE DÉBITO ───────────────────────────── */

export type Estorno = {
  cenario: string
  ar: { destacado: number; devido: number; estorno: number; vendas: number }
  anos: { ano: number; destacado: number; devido: number; estorno: number }[]
}

/**
 * Estorno de débito: o tributo destacado na nota de venda menos o que a empresa de fato deve
 * (benefícios na saída). Não há métrica pronta, então soma as colunas imposto_nota_* e debito_*
 * da exportação de vendas de cada ano, no cenário Sem Ajuste (preço de hoje, para isolar o efeito).
 */
export async function montarEstorno(calculo: CalculoDetalhe, regime: Recorte["regime"]): Promise<Estorno> {
  const id = calculo.id
  const cenarios = cenariosDeVenda(calculo)
  const cenario = cenarios.find((c) => c.rotulo === "Sem Ajuste") ?? cenarios[0]
  const anos = [...calculo.anos].sort((a, b) => a - b).filter((a) => a >= ANO_ACAO)
  let ar: Estorno["ar"] | null = null
  const pontos: Estorno["anos"] = []
  for (const ano of anos) {
    const recorte: Recorte = { regime, ano, cenario_vendas: cenario.id, cenario_compras: "base" }
    const soma = await emCache(`cap-estorno:${id}:${JSON.stringify(recorte)}`, 1800, async () => {
      const stream = await pricetax().calculos.exportar(id, { recorte, sentido: "saida" })
      const s = { notaAr: 0, notaDr: 0, debitoAr: 0, debitoDr: 0, vendasAr: 0 }
      for await (const r of registrosCsv(stream)) {
        s.notaAr += numeroCsv(r.imposto_nota_ar)
        s.notaDr += numeroCsv(r.imposto_nota_dr)
        s.debitoAr += numeroCsv(r.debito_ar)
        s.debitoDr += numeroCsv(r.debito_dr)
        s.vendasAr += numeroCsv(r.valor_ar)
      }
      return s
    })
    ar ??= { destacado: soma.notaAr, devido: soma.debitoAr, estorno: Math.max(0, soma.notaAr - soma.debitoAr), vendas: soma.vendasAr }
    pontos.push({ ano, destacado: soma.notaDr, devido: soma.debitoDr, estorno: Math.max(0, soma.notaDr - soma.debitoDr) })
  }
  return { cenario: cenario?.nome ?? "Sem Reajuste", ar: ar!, anos: pontos }
}


/* ───────────────────────────── FICHAS (fornecedor/cliente ↔ item) ───────────────────────────── */

/** Soma de um recorte filtrado, com tudo que a memória de cálculo AR × DR precisa. */
export type Memoria = Record<string, number>

export type Nota = {
  data: string | null
  cnpj: string | null
  nome: string | null
  quantidade: number
  valorAr: number
  valorDr: number
  custoAr: number
  custoDr: number
  cfop: string | null
}

export type Ficha = {
  tipo: "parceiro" | "item"
  sentido: "entrada" | "saida"
  ano: number
  cenario: string
  titulo: string
  sub: string | null
  regime: string | null
  memoria: Memoria
  /** Na ficha do parceiro: os itens dele. Na do item: os parceiros que têm o item. */
  itens: Item[]
  parceiros: Parceiro[]
  notas: Nota[]
  parcial: boolean
}

const TRIB = ["icms", "icms_st", "icms_difal", "iss", "ipi", "pis_cofins", "ibs", "cbs"]
const METRICAS_MEMORIA_BASE = [
  "itens",
  "quantidade",
  "valor_ar",
  "valor_dr",
  "valor_desonerado_ar",
  "valor_desonerado_dr",
  "valor_sem_iva_dr",
  "valor_impostos_ar",
  "valor_impostos_dr",
  "carga_efetiva_ar",
  "carga_efetiva_dr",
  ...TRIB.flatMap((t) => [`valor_${t}_ar`, `valor_${t}_dr`, `aliq_${t}_ar`, `aliq_${t}_dr`]),
] as Metrica[]
const METRICAS_MEMORIA: Record<"entrada" | "saida", Metrica[]> = {
  entrada: [...METRICAS_MEMORIA_BASE, "credito_ar", "credito_dr", "custo_ar", "custo_dr", ...(TRIB.flatMap((t) => [`credito_${t}_ar`, `credito_${t}_dr`]) as Metrica[])],
  saida: [...METRICAS_MEMORIA_BASE, "debito_ar", "debito_dr", ...(TRIB.flatMap((t) => [`debito_${t}_ar`, `debito_${t}_dr`]) as Metrica[])],
}

export async function montarFicha(
  calculo: CalculoDetalhe,
  regime: Recorte["regime"],
  sentido: "entrada" | "saida",
  cenarioId: string,
  tipo: "parceiro" | "item",
  valor: string,
): Promise<Ficha> {
  const id = calculo.id
  const ano = anoAcao(calculo)
  const cenario = sentido === "saida" && calculo.cenarios.some((c) => c.id === cenarioId) ? cenarioId : "base"
  const recorte: Recorte = { regime, ano, cenario_vendas: cenario, cenario_compras: "base" }
  const filtros: Record<string, (string | number | null)[]> = { [tipo === "parceiro" ? "cnpj_outra_parte" : "descricao_produto"]: [valor] }
  const base = { recorte, sentido, filtros }

  // A memória de cálculo: uma soma única do recorte filtrado (com alíquotas efetivas ponderadas).
  const memoria = await emCache(`ficha-mem:${id}:${JSON.stringify(base)}`, 600, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { ...base, metricas: METRICAS_MEMORIA[sentido] })
    const g = grupos[0] ?? {}
    return Object.fromEntries(METRICAS_MEMORIA[sentido].map((m) => [m, n(g[m])])) as Memoria
  })

  // O outro lado: itens do parceiro, ou parceiros do item.
  const lista = await consultarTudo(id, {
    ...base,
    agrupar_por: tipo === "parceiro" ? ["descricao_produto", "ncm"] : ["cnpj_outra_parte", "regime_outra_parte"],
    metricas: METRICAS_LISTA,
    ordenar_por: { metrica: "valor_ar", direcao: "desc" },
  })

  // As primeiras notas, para rastrear a origem dos números.
  const pagina = await emCache(`ficha-notas:${id}:${JSON.stringify(base)}`, 600, () => pricetax().calculos.pagina(id, { ...base, limite: 25 }))
  const notas: Nota[] = pagina.linhas.map((l) => {
    const r = l as Record<string, unknown>
    return {
      data: texto(r.data_operacao),
      cnpj: texto(r.cnpj_outra_parte),
      nome: texto(r.razao_social_outra_parte),
      quantidade: n(r.quantidade),
      valorAr: n(r.valor_ar),
      valorDr: n(r.valor_dr),
      custoAr: n(r.custo_ar),
      custoDr: n(r.custo_dr),
      cfop: texto(r.cfop),
    }
  })

  const primeira = pagina.linhas[0] as Record<string, unknown> | undefined
  if (tipo === "parceiro") {
    const itens: Item[] = lista.grupos.map((g) => ({ ...valores(g), descricao: texto(g.descricao_produto), ncm: texto(g.ncm), cnpj: valor, nome: null }))
    const nome = texto(primeira?.razao_social_outra_parte)
    return {
      tipo,
      sentido,
      ano,
      cenario: calculo.cenarios.find((c) => c.id === cenario)?.nome ?? cenario,
      titulo: nome ?? valor,
      sub: valor,
      regime: texto(primeira?.regime_outra_parte),
      memoria,
      itens: itens.map((i) => ({ ...i, nome })),
      parceiros: [],
      notas,
      parcial: lista.parcial,
    }
  }
  const parceiros: Parceiro[] = lista.grupos.map((g) => ({ ...valores(g), cnpj: texto(g.cnpj_outra_parte), nome: null, regime: texto(g.regime_outra_parte) }))
  const nomes = await nomesPorCnpj(id, recorte, sentido, parceiros.slice(0, 100).map((p) => p.cnpj ?? ""))
  return {
    tipo,
    sentido,
    ano,
    cenario: calculo.cenarios.find((c) => c.id === cenario)?.nome ?? cenario,
    titulo: valor,
    sub: texto(primeira?.ncm) ? `NCM ${texto(primeira?.ncm)}` : null,
    regime: null,
    memoria,
    itens: [],
    parceiros: parceiros.map((p) => ({ ...p, nome: (p.cnpj && nomes.get(p.cnpj)) || null })),
    notas,
    parcial: lista.parcial,
  }
}
