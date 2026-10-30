import "server-only"
import type { CalculoDetalhe, Metrica, Recorte } from "@pricetax/sdk"
import { analisarClassificacao, impactoClassificacao } from "./divergencias"
import { emCache, pricetax } from "./pricetax"

/**
 * DJF, Dinheiro Jogado Fora: o que a empresa deixa de ganhar ou paga a mais sem necessidade.
 * Cada ramo vem de uma comparação entre dois resultados da própria API:
 *
 * - repasse: custo das compras com o fornecedor repassando os novos tributos sobre o valor cheio
 *   (cenário Sem Reajuste, "o pior cenário" na documentação) menos o custo no Ajustado;
 * - preco: receita líquida de tributos das vendas no Ajustado (preço recalculado para manter a
 *   margem) menos a receita no Sem Reajuste (a empresa absorve o impacto);
 * - credito: crédito de IBS/CBS a menor nas compras por cClassTrib divergente na nota;
 * - destaque: IBS/CBS destacado a mais nas vendas por cClassTrib divergente na nota.
 *
 * O passivo (tributo a menor, crédito a maior) é risco fiscal, não DJF: vai em separado.
 */
export type RamoId = "repasse" | "preco" | "credito" | "destaque"

export type Detalhe = {
  chave: string
  rotulo: string
  sub: string | null
  valor: number
  /** Explicação curta do caso: o par de classificação, a quantidade de itens… */
  nota: string | null
  /** Quando há um nível abaixo (micro), o que pedir ao servidor. */
  abrir: { ramo: RamoId; valor: string } | null
}

export type Ramo = {
  id: RamoId
  valor: number
  disponivel: boolean
  motivo: string | null
  detalhes: Detalhe[]
}

export type Auditoria = {
  ano: number
  regime: string
  djf: number
  ramos: Ramo[]
  risco: { compras: number; vendas: number; naoEstimadoItens: number }
  periodoMeses: number | null
  tabela: { fonte: string; obtidoEm: string }
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v))

const AJUSTADO = "base"
const PIOR = "sem_reajuste"

type Base = Omit<Recorte, "cenario_vendas" | "cenario_compras">
const comCenario = (r: Base, c: string): Recorte => ({ ...r, cenario_vendas: c, cenario_compras: c })

/** Custo das compras e receita líquida das vendas de um recorte (sem agrupar). */
function totais(id: string, recorte: Recorte) {
  const metricas = ["custo_dr_entrada", "valor_dr_saida", "debito_dr_saida"] as const satisfies readonly Metrica[]
  return emCache(`djf-total:${id}:${JSON.stringify(recorte)}`, 600, async () => {
    const { grupos } = await pricetax().calculos.consultar(id, { recorte, sentido: "ambas", metricas: [...metricas] })
    const g = grupos[0] ?? {}
    return { custo: n(g.custo_dr_entrada), receitaLiquida: n(g.valor_dr_saida) - n(g.debito_dr_saida) }
  })
}

/** Uma métrica agrupada por uma dimensão nos dois cenários, devolvida como diferença por grupo. */
async function diferencaPor(
  id: string,
  recorte: Base,
  sentido: "entrada" | "saida",
  dimensao: "cnpj_outra_parte" | "descricao_produto",
  filtros: Record<string, string[]> | undefined,
  valor: (g: Record<string, unknown>) => number,
  metricas: Metrica[],
  sinal: 1 | -1,
) {
  const ler = (c: string) =>
    emCache(`djf-grupo:${id}:${JSON.stringify({ recorte, c, sentido, dimensao, filtros })}`, 600, () =>
      pricetax().calculos.consultar(id, {
        recorte: comCenario(recorte, c),
        sentido,
        filtros,
        agrupar_por: [dimensao],
        metricas: ["itens", ...metricas],
        ordenar_por: { metrica: metricas[0], direcao: "desc" },
        limite: 500,
      }),
    )
  const [ajustado, pior] = [await ler(AJUSTADO), await ler(PIOR)]
  const mapa = new Map<string, { itens: number; ajustado: number; pior: number }>()
  for (const [lista, campo] of [
    [ajustado.grupos, "ajustado"],
    [pior.grupos, "pior"],
  ] as const) {
    for (const g of lista) {
      const k = String(texto(g[dimensao]))
      const atual = mapa.get(k) ?? { itens: n(g.itens), ajustado: 0, pior: 0 }
      atual[campo] = valor(g)
      mapa.set(k, atual)
    }
  }
  const lista = [...mapa.entries()]
    .map(([chave, v]) => ({ chave, itens: v.itens, diferenca: sinal * (v.pior - v.ajustado) }))
    .filter((d) => d.diferenca > 0.005)
    .sort((a, b) => b.diferenca - a.diferenca)
  return { lista, parcial: ajustado.total_grupos > ajustado.grupos.length || pior.total_grupos > pior.grupos.length }
}

/**
 * Valor de um ramo: a soma só dos grupos que perdem (um item que ganha não compensa outro que
 * perde). Se a API tem mais grupos do que o painel lê, usa o total do recorte, que é exato mas
 * líquido, e avisa.
 */
function valorDoRamo(r: { lista: { diferenca: number }[]; parcial: boolean }, totalLiquido: number) {
  if (!r.parcial) return { valor: r.lista.reduce((s, d) => s + d.diferenca, 0), aviso: null }
  return {
    valor: Math.max(0, totalLiquido),
    aviso: "Há mais grupos do que o painel lê de uma vez: o valor é o total líquido do recorte e a lista mostra os maiores casos.",
  }
}

const fornecedoresRepasse = (id: string, r: Base) =>
  diferencaPor(id, r, "entrada", "cnpj_outra_parte", undefined, (g) => n(g.custo_dr), ["custo_dr"], 1)
const produtosPreco = (id: string, r: Base) =>
  diferencaPor(id, r, "saida", "descricao_produto", undefined, (g) => n(g.valor_dr) - n(g.debito_dr), ["valor_dr", "debito_dr"], -1)

/** Ramos 1 e 2 de um ano: repasse do fornecedor e preço sem reajuste. */
async function ramosDeCenario(id: string, recorte: Base) {
  const a = await totais(id, comCenario(recorte, AJUSTADO))
  const p = await totais(id, comCenario(recorte, PIOR))
  const fornecedores = await fornecedoresRepasse(id, recorte)
  const produtos = await produtosPreco(id, recorte)
  return {
    fornecedores,
    produtos,
    repasse: valorDoRamo(fornecedores, p.custo - a.custo),
    preco: valorDoRamo(produtos, a.receitaLiquida - p.receitaLiquida),
  }
}

const razaoSocial = (id: string, recorte: Recorte, sentido: "entrada" | "saida", cnpj: string) =>
  emCache(`razao:${id}:${sentido}:${cnpj}`, 3600, async () => {
    const p = await pricetax().calculos.pagina(id, { recorte, sentido, filtros: { cnpj_outra_parte: [cnpj] }, limite: 1 })
    return texto((p.linhas[0] as Record<string, unknown> | undefined)?.razao_social_outra_parte)
  })

const plural = (q: number, s: string, p: string) => `${q.toLocaleString("pt-BR")} ${q === 1 ? s : p}`

export async function montarAuditoria(calculo: CalculoDetalhe, recorte: Base, tabela: { fonte: string; obtidoEm: string }): Promise<Auditoria> {
  const id = calculo.id
  const temPior = calculo.cenarios.some((c) => c.id === PIOR)
  const ramos: Ramo[] = []
  const semPior = "Este cálculo não tem o cenário Sem Reajuste para comparar com o Ajustado."

  // Ramos 1 e 2: Ajustado × Sem Reajuste.
  const cenarios = temPior ? await ramosDeCenario(id, recorte) : null
  const repasseDetalhes: Detalhe[] = []
  for (const f of cenarios?.fornecedores.lista.slice(0, 8) ?? []) {
    const cnpj = f.chave === "null" ? null : f.chave
    repasseDetalhes.push({
      chave: f.chave,
      rotulo: (cnpj && (await razaoSocial(id, comCenario(recorte, AJUSTADO), "entrada", cnpj))) || "Fornecedor sem identificação",
      sub: cnpj,
      valor: f.diferenca,
      nota: plural(f.itens, "item de compra", "itens de compra"),
      abrir: cnpj ? { ramo: "repasse", valor: cnpj } : null,
    })
  }
  ramos.push({
    id: "repasse",
    valor: cenarios?.repasse.valor ?? 0,
    disponivel: temPior,
    motivo: cenarios ? cenarios.repasse.aviso : semPior,
    detalhes: repasseDetalhes,
  })

  const preco = cenarios?.preco.valor ?? 0
  ramos.push({
    id: "preco",
    valor: preco,
    disponivel: temPior,
    motivo: cenarios
      ? (cenarios.preco.aviso ?? (preco === 0 ? "Neste ano, em nenhum item o preço ajustado fica acima do atual: manter o preço não gera perda." : null))
      : semPior,
    detalhes: (cenarios?.produtos.lista.slice(0, 8) ?? []).map((p) => ({
      chave: p.chave,
      rotulo: p.chave === "null" ? "Item sem descrição" : p.chave,
      sub: null,
      valor: p.diferenca,
      nota: plural(p.itens, "item de venda", "itens de venda"),
      abrir: p.chave === "null" ? null : { ramo: "preco", valor: p.chave },
    })),
  })

  // Ramos 3 e 4: classificação (cClassTrib) da nota × calculada, no cenário Ajustado.
  const base = { recorte: comCenario(recorte, AJUSTADO), sentido: "ambas" as const }
  const impacto = await impactoClassificacao(id, base)
  const analise = await analisarClassificacao(id, base, "ganho")
  ramos.push({
    id: "credito",
    valor: impacto.ganhoEntrada,
    disponivel: true,
    motivo: null,
    detalhes: (analise.fornecedores ?? []).slice(0, 8).map((f) => ({
      chave: String(f.cnpj),
      rotulo: f.razaoSocial ?? "Fornecedor sem identificação",
      sub: f.cnpj,
      valor: f.ganho,
      nota: `${plural(f.itens, "item", "itens")} · nota → calculado: ${f.pares.join(", ")}`,
      abrir: null,
    })),
  })
  ramos.push({
    id: "destaque",
    valor: impacto.ganhoSaida,
    disponivel: true,
    motivo: null,
    detalhes: analise.itens
      .filter((i) => i.sentido === "saida")
      .slice(0, 8)
      .map((i) => ({
        chave: String(i.descricao),
        rotulo: i.descricao ?? "Item sem descrição",
        sub: null,
        valor: i.ganho,
        nota: `${plural(i.itens, "item", "itens")} · nota → calculado: ${i.pares.join(", ")}`,
        abrir: null,
      })),
  })

  return {
    ano: recorte.ano,
    regime: recorte.regime,
    djf: ramos.reduce((s, r) => s + r.valor, 0),
    ramos,
    risco: { compras: impacto.perdaEntrada, vendas: impacto.perdaSaida, naoEstimadoItens: impacto.naoEstimado.itens },
    periodoMeses: calculo.periodo_meses,
    tabela,
  }
}

/** Nível micro de um caso: produtos de um fornecedor (repasse) ou clientes de um produto (preço). */
export async function detalharRamo(calculo: CalculoDetalhe, recorte: Base, ramo: RamoId, valor: string): Promise<Detalhe[]> {
  const id = calculo.id
  if (ramo === "repasse") {
    const { lista } = await diferencaPor(id, recorte, "entrada", "descricao_produto", { cnpj_outra_parte: [valor] }, (g) => n(g.custo_dr), ["custo_dr"], 1)
    return lista.slice(0, 15).map((p) => ({
      chave: p.chave,
      rotulo: p.chave === "null" ? "Item sem descrição" : p.chave,
      sub: null,
      valor: p.diferenca,
      nota: plural(p.itens, "item", "itens"),
      abrir: null,
    }))
  }
  if (ramo === "preco") {
    const { lista } = await diferencaPor(
      id,
      recorte,
      "saida",
      "cnpj_outra_parte",
      { descricao_produto: [valor] },
      (g) => n(g.valor_dr) - n(g.debito_dr),
      ["valor_dr", "debito_dr"],
      -1,
    )
    const detalhes: Detalhe[] = []
    for (const c of lista.slice(0, 10)) {
      const cnpj = c.chave === "null" ? null : c.chave
      detalhes.push({
        chave: c.chave,
        rotulo: (cnpj && (await razaoSocial(id, comCenario(recorte, AJUSTADO), "saida", cnpj))) || "Cliente sem identificação",
        sub: cnpj,
        valor: c.diferenca,
        nota: plural(c.itens, "item", "itens"),
        abrir: null,
      })
    }
    return detalhes
  }
  return []
}
