// Monta a DRE e o fluxo de caixa (formato de demonstrativo, com linhas que abrem até o tributo)
// a partir das somas da trilha. Sem acesso ao servidor: roda no navegador.
import type { Somas, Trilha } from "./capitulos"
import { TRIBUTOS } from "./tributos"

export type Linha = {
  id: string
  nome: string
  /** Um valor por coluna: AR (hoje) e cada ano. null = não se aplica. */
  valores: (number | null)[]
  tipo?: "resultado" | "total" | "percentual" | "info"
  filhos?: Linha[]
}

/** O lado AR (hoje) ou DR de uma soma, sem o sufixo: "valor", "debito_icms"… */
export function lado(s: Somas, l: "ar" | "dr"): Somas {
  const r: Somas = {}
  for (const [k, v] of Object.entries(s)) {
    if (k.endsWith(`_${l}`)) r[k.slice(0, -3)] = v
    else if (!k.endsWith("_ar") && !k.endsWith("_dr")) r[k] = v
  }
  return r
}

type Colunas = { vendas: Somas; compras: Somas; dr: boolean }[]

/** As colunas de um cenário: AR (hoje) e cada ano da trilha, já no lado certo. */
export function colunas(t: Trilha, cenarioId: string): Colunas {
  const c = t.cenarios.find((x) => x.id === cenarioId) ?? t.cenarios[0]
  return [
    { vendas: lado(t.ar.vendas, "ar"), compras: lado(t.ar.compras, "ar"), dr: false },
    ...t.anos.map((_, i) => ({ vendas: lado(c.vendas[i] ?? {}, "dr"), compras: lado(t.compras[i] ?? {}, "dr"), dr: true })),
  ]
}

const v0 = (s: Somas, k: string) => s[k] ?? 0
const ibsCbs = (s: Somas, prefixo: string) => v0(s, `${prefixo}_ibs`) + v0(s, `${prefixo}_cbs`)
const atuais = TRIBUTOS.filter((t) => t.id !== "ibs" && t.id !== "cbs")

/** Linhas por tributo, com uma linha de ajuste quando a soma não fecha com o total. */
function porTributo(cols: Colunas, id: string, total: (c: Colunas[number]) => number, valor: (c: Colunas[number], t: string) => number, lista = TRIBUTOS as readonly { id: string; nome: string }[], sinal = 1): Linha[] {
  const linhas: Linha[] = lista
    .map((t) => ({ id: `${id}-${t.id}`, nome: t.nome, valores: cols.map((c) => sinal * valor(c, t.id)) }))
    .filter((l) => l.valores.some((v) => Math.abs(v ?? 0) > 0.005))
  const ajuste = cols.map((c, i) => sinal * total(c) - linhas.reduce((s, l) => s + (l.valores[i] ?? 0), 0))
  if (ajuste.some((v) => Math.abs(v) > 1)) linhas.push({ id: `${id}-ajuste`, nome: "Outros e ajustes", valores: ajuste })
  return linhas
}

/** Premissas para chegar ao lucro líquido: a API não traz despesas operacionais, IR e CSLL. */
export type PremissasIr = {
  regime: string
  /** Meses do período analisado (o adicional de IRPJ vale acima de R$ 20 mil por mês). */
  meses: number
  despesas: { modo: "percentual" | "valor"; valor: number }
  /** Para a presunção do Lucro Presumido: comércio e indústria (8% e 12%) ou serviços (32% e 32%). */
  atividade: "comercio" | "servicos"
}

type Ir = { despesas: number; lair: number; baseIrpj: number; irpj15: number; adicional: number; baseCsll: number; csll: number } | null

/** IRPJ e CSLL de uma coluna, conforme o regime. No Simples Nacional, estão dentro do DAS. */
function calcularIr(p: PremissasIr, receitaBruta: number, receitaLiquida: number, lucroBruto: number): Ir {
  if (p.regime === "simplesNacional") return null
  const despesas = p.despesas.modo === "percentual" ? (p.despesas.valor / 100) * receitaLiquida : p.despesas.valor
  const lair = lucroBruto - despesas
  const limite = 20_000 * Math.max(1, p.meses)
  let baseIrpj: number
  let baseCsll: number
  if (p.regime === "lucroPresumido") {
    baseIrpj = receitaBruta * (p.atividade === "servicos" ? 0.32 : 0.08)
    baseCsll = receitaBruta * (p.atividade === "servicos" ? 0.32 : 0.12)
  } else {
    baseIrpj = Math.max(0, lair)
    baseCsll = Math.max(0, lair)
  }
  const irpj15 = 0.15 * baseIrpj
  const adicional = 0.1 * Math.max(0, baseIrpj - limite)
  return { despesas, lair, baseIrpj, irpj15, adicional, baseCsll, csll: 0.09 * baseCsll }
}

export function montarDre(t: Trilha, cenarioId: string, premissas?: PremissasIr): Linha[] {
  const cols = colunas(t, cenarioId)
  const receitaBruta = (c: Colunas[number]) => (c.dr ? v0(c.vendas, "valor_sem_iva") : v0(c.vendas, "valor"))
  const deducoes = (c: Colunas[number]) => Math.max(0, v0(c.vendas, "debito") - ibsCbs(c.vendas, "debito"))
  const receitaLiquida = (c: Colunas[number]) => receitaBruta(c) - deducoes(c)
  const custos = (c: Colunas[number]) => v0(c.compras, "custo")
  const lucro = (c: Colunas[number]) => receitaLiquida(c) - custos(c)
  return [
    {
      id: "rb",
      nome: "Receita bruta",
      tipo: "total",
      valores: cols.map(receitaBruta),
      filhos: [
        { id: "rb-vendas", nome: "Vendas (valor das notas)", valores: cols.map((c) => v0(c.vendas, "valor")) },
        { id: "rb-iva", nome: "(−) IBS e CBS cobrados por fora", valores: cols.map((c) => (c.dr ? -(v0(c.vendas, "valor") - v0(c.vendas, "valor_sem_iva")) : null)) },
      ],
    },
    {
      id: "ded",
      nome: "(−) Deduções de tributos",
      valores: cols.map((c) => -deducoes(c)),
      filhos: porTributo(cols, "ded", deducoes, (c, tr) => v0(c.vendas, `debito_${tr}`), atuais, -1),
    },
    { id: "rl", nome: "Receita líquida", tipo: "resultado", valores: cols.map(receitaLiquida) },
    {
      id: "custo",
      nome: "(−) Custos e despesas de compra",
      valores: cols.map((c) => -custos(c)),
      filhos: [
        { id: "custo-compras", nome: "Compras (valor das notas)", valores: cols.map((c) => -v0(c.compras, "valor")) },
        {
          id: "custo-cred",
          nome: "(+) Créditos recuperados",
          valores: cols.map((c) => v0(c.compras, "credito")),
          filhos: porTributo(cols, "custo-cred", (c) => v0(c.compras, "credito"), (c, tr) => v0(c.compras, `credito_${tr}`)),
        },
      ],
    },
    { id: "lb", nome: "Lucro bruto", tipo: "resultado", valores: cols.map(lucro) },
    { id: "mb", nome: "Margem bruta (sobre a receita líquida)", tipo: "percentual", valores: cols.map((c) => (receitaLiquida(c) ? lucro(c) / receitaLiquida(c) : null)) },
    ...linhasIr(cols.map((c) => (premissas ? calcularIr(premissas, receitaBruta(c), receitaLiquida(c), lucro(c)) : null)), cols.map(receitaLiquida), premissas),
    { id: "info-iva", nome: "IBS e CBS sobre as vendas (por fora, informativo)", tipo: "info", valores: cols.map((c) => (c.dr ? ibsCbs(c.vendas, "debito") : null)) },
    { id: "info-cred", nome: "Crédito de IBS e CBS nas compras (informativo)", tipo: "info", valores: cols.map((c) => (c.dr ? ibsCbs(c.compras, "credito") : null)) },
  ]
}

export function montarFluxo(t: Trilha, cenarioId: string, premissas?: PremissasIr): Linha[] {
  const cols = colunas(t, cenarioId)
  const clientes = (c: Colunas[number]) => v0(c.vendas, "valor")
  const fornecedores = (c: Colunas[number]) => v0(c.compras, "valor")
  const tributos = (c: Colunas[number]) => v0(c.vendas, "debito") - v0(c.compras, "credito")
  const geracao = (c: Colunas[number]) => clientes(c) - fornecedores(c) - tributos(c)
  return [
    {
      id: "cli",
      nome: "(+) Recebimento de clientes",
      tipo: "total",
      valores: cols.map(clientes),
      filhos: [
        { id: "cli-preco", nome: "Preço sem IBS e CBS", valores: cols.map((c) => (c.dr ? v0(c.vendas, "valor_sem_iva") : null)) },
        { id: "cli-iva", nome: "IBS e CBS cobrados do cliente", valores: cols.map((c) => (c.dr ? v0(c.vendas, "valor") - v0(c.vendas, "valor_sem_iva") : null)) },
      ],
    },
    {
      id: "forn",
      nome: "(−) Pagamento a fornecedores",
      tipo: "total",
      valores: cols.map((c) => -fornecedores(c)),
      filhos: [
        { id: "forn-base", nome: "Compras sem tributos", valores: cols.map((c) => -(v0(c.compras, "valor") - v0(c.compras, "valor_impostos"))) },
        {
          id: "forn-trib",
          nome: "Tributos pagos nas compras",
          valores: cols.map((c) => -v0(c.compras, "valor_impostos")),
          filhos: porTributo(cols, "forn-trib", (c) => v0(c.compras, "valor_impostos"), (c, tr) => v0(c.compras, `valor_${tr}`), TRIBUTOS, -1),
        },
      ],
    },
    {
      id: "trib",
      nome: "(−) Tributos recolhidos",
      tipo: "total",
      valores: cols.map((c) => -tributos(c)),
      filhos: [
        {
          id: "trib-deb",
          nome: "Débitos nas vendas",
          valores: cols.map((c) => -v0(c.vendas, "debito")),
          filhos: porTributo(cols, "trib-deb", (c) => v0(c.vendas, "debito"), (c, tr) => v0(c.vendas, `debito_${tr}`), TRIBUTOS, -1),
        },
        {
          id: "trib-cred",
          nome: "(+) Créditos nas compras",
          valores: cols.map((c) => v0(c.compras, "credito")),
          filhos: porTributo(cols, "trib-cred", (c) => v0(c.compras, "credito"), (c, tr) => v0(c.compras, `credito_${tr}`)),
        },
      ],
    },
    { id: "ger", nome: "(=) Geração de caixa operacional", tipo: "resultado", valores: cols.map(geracao) },
    { id: "ger-pct", nome: "Geração de caixa sobre o recebimento", tipo: "percentual", valores: cols.map((c) => (clientes(c) ? geracao(c) / clientes(c) : null)) },
    ...irNoCaixa(t, cenarioId, cols.map(geracao), premissas),
    {
      id: "info-estorno",
      nome: "Tributo das compras sem crédito (aproxima o estorno de crédito)",
      tipo: "info",
      valores: cols.map((c) => Math.max(0, v0(c.compras, "valor_impostos") - v0(c.compras, "credito"))),
    },
  ]
}

/** Uma linha do demonstrativo por id (para os gráficos). */
export function acharLinha(linhas: Linha[], id: string): Linha | undefined {
  for (const l of linhas) {
    if (l.id === id) return l
    const f = l.filhos && acharLinha(l.filhos, id)
    if (f) return f
  }
  return undefined
}

/** As linhas da DRE do lucro bruto ao lucro líquido. */
function linhasIr(irs: Ir[], receitas: number[], p?: PremissasIr): Linha[] {
  if (!p) return []
  if (p.regime === "simplesNacional") {
    return [{ id: "ir-simples", nome: "IRPJ e CSLL: no Simples Nacional, estão dentro do DAS", tipo: "info", valores: irs.map(() => null) }]
  }
  const presumido = p.regime === "lucroPresumido"
  const v = (f: (i: NonNullable<Ir>) => number) => irs.map((i) => (i ? f(i) : null))
  const liquido = v((i) => i.lair - i.irpj15 - i.adicional - i.csll)
  return [
    { id: "desp", nome: "(−) Despesas operacionais (informadas)", valores: v((i) => -i.despesas) },
    { id: "lair", nome: "Lucro antes do IR e da CSLL", tipo: "resultado", valores: v((i) => i.lair) },
    {
      id: "irpj",
      nome: "(−) IRPJ",
      valores: v((i) => -(i.irpj15 + i.adicional)),
      filhos: [
        { id: "irpj-base", nome: presumido ? `Base presumida (${p.atividade === "servicos" ? "32%" : "8%"} da receita bruta)` : "Base: lucro antes do IR e da CSLL", tipo: "info", valores: v((i) => i.baseIrpj) },
        { id: "irpj-15", nome: "IRPJ de 15%", valores: v((i) => -i.irpj15) },
        { id: "irpj-ad", nome: `Adicional de 10% (acima de R$ 20 mil por mês × ${p.meses})`, valores: v((i) => -i.adicional) },
      ],
    },
    {
      id: "csll",
      nome: "(−) CSLL",
      valores: v((i) => -i.csll),
      filhos: [
        { id: "csll-base", nome: presumido ? `Base presumida (${p.atividade === "servicos" ? "32%" : "12%"} da receita bruta)` : "Base: lucro antes do IR e da CSLL", tipo: "info", valores: v((i) => i.baseCsll) },
        { id: "csll-9", nome: "CSLL de 9%", valores: v((i) => -i.csll) },
      ],
    },
    { id: "ll", nome: "Lucro líquido", tipo: "resultado", valores: liquido },
    { id: "ml", nome: "Margem líquida (sobre a receita líquida)", tipo: "percentual", valores: liquido.map((l, k) => (l === null || !receitas[k] ? null : l / receitas[k])) },
  ]
}

/** IRPJ e CSLL da DRE saindo do caixa, e a geração de caixa depois deles. */
function irNoCaixa(t: Trilha, cenarioId: string, geracao: number[], p?: PremissasIr): Linha[] {
  if (!p || p.regime === "simplesNacional") return []
  const dre = montarDre(t, cenarioId, p)
  const irpj = acharLinha(dre, "irpj")?.valores ?? []
  const csll = acharLinha(dre, "csll")?.valores ?? []
  const pago = geracao.map((_, i) => (irpj[i] ?? 0) + (csll[i] ?? 0))
  return [
    {
      id: "ircs",
      nome: "(−) IRPJ e CSLL pagos",
      valores: pago,
      filhos: [
        { id: "ircs-irpj", nome: "IRPJ", valores: irpj },
        { id: "ircs-csll", nome: "CSLL", valores: csll },
      ],
    },
    { id: "ger-ir", nome: "(=) Geração de caixa depois do IR e da CSLL", tipo: "resultado", valores: geracao.map((g, i) => g + pago[i]) },
  ]
}
