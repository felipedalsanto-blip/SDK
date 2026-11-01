import { classificador, ehCompra, ehDevolucao, ehExportacao, ehImportacao, ehVenda, type RegraCfop } from "./cfop"
import { rotuloDoc } from "./leitor"
import type { Ajuste, Apuracao, ArquivoLido, Doc, GrupoItem, Leitura } from "./tipos"

/*
 * As etapas 1 a 3 da auditoria de entrada de uma empresa, a partir dos EFDs lidos:
 * 1. Documentos enviados: estão todos, sem duplicidade, sem meses faltando, só a última versão?
 * 2. Acurácia: os arquivos permitem a análise no nível de item?
 * 3. Consolidação: como a empresa apura e onde estão as exceções.
 * Cada achado traz criticidade, representatividade, como resolver e o detalhe por documento.
 */

export type Criticidade = "alta" | "media" | "baixa" | "info" | "ok"
export type TipoColuna = "texto" | "moeda" | "pct" | "num"
export type Coluna = { id: string; nome: string; tipo: TipoColuna }
export type Tabela = { colunas: Coluna[]; linhas: Record<string, string | number>[] }

export type Achado = {
  id: string
  etapa: "1" | "2" | "3" | "4"
  item: string
  titulo: string
  criticidade: Criticidade
  resumo: string
  valor?: number
  representatividade?: number
  /** Totalização (por fornecedor, CFOP, NCM, CST…). */
  tabela?: Tabela
  /** O micro: documento a documento, com chave, participante e CFOP. */
  detalhe?: Tabela
  comoResolver?: string
  fontes?: string[]
  /** Separação da reforma: os números de `tabela` e `detalhe` trazem a coluna "Reforma". */
  reforma?: { dentro: number; fora: number }
}

export type Pendencia = { tipo: string; cnpj: string; estabelecimento: string; competencia: string; problema: string; acao: string }
export type ItemChecklist = { item: string; descricao: string; ok: boolean; detalhe: string }

export type Resultado = {
  empresa: { nome: string; cnpj: string; uf: string; regime: string; incidencia: string }
  periodo: { inicio: string; fim: string; meses: string[] }
  arquivos: (Pick<ArquivoLido, "indice" | "nome" | "tipo" | "cnpj" | "empresa" | "periodo" | "finalidade" | "versao" | "linhas" | "uf"> & { erros: number })[]
  estabelecimentos: { cnpj: string; nome: string; uf: string; ie: string; fiscal: Record<string, number>; contribuicoes: Record<string, number> }[]
  checklist: ItemChecklist[]
  pendencias: Pendencia[]
  achados: Achado[]
  consolidacao: Consolidacao
  base: { compras: number; vendas: number; comprasReforma: number; vendasReforma: number }
}

export type LinhaApuracao = {
  periodo: string
  imposto: Apuracao["imposto"]
  creditosDocumentos: number
  debitos: number
  creditos: number
  ajustesDebito: number
  ajustesCredito: number
  estornosDebito: number
  estornosCredito: number
  aRecolher: number
  saldoCredor: number
}
export type Consolidacao = {
  linhas: LinhaApuracao[]
  perfil: { imposto: Apuracao["imposto"]; aRecolher: number; saldoCredorFinal: number; ajustes: number; situacao: string }[]
}

const CANCELADO = new Set(["02", "03", "04", "05"])
const valido = (d: Doc) => !CANCELADO.has(d.sit)
const raiz = (cnpj: string) => (cnpj ?? "").slice(0, 8)
const pct = (parte: number, todo: number) => (todo > 0 ? parte / todo : 0)
const r2 = (v: number) => Math.round(v * 100) / 100

/** Regra dos 5% pedida: acima de 5% das compras (ou vendas) é ALTA; abaixo, BAIXA. */
const porRepresentatividade = (r: number): Criticidade => (r > 0.05 ? "alta" : r > 0 ? "baixa" : "ok")
/** Ajustes, estornos e F100: acima de 10% é alta, de 3% a 10% média, abaixo de 3% baixa. */
const porPeso = (r: number): Criticidade => (r > 0.1 ? "alta" : r >= 0.03 ? "media" : r > 0 ? "baixa" : "ok")

function mesesEntre(ini: string, fim: string): string[] {
  const r: string[] = []
  if (!ini || !fim) return r
  let [a, m] = ini.split("-").map(Number)
  const [af, mf] = fim.split("-").map(Number)
  while (a < af || (a === af && m <= mf)) {
    r.push(`${a}-${String(m).padStart(2, "0")}`)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return r
}

export const fmtCnpj = (v: string) =>
  /^\d{14}$/.test(v) ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : /^\d{11}$/.test(v) ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : v
export const fmtMes = (p: string) => (p ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : "")

/* ─────────────── colunas reutilizadas ─────────────── */
const C = {
  doc: { id: "doc", nome: "Documento (chave ou série/número)", tipo: "texto" },
  data: { id: "data", nome: "Data", tipo: "texto" },
  estab: { id: "estab", nome: "Estabelecimento", tipo: "texto" },
  part: { id: "part", nome: "Fornecedor / cliente", tipo: "texto" },
  partDoc: { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" },
  uf: { id: "uf", nome: "UF", tipo: "texto" },
  cfop: { id: "cfop", nome: "CFOP", tipo: "texto" },
  cst: { id: "cst", nome: "CST", tipo: "texto" },
  ncm: { id: "ncm", nome: "NCM", tipo: "texto" },
  item: { id: "item", nome: "Produto", tipo: "texto" },
  periodo: { id: "periodo", nome: "Competência", tipo: "texto" },
  reforma: { id: "reforma", nome: "Reforma", tipo: "texto" },
  valor: { id: "valor", nome: "Valor", tipo: "moeda" },
  vlDoc: { id: "vlDoc", nome: "Total do documento", tipo: "moeda" },
  icms: { id: "icms", nome: "ICMS", tipo: "moeda" },
  st: { id: "st", nome: "ICMS-ST", tipo: "moeda" },
  ipi: { id: "ipi", nome: "IPI", tipo: "moeda" },
  pis: { id: "pis", nome: "PIS", tipo: "moeda" },
  cofins: { id: "cofins", nome: "COFINS", tipo: "moeda" },
  difal: { id: "difal", nome: "DIFAL", tipo: "moeda" },
  qtd: { id: "qtd", nome: "Documentos", tipo: "num" },
  rep: { id: "rep", nome: "Representatividade", tipo: "pct" },
} satisfies Record<string, Coluna>

function tabela(colunas: Coluna[], linhas: Record<string, string | number>[]): Tabela {
  return { colunas, linhas }
}

/** O micro de uma lista de documentos. */
function detalheDocs(docs: Doc[], ehReforma: (c: string) => boolean, extra: Coluna[] = [], valorExtra?: (d: Doc) => Record<string, number | string>) {
  return tabela(
    [C.doc, C.data, C.estab, C.part, C.partDoc, C.uf, C.cfop, C.reforma, C.vlDoc, C.icms, C.st, C.ipi, C.pis, C.cofins, ...extra],
    docs.map((d) => ({
      doc: rotuloDoc(d),
      data: d.data,
      estab: fmtCnpj(d.estab),
      part: d.partNome || d.part,
      partDoc: fmtCnpj(d.partDoc),
      uf: d.partUf,
      cfop: d.cfops.join(", "),
      reforma: d.cfops.some(ehReforma) ? "sim" : "não",
      vlDoc: r2(d.vlDoc),
      icms: r2(d.icms),
      st: r2(d.st),
      ipi: r2(d.ipi),
      pis: r2(d.pis),
      cofins: r2(d.cofins),
      ...(valorExtra?.(d) ?? {}),
    })),
  )
}

/** Soma uma lista de grupos de itens por um conjunto de dimensões. */
function agruparItens(itens: GrupoItem[], dims: (keyof GrupoItem)[], ehReforma: (c: string) => boolean) {
  const m = new Map<string, Record<string, string | number>>()
  for (const g of itens) {
    const k = dims.map((d) => String(g[d])).join("|")
    let a = m.get(k)
    if (!a) {
      a = Object.fromEntries(dims.map((d) => [d, String(g[d] ?? "")]))
      Object.assign(a, { reforma: g.cfop ? (ehReforma(g.cfop) ? "sim" : "não") : "—", valor: 0, icms: 0, st: 0, ipi: 0, pis: 0, cofins: 0, linhas: 0, docs: "" })
      m.set(k, a)
    }
    for (const c of ["valor", "icms", "st", "ipi", "pis", "cofins", "linhas"] as const) a[c] = r2((a[c] as number) + (g[c] as number))
    const docs = new Set(String(a.docs).split(" · ").filter(Boolean))
    for (const d of g.docs) if (docs.size < 8) docs.add(d)
    a.docs = [...docs].join(" · ")
  }
  return [...m.values()].sort((x, y) => (y.valor as number) - (x.valor as number))
}

const NOMES_DIM: Partial<Record<keyof GrupoItem, Coluna>> = {
  partNome: { id: "partNome", nome: "Fornecedor / cliente", tipo: "texto" },
  partDoc: { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" },
  cfop: C.cfop,
  ncm: C.ncm,
  descricao: C.item,
  cstIcms: { id: "cstIcms", nome: "CST ICMS", tipo: "texto" },
  aliqIcms: { id: "aliqIcms", nome: "Alíq. ICMS", tipo: "texto" },
  cstIpi: { id: "cstIpi", nome: "CST IPI", tipo: "texto" },
  aliqIpi: { id: "aliqIpi", nome: "Alíq. IPI", tipo: "texto" },
  cstPis: { id: "cstPis", nome: "CST PIS", tipo: "texto" },
  aliqPis: { id: "aliqPis", nome: "Alíq. PIS", tipo: "texto" },
  cstCofins: { id: "cstCofins", nome: "CST COFINS", tipo: "texto" },
  aliqCofins: { id: "aliqCofins", nome: "Alíq. COFINS", tipo: "texto" },
  estab: C.estab,
  oper: { id: "oper", nome: "Entrada/saída", tipo: "texto" },
  reg: { id: "reg", nome: "Registro", tipo: "texto" },
}
function tabelaItens(itens: GrupoItem[], dims: (keyof GrupoItem)[], ehReforma: (c: string) => boolean, impostos: (keyof typeof C)[] = ["icms", "ipi", "pis", "cofins"]) {
  const linhas = agruparItens(itens, dims, ehReforma).map((l) => ({
    ...l,
    oper: l.oper === "0" ? "entrada" : l.oper === "1" ? "saída" : (l.oper ?? ""),
    partDoc: l.partDoc ? fmtCnpj(String(l.partDoc)) : l.partDoc,
  }))
  return tabela([...dims.map((d) => NOMES_DIM[d] ?? { id: d, nome: d, tipo: "texto" as const }), C.reforma, C.valor, ...impostos.map((i) => C[i]), { id: "docs", nome: "Documentos (exemplos)", tipo: "texto" }], linhas)
}

/* ─────────────── análise ─────────────── */

/**
 * Uma versão por competência: com original e retificadora, fica a retificadora; com o mesmo arquivo
 * repetido, fica o primeiro. As análises usam só essas versões, para não somar o mesmo mês duas vezes.
 */
export function versoesValidas(arquivos: ArquivoLido[]): Set<number> {
  const melhor = new Map<string, ArquivoLido>()
  for (const a of arquivos) {
    const k = `${a.tipo}|${a.tipo === "contribuicoes" ? raiz(a.cnpj) : a.cnpj}|${a.periodo}`
    const atual = melhor.get(k)
    if (!atual || (a.finalidade === "retificadora" && atual.finalidade !== "retificadora")) melhor.set(k, a)
  }
  return new Set([...melhor.values()].map((a) => a.indice))
}

export function analisar(leitura: Leitura, regra: RegraCfop): Resultado {
  const ehReforma = classificador(regra)
  const validos = versoesValidas(leitura.arquivos)
  const usa = (x: { arquivo: number }) => validos.has(x.arquivo)
  // Arquivos todos (para conferir duplicidades); dados só das versões válidas.
  const l: Leitura = {
    arquivos: leitura.arquivos,
    docs: leitura.docs.filter(usa),
    itens: leitura.itens.filter(usa),
    ajustes: leitura.ajustes.filter(usa),
    apuracoes: leitura.apuracoes.filter(usa),
    f100: leitura.f100.filter(usa),
    porCfop: leitura.porCfop.filter((x) => leitura.arquivos.some((a) => validos.has(a.indice) && a.periodo === x.periodo && (a.cnpj === x.estab || a.tipo === "contribuicoes"))),
  }
  const fiscais = l.arquivos.filter((a) => a.tipo === "fiscal")
  const contribs = l.arquivos.filter((a) => a.tipo === "contribuicoes")
  const todos = [...fiscais, ...contribs]
  const fiscaisValidos = fiscais.filter((a) => validos.has(a.indice))
  const contribsValidos = contribs.filter((a) => validos.has(a.indice))
  const periodos = [...new Set(todos.map((a) => a.periodo).filter(Boolean))].sort()
  const meses = mesesEntre(periodos[0] ?? "", periodos[periodos.length - 1] ?? "")
  const achados: Achado[] = []
  const pendencias: Pendencia[] = []

  /* Empresa: a do EFD Contribuições (matriz) ou do primeiro arquivo. */
  const principal = contribs[0] ?? fiscais[0]
  const regime = contribs.some((a) => a.incidencia === "1")
    ? "Lucro Real (não cumulativo)"
    : contribs.some((a) => a.incidencia === "2")
      ? "Lucro Presumido (cumulativo)"
      : contribs.some((a) => a.incidencia === "3")
        ? "Misto (não cumulativo e cumulativo)"
        : "não informado (sem EFD Contribuições)"

  /* ───── Etapa 1: documentos enviados ───── */
  const estabs = new Map<string, Resultado["estabelecimentos"][number]>()
  const estab = (cnpj: string, nome = "", uf = "", ie = "") => {
    if (!estabs.has(cnpj)) estabs.set(cnpj, { cnpj, nome, uf, ie, fiscal: {}, contribuicoes: {} })
    const e = estabs.get(cnpj)!
    if (nome && !e.nome) e.nome = nome
    if (uf && !e.uf) e.uf = uf
    if (ie && !e.ie) e.ie = ie
    return e
  }
  for (const a of contribs) {
    for (const e of a.estabelecimentos) estab(e.cnpj, e.nome, e.uf, e.ie).contribuicoes[a.periodo] = (estab(e.cnpj).contribuicoes[a.periodo] ?? 0) + 1
    if (!a.estabelecimentos.length) estab(a.cnpj, a.empresa, a.uf).contribuicoes[a.periodo] = 1
  }
  for (const a of fiscais) {
    const e = estab(a.cnpj, a.empresa, a.uf, a.ie)
    e.fiscal[a.periodo] = (e.fiscal[a.periodo] ?? 0) + 1
  }
  const raizesContrib = new Set(contribs.map((a) => raiz(a.cnpj)))

  // Duplicidades e versões (mesmo tipo, CNPJ e competência).
  const porChave = new Map<string, ArquivoLido[]>()
  for (const a of todos) {
    const k = `${a.tipo}|${a.tipo === "contribuicoes" ? raiz(a.cnpj) : a.cnpj}|${a.periodo}`
    porChave.set(k, [...(porChave.get(k) ?? []), a])
  }
  let duplicados = 0
  let versoes = 0
  for (const [k, lista] of porChave) {
    if (lista.length < 2) continue
    const [tipo, , periodo] = k.split("|")
    const nomeTipo = tipo === "fiscal" ? "EFD ICMS/IPI" : "EFD Contribuições"
    const fins = new Set(lista.map((a) => a.finalidade))
    if (fins.has("original") && fins.has("retificadora")) {
      versoes++
      pendencias.push({
        tipo: nomeTipo, cnpj: fmtCnpj(lista[0].cnpj), estabelecimento: lista[0].empresa, competencia: fmtMes(periodo),
        problema: `Original e retificadora da mesma competência (${lista.map((a) => a.nome).join(", ")})`,
        acao: "Confirmar que a retificadora é a última versão transmitida; a original será descartada da análise.",
      })
    } else {
      duplicados++
      pendencias.push({
        tipo: nomeTipo, cnpj: fmtCnpj(lista[0].cnpj), estabelecimento: lista[0].empresa, competencia: fmtMes(periodo),
        problema: `Arquivo enviado ${lista.length} vezes (${lista.map((a) => a.nome).join(", ")})`,
        acao: "Confirmar qual é a versão válida (a última transmitida) e reenviar só ela.",
      })
    }
  }

  // Meses faltando: EFD Contribuições por empresa (raiz) e EFD Fiscal por estabelecimento com IE.
  let faltaContrib = 0
  for (const r of raizesContrib) {
    const tem = new Set(contribs.filter((a) => raiz(a.cnpj) === r).map((a) => a.periodo))
    for (const m of meses)
      if (!tem.has(m)) {
        faltaContrib++
        const a = contribs.find((x) => raiz(x.cnpj) === r)!
        pendencias.push({
          tipo: "EFD Contribuições", cnpj: fmtCnpj(a.cnpj), estabelecimento: a.empresa, competencia: fmtMes(m), problema: "Competência não enviada",
          acao: "Enviar o arquivo da competência (última versão transmitida).",
        })
      }
  }
  let faltaFiscal = 0
  let semIe = 0
  for (const e of estabs.values()) {
    const temContrib = Object.keys(e.contribuicoes).length > 0
    const precisa = meses.filter((m) => (temContrib ? e.contribuicoes[m] : true))
    if (!e.ie && !Object.keys(e.fiscal).length) {
      semIe++
      continue // sem inscrição estadual e sem EFD Fiscal: em regra não é contribuinte do ICMS
    }
    for (const m of precisa)
      if (!e.fiscal[m]) {
        faltaFiscal++
        pendencias.push({
          tipo: "EFD ICMS/IPI", cnpj: fmtCnpj(e.cnpj), estabelecimento: e.nome, competencia: fmtMes(m),
          problema: temContrib ? "Estabelecimento consta no EFD Contribuições (0140), mas o EFD ICMS/IPI não foi enviado" : "Competência não enviada",
          acao: "Enviar o EFD ICMS/IPI da competência (última versão transmitida).",
        })
      }
  }
  // EFD Fiscal sem o EFD Contribuições correspondente.
  let fiscalSemContrib = 0
  for (const a of fiscais) {
    const temContrib = contribs.some((c) => raiz(c.cnpj) === raiz(a.cnpj) && c.periodo === a.periodo)
    if (!temContrib) {
      fiscalSemContrib++
      pendencias.push({
        tipo: "EFD Contribuições", cnpj: fmtCnpj(a.cnpj), estabelecimento: a.empresa, competencia: fmtMes(a.periodo),
        problema: "Há EFD ICMS/IPI da competência, mas não o EFD Contribuições da empresa",
        acao: "Enviar o EFD Contribuições da competência (matriz, com todos os estabelecimentos).",
      })
    }
  }
  const retificadoras = todos.filter((a) => a.finalidade === "retificadora")

  const checklist: ItemChecklist[] = [
    { item: "1.1", descricao: "Recebemos EFD ICMS/IPI (Fiscal)", ok: fiscais.length > 0, detalhe: `${fiscais.length} arquivo(s)` },
    { item: "1.1", descricao: "Recebemos EFD Contribuições", ok: contribs.length > 0, detalhe: `${contribs.length} arquivo(s)` },
    {
      item: "1.1.1",
      descricao: "Cada estabelecimento do EFD Contribuições (matriz e filiais do 0140) tem o EFD ICMS/IPI de todos os meses",
      ok: faltaFiscal === 0 && contribs.length > 0,
      detalhe: faltaFiscal ? `${faltaFiscal} competência(s) de estabelecimento sem EFD ICMS/IPI` : `${estabs.size} estabelecimento(s) conferidos${semIe ? `; ${semIe} sem IE e sem EFD Fiscal (não contribuinte do ICMS)` : ""}`,
    },
    { item: "1.1.1", descricao: "Cada EFD ICMS/IPI tem o EFD Contribuições da empresa no mesmo mês", ok: fiscalSemContrib === 0, detalhe: fiscalSemContrib ? `${fiscalSemContrib} competência(s) sem EFD Contribuições` : "ok" },
    { item: "1.1.2", descricao: "Nenhum arquivo duplicado", ok: duplicados === 0, detalhe: duplicados ? `${duplicados} duplicidade(s)` : "ok" },
    { item: "1.1.2", descricao: "Nenhuma competência faltando", ok: faltaContrib + faltaFiscal === 0, detalhe: `${meses.length} mês(es) de ${fmtMes(meses[0])} a ${fmtMes(meses[meses.length - 1])}; faltam ${faltaContrib} de Contribuições e ${faltaFiscal} de Fiscal` },
    {
      item: "1.1.2",
      descricao: "Só a última versão de cada competência (sem original junto da retificadora)",
      ok: versoes === 0,
      detalhe: versoes ? `${versoes} competência(s) com original e retificadora` : `${retificadoras.length} retificadora(s) recebida(s), sem original repetida`,
    },
  ]

  /* Base dos documentos válidos: EFD Fiscal quando existir; o Contribuições completa os estabelecimentos sem Fiscal. */
  const temFiscal = new Set(fiscaisValidos.map((a) => `${a.cnpj}|${a.periodo}`))
  const docsBase = l.docs.filter((d) => valido(d) && (d.fonte === "fiscal" || !temFiscal.has(`${d.estab}|${d.periodo}`)))
  const docsCompra = docsBase.filter((d) => d.oper === "0" && d.cfops.some(ehCompra) && !d.cfops.every(ehDevolucao))
  const docsVenda = docsBase.filter((d) => d.oper === "1" && d.cfops.some(ehVenda))
  const soma = (ds: Doc[], f: (d: Doc) => number = (d) => d.vlDoc) => ds.reduce((s, d) => s + f(d), 0)
  const base = {
    compras: soma(docsCompra),
    vendas: soma(docsVenda),
    comprasReforma: soma(docsCompra.filter((d) => d.cfops.some(ehReforma))),
    vendasReforma: soma(docsVenda.filter((d) => d.cfops.some(ehReforma))),
  }
  const reformaDe = (ds: Doc[]) => ({ dentro: soma(ds.filter((d) => d.cfops.some(ehReforma))), fora: soma(ds.filter((d) => !d.cfops.some(ehReforma))) })
  const itensReforma = (gs: GrupoItem[]) => ({ dentro: gs.filter((g) => !g.cfop || ehReforma(g.cfop)).reduce((s, g) => s + g.valor, 0), fora: gs.filter((g) => g.cfop && !ehReforma(g.cfop)).reduce((s, g) => s + g.valor, 0) })

  /* ───── Etapa 2.1: EFD Contribuições ───── */
  const casosArq = (pred: (a: ArquivoLido) => string | null) =>
    contribsValidos.map((a) => ({ a, motivo: pred(a) })).filter((x): x is { a: ArquivoLido; motivo: string } => !!x.motivo)
  const tabelaArq = (casos: { a: ArquivoLido; motivo: string }[]) =>
    tabela(
      [C.estab, { id: "empresa", nome: "Empresa", tipo: "texto" }, C.periodo, { id: "motivo", nome: "O que foi encontrado", tipo: "texto" }, { id: "arquivo", nome: "Arquivo", tipo: "texto" }],
      casos.map(({ a, motivo }) => ({ estab: fmtCnpj(a.cnpj), empresa: a.empresa, periodo: fmtMes(a.periodo), motivo, arquivo: a.nome })),
    )

  const consolidados = casosArq((a) => {
    const est = Object.entries(a.escrituracaoC).filter(([, v]) => v === "1").map(([c]) => fmtCnpj(c))
    const regs = ["C180", "C190", "C380", "C490", "C860", "F550", "F560"].filter((r) => a.registros[r])
    if (!est.length && !regs.length) return null
    return [est.length ? `C010 consolidado (IND_ESCRI = 1) em ${est.join(", ")}` : "", regs.length ? `registros consolidados: ${regs.join(", ")}` : ""].filter(Boolean).join("; ")
  })
  achados.push({
    id: "2.1.1", etapa: "2", item: "2.1.1", titulo: "EFD Contribuições entregue de forma consolidada",
    criticidade: consolidados.length ? "alta" : "ok",
    resumo: consolidados.length
      ? `${consolidados.length} arquivo(s) com escrituração consolidada: ${consolidados.map((c) => `${fmtMes(c.a.periodo)}: ${c.motivo}`).join("; ")}. Sem o documento a documento (C100/C170), a análise por item fica comprometida.`
      : "Todos os arquivos estão individualizados (C100/C170), documento a documento.",
    tabela: consolidados.length ? tabelaArq(consolidados) : undefined,
    comoResolver: "Pedir os XML das notas do período ou o EFD retificado de forma individualizada (C010 com IND_ESCRI = 2).",
    fontes: ["sped", "l10637", "l10833"],
  })

  const caixa = casosArq((a) => {
    const regs = ["F500", "F510", "F525"].filter((r) => a.registros[r])
    if (a.regimeCumulativo !== "1" && !regs.length) return null
    return [a.regimeCumulativo === "1" ? "0110 com regime de caixa (IND_REG_CUM = 1)" : "", regs.length ? `registros ${regs.join(", ")}` : ""].filter(Boolean).join("; ")
  })
  achados.push({
    id: "2.1.2", etapa: "2", item: "2.1.2", titulo: "EFD Contribuições pelo regime de caixa (F500, F510, F525)",
    criticidade: caixa.length ? "alta" : "ok",
    resumo: caixa.length
      ? `${caixa.length} arquivo(s) transmitido(s) pelo regime de caixa: ${caixa.map((c) => `${fmtMes(c.a.periodo)} (${fmtCnpj(c.a.cnpj)})`).join(", ")}. A receita aparece consolidada pelo recebimento, sem os documentos.`
      : "Nenhum arquivo pelo regime de caixa.",
    tabela: caixa.length ? tabelaArq(caixa) : undefined,
    comoResolver: "Pedir os XML das notas de venda do período (ou o relatório de faturamento por documento) para reconstruir as saídas.",
    fontes: ["sped"],
  })

  const nfce = docsBase.length ? l.docs.filter((d) => valido(d) && d.oper === "1" && d.mod === "65") : []
  const nfceContrib = contribsValidos.filter((a) => a.registros.C175 || a.registros.C490 || a.registros.C400)
  const nfcePorMes = new Map<string, { estab: string; periodo: string; docs: number; valor: number }>()
  for (const d of nfce) {
    const k = `${d.estab}|${d.periodo}`
    const x = nfcePorMes.get(k) ?? { estab: d.estab, periodo: d.periodo, docs: 0, valor: 0 }
    x.docs++
    x.valor += d.vlDoc
    nfcePorMes.set(k, x)
  }
  const valorNfce = soma(nfce)
  achados.push({
    id: "2.1.3", etapa: "2", item: "2.1.3", titulo: "Saídas com NFC-e (modelo 65)",
    criticidade: nfce.length || nfceContrib.length ? "alta" : "ok",
    valor: valorNfce, representatividade: pct(valorNfce, base.vendas),
    resumo: nfce.length || nfceContrib.length
      ? `${nfce.length} NFC-e de saída, ${moeda(valorNfce)} (${pctTexto(pct(valorNfce, base.vendas))} das vendas), em ${[...new Set([...nfcePorMes.values()].map((x) => `${fmtMes(x.periodo)} (${fmtCnpj(x.estab)})`))].join(", ") || "arquivos com C175/C400/C490"}. A NFC-e não traz os itens na EFD: precisamos dos XML.`
      : "Nenhuma NFC-e (modelo 65) nas saídas.",
    tabela: nfcePorMes.size
      ? tabela([C.estab, C.periodo, C.qtd, C.valor], [...nfcePorMes.values()].map((x) => ({ estab: fmtCnpj(x.estab), periodo: fmtMes(x.periodo), qtd: x.docs, valor: r2(x.valor) })))
      : undefined,
    detalhe: nfce.length ? detalheDocs(nfce, ehReforma) : undefined,
    comoResolver: "Pedir os XML das NFC-e do período (ou o relatório de vendas do PDV por item, com NCM e tributação).",
    fontes: ["sped"],
    reforma: reformaDe(nfce),
  })

  // 2.1.4 Ajustes, estornos e F100 (EFD Contribuições)
  const aj = (regs: string[], tipo: string) => l.ajustes.filter((x) => regs.includes(x.reg) && x.tipo === tipo)
  const somaAj = (xs: Ajuste[], imp: string) => xs.filter((x) => x.imposto === imp).reduce((s, x) => s + x.valor, 0)
  const apurContrib = l.apuracoes.filter((a) => a.imposto === "PIS" || a.imposto === "COFINS")
  const totalCred = apurContrib.reduce((s, a) => s + a.creditos, 0)
  const totalDeb = apurContrib.reduce((s, a) => s + a.debitos, 0)
  const f100Receita = l.f100.filter((f) => f.reg === "F100" && f.indOper !== "0")
  const f100Credito = l.f100.filter((f) => f.reg === "F100" && f.indOper === "0")
  const linhasAj = [
    { tipo: "Ajuste de acréscimo de crédito (M110/M510)", lista: aj(["M110", "M510"], "acréscimo de crédito"), sobre: totalCred },
    { tipo: "Ajuste de redução / estorno de crédito (M110/M510)", lista: aj(["M110", "M510"], "redução de crédito"), sobre: totalCred },
    { tipo: "Ajuste de acréscimo de débito (M220/M620)", lista: aj(["M220", "M620"], "acréscimo de débito"), sobre: totalDeb },
    { tipo: "Ajuste de redução / estorno de débito (M220/M620)", lista: aj(["M220", "M620"], "redução de débito"), sobre: totalDeb },
  ].map((x) => {
    const pis = somaAj(x.lista, "PIS")
    const cofins = somaAj(x.lista, "COFINS")
    const rep = pct(pis + cofins, x.sobre)
    return { tipo: x.tipo, registros: x.lista.length, pis: r2(pis), cofins: r2(cofins), total: r2(pis + cofins), rep, criticidade: rotuloCrit(porPeso(rep)) }
  })
  const f100Linhas = [
    { tipo: "F100: receitas (outras operações geradoras de contribuição)", lista: f100Receita, sobre: totalDeb },
    { tipo: "F100: créditos (outras operações com direito a crédito)", lista: f100Credito, sobre: totalCred },
  ].map((x) => {
    const pis = x.lista.reduce((s, f) => s + f.pis, 0)
    const cofins = x.lista.reduce((s, f) => s + f.cofins, 0)
    const rep = pct(pis + cofins, x.sobre)
    return { tipo: x.tipo, registros: x.lista.length, pis: r2(pis), cofins: r2(cofins), total: r2(pis + cofins), rep, criticidade: rotuloCrit(porPeso(rep)) }
  })
  const todasAj = [...linhasAj, ...f100Linhas]
  const piorAj = todasAj.reduce<Criticidade>((p, x) => maisCritica(p, critDeRotulo(x.criticidade)), "ok")
  achados.push({
    id: "2.1.4", etapa: "2", item: "2.1.4", titulo: "Ajustes, estornos e F100 no EFD Contribuições",
    criticidade: piorAj,
    resumo: `Peso de cada tipo sobre os créditos (${moeda(totalCred)}) ou débitos (${moeda(totalDeb)}) de PIS e COFINS. Acima de 10% é crítico, de 3% a 10% médio, abaixo de 3% menos crítico. Operações especiais tendem a exigir dados adicionais.`,
    tabela: tabela(
      [{ id: "tipo", nome: "Tipo", tipo: "texto" }, { id: "registros", nome: "Registros", tipo: "num" }, C.pis, C.cofins, { id: "total", nome: "Total", tipo: "moeda" }, C.rep, { id: "criticidade", nome: "Criticidade", tipo: "texto" }],
      todasAj,
    ),
    detalhe: tabela(
      [C.periodo, C.estab, { id: "reg", nome: "Registro", tipo: "texto" }, { id: "imposto", nome: "Imposto", tipo: "texto" }, { id: "tipo", nome: "Tipo", tipo: "texto" }, { id: "codigo", nome: "Código", tipo: "texto" }, { id: "descricao", nome: "Descrição", tipo: "texto" }, C.valor],
      [
        ...l.ajustes.filter((x) => ["M110", "M510", "M220", "M620"].includes(x.reg)).map((x) => ({ periodo: fmtMes(x.periodo), estab: fmtCnpj(x.estab), reg: x.reg, imposto: x.imposto, tipo: x.tipo, codigo: x.codigo, descricao: x.descricao, valor: r2(x.valor) })),
        ...l.f100.filter((f) => f.reg === "F100").map((f) => ({ periodo: fmtMes(f.periodo), estab: fmtCnpj(f.estab), reg: "F100", imposto: "PIS/COFINS", tipo: f.indOper === "0" ? "crédito" : "receita", codigo: `CST ${f.cstPis}/${f.cstCofins} · nat. ${f.natBcCred || "-"}`, descricao: f.descricao, valor: r2(f.valor) })),
      ],
    ),
    comoResolver: "Pedir a memória de cálculo dos ajustes críticos (planilha de apuração e documentos de suporte) e a composição do F100 por contrato ou operação.",
    fontes: ["l10637", "l10833", "sped"],
  })

  /* ───── Etapa 2.2: EFD Fiscal ───── */
  const fiscalItens = l.itens.filter((g) => g.fonte === "fiscal")
  const cfopsFiscal = l.porCfop.filter((x) => x.fonte === "fiscal")
  for (const [id, titulo, filtro, texto] of [
    ["2.2-imp", "Importações (CFOP iniciado em 3)", ehImportacao, "importação"],
    ["2.2-exp", "Exportações (CFOP iniciado em 7)", ehExportacao, "exportação"],
  ] as const) {
    const linhas = cfopsFiscal.filter((x) => filtro(x.cfop))
    const valor = linhas.reduce((s, x) => s + x.valor, 0)
    const sobre = id === "2.2-imp" ? base.compras : base.vendas
    const docs = l.docs.filter((d) => d.fonte === "fiscal" && valido(d) && d.cfops.some(filtro))
    achados.push({
      id, etapa: "2", item: "2.2", titulo, criticidade: linhas.length ? "info" : "ok", valor, representatividade: pct(valor, sobre),
      resumo: linhas.length
        ? `${moeda(valor)} em ${texto} (${pctTexto(pct(valor, sobre))} das ${id === "2.2-imp" ? "compras" : "vendas"}). Não é problema, mas muda a análise: ${id === "2.2-imp" ? "IBS e CBS na importação" : "imunidade com manutenção de créditos"}.`
        : `Nenhuma operação de ${texto}.`,
      tabela: linhas.length
        ? tabela([C.cfop, C.cst, { id: "aliq", nome: "Alíq. ICMS", tipo: "texto" }, C.reforma, C.valor, C.icms, C.st, C.ipi],
            agruparSimples(linhas, ["cfop", "cst", "aliq"]).map((x) => ({ ...x, reforma: ehReforma(String(x.cfop)) ? "sim" : "não" })))
        : undefined,
      detalhe: docs.length ? detalheDocs(docs, ehReforma) : undefined,
      fontes: ["lc214"],
      reforma: reformaDe(docs),
    })
  }

  // 2.2.1 Entradas com emissão própria (exceto devolução)
  const proprias = l.docs.filter((d) => d.fonte === "fiscal" && valido(d) && d.oper === "0" && d.emit === "0" && !d.cfops.every(ehDevolucao))
  const valorProprias = soma(proprias)
  const semItens = proprias.filter((d) => d.itens === 0)
  const valorSemItens = soma(semItens)
  const repProprias = pct(valorSemItens, base.compras)
  const propriasPorFornecedor = new Map<string, Record<string, string | number>>()
  for (const d of proprias)
    for (const a of d.c190.length ? d.c190 : [{ cst: "", cfop: d.cfops.join(", "), aliq: 0, valor: d.vlDoc, icms: d.icms, st: d.st, ipi: d.ipi }]) {
      const k = `${d.partDoc}|${a.cfop}|${a.cst}`
      const x = propriasPorFornecedor.get(k) ?? { part: d.partNome || d.part, partDoc: fmtCnpj(d.partDoc), cfop: a.cfop, cst: a.cst, reforma: ehReforma(a.cfop) ? "sim" : "não", vlDoc: 0, icms: 0, st: 0, ipi: 0, qtd: 0 }
      x.vlDoc = r2((x.vlDoc as number) + a.valor)
      x.icms = r2((x.icms as number) + a.icms)
      x.st = r2((x.st as number) + a.st)
      x.ipi = r2((x.ipi as number) + a.ipi)
      x.qtd = (x.qtd as number) + 1
      propriasPorFornecedor.set(k, x)
    }
  achados.push({
    id: "2.2.1", etapa: "2", item: "2.2.1", titulo: "Entradas com documento próprio (exceto devolução)",
    criticidade: porRepresentatividade(repProprias), valor: valorSemItens, representatividade: repProprias,
    resumo: proprias.length
      ? `${proprias.length} entrada(s) com nota própria (${moeda(valorProprias)}); ${semItens.length} delas sem itens (C170), ${moeda(valorSemItens)} = ${pctTexto(repProprias)} das compras (${repProprias > 0.05 ? "acima" : "abaixo"} de 5%). Sem o C170 a análise desses documentos fica fraca.`
      : "Nenhuma entrada com documento próprio.",
    tabela: proprias.length
      ? tabela([C.part, C.partDoc, C.cfop, C.cst, C.reforma, C.vlDoc, C.icms, C.st, C.ipi, C.qtd], [...propriasPorFornecedor.values()].sort((a, b) => (b.vlDoc as number) - (a.vlDoc as number)))
      : undefined,
    detalhe: proprias.length ? detalheDocs(proprias, ehReforma, [{ id: "itens", nome: "Itens (C170)", tipo: "num" }], (d) => ({ itens: d.itens })) : undefined,
    comoResolver: repProprias > 0.05 ? "Pedir os XML dessas entradas ou o template Excel da Pricetax com os itens (produto, NCM, valores e tributos)." : "Registrar o caso; pela regra dos 5%, não é preciso pedir dados adicionais.",
    fontes: ["sped"],
    reforma: reformaDe(proprias),
  })

  // 2.2.2 DIFAL para não contribuinte (C101 e E300/E310)
  const comDifal = l.docs.filter((d) => d.fonte === "fiscal" && valido(d) && d.oper === "1" && d.difal + d.fcp > 0)
  const valorDifalDocs = soma(comDifal)
  const difal = soma(comDifal, (d) => d.difal + d.fcp)
  const repDifal = pct(valorDifalDocs, base.vendas)
  const e310 = l.apuracoes.filter((a) => a.imposto === "DIFAL")
  achados.push({
    id: "2.2.2", etapa: "2", item: "2.2.2", titulo: "ICMS DIFAL para não contribuinte",
    criticidade: porRepresentatividade(repDifal), valor: valorDifalDocs, representatividade: repDifal,
    resumo: comDifal.length
      ? `${comDifal.length} venda(s) com DIFAL (C101): ${moeda(difal)} de DIFAL/FCP sobre ${moeda(valorDifalDocs)} vendidos = ${pctTexto(repDifal)} das vendas. A EFD não traz o DIFAL por item.`
      : e310.length ? `Há apuração do DIFAL (E300/E310), ${moeda(e310.reduce((s, a) => s + a.debitos, 0))} de débitos, sem C101 nos documentos.` : "Nenhum DIFAL para não contribuinte.",
    tabela: e310.length
      ? tabela([C.periodo, C.uf, { id: "debitos", nome: "Débitos DIFAL", tipo: "moeda" }, { id: "aRecolher", nome: "A recolher", tipo: "moeda" }],
          e310.map((a) => ({ periodo: fmtMes(a.periodo), uf: a.uf ?? "", debitos: r2(a.debitos), aRecolher: r2(a.aRecolher) })))
      : undefined,
    detalhe: comDifal.length ? detalheDocs(comDifal, ehReforma, [C.difal], (d) => ({ difal: r2(d.difal + d.fcp) })) : undefined,
    comoResolver: repDifal > 0.05 ? "Pedir os XML das vendas a não contribuintes ou o template Excel com os itens e o DIFAL por item." : "Registrar o caso; abaixo de 5% das vendas.",
    fontes: ["ec87", "lc190"],
    reforma: reformaDe(comDifal),
  })

  // 2.2.3 Itens genéricos (NCM 9999… ou 0000…)
  const genericos = l.itens.filter((g) => /^(9+|0+)$/.test(g.ncm) && g.reg !== "C175")
  const genEntrada = genericos.filter((g) => g.oper === "0").reduce((s, g) => s + g.valor, 0)
  const genSaida = genericos.filter((g) => g.oper === "1").reduce((s, g) => s + g.valor, 0)
  const repGen = Math.max(pct(genEntrada, base.compras), pct(genSaida, base.vendas))
  achados.push({
    id: "2.2.3", etapa: "2", item: "2.2.3", titulo: "Itens genéricos (NCM 9999… ou 0000…)",
    criticidade: porRepresentatividade(repGen), valor: genEntrada + genSaida, representatividade: repGen,
    resumo: genericos.length
      ? `${moeda(genEntrada)} em compras (${pctTexto(pct(genEntrada, base.compras))}) e ${moeda(genSaida)} em vendas (${pctTexto(pct(genSaida, base.vendas))}) com item genérico. Sem NCM não há como classificar o cClassTrib nem aplicar redução.`
      : "Nenhum item com NCM genérico.",
    tabela: genericos.length ? tabelaItens(genericos, ["oper", "ncm", "descricao", "partNome", "cfop"], ehReforma) : undefined,
    comoResolver: repGen > 0.05 ? "Pedir o cadastro correto dos itens (NCM) ou os XML com a descrição completa." : "Registrar; abaixo de 5%.",
    fontes: ["sped"],
    reforma: itensReforma(genericos),
  })

  /* ───── Etapa 3: consolidação ───── */
  const consolidacao = consolidar(l)
  achados.push({
    id: "3.1", etapa: "3", item: "3.1", titulo: "Perfil de apuração: credora ou devedora",
    criticidade: "info",
    resumo: consolidacao.perfil.map((p) => `${p.imposto}: ${p.situacao}`).join(" · ") || "Sem apuração nos arquivos.",
    tabela: tabela(
      [{ id: "imposto", nome: "Imposto", tipo: "texto" }, { id: "aRecolher", nome: "A recolher no período", tipo: "moeda" }, { id: "saldoCredorFinal", nome: "Saldo credor no último mês", tipo: "moeda" }, { id: "ajustes", nome: "Ajustes (líquido)", tipo: "moeda" }, { id: "situacao", nome: "Situação", tipo: "texto" }],
      consolidacao.perfil.map((p) => ({ ...p, aRecolher: r2(p.aRecolher), saldoCredorFinal: r2(p.saldoCredorFinal), ajustes: r2(p.ajustes) })),
    ),
    detalhe: tabela(
      [C.periodo, { id: "imposto", nome: "Imposto", tipo: "texto" }, { id: "creditosDocumentos", nome: "Créditos nos documentos", tipo: "moeda" }, { id: "debitos", nome: "Débitos", tipo: "moeda" }, { id: "creditos", nome: "Créditos apurados", tipo: "moeda" }, { id: "ajustesDebito", nome: "Ajustes a débito", tipo: "moeda" }, { id: "ajustesCredito", nome: "Ajustes a crédito", tipo: "moeda" }, { id: "estornosDebito", nome: "Estornos de débito", tipo: "moeda" }, { id: "estornosCredito", nome: "Estornos de crédito", tipo: "moeda" }, { id: "aRecolher", nome: "A recolher", tipo: "moeda" }, { id: "saldoCredor", nome: "Saldo credor", tipo: "moeda" }],
      consolidacao.linhas.map((x) => ({ ...x, periodo: fmtMes(x.periodo) })),
    ),
    fontes: ["lc87", "l10637", "l10833"],
  })

  // Ajustes de ICMS/IPI (E111, E220, E311, E530, C197) para o micro
  const ajFiscal = l.ajustes.filter((x) => !["M110", "M510", "M220", "M620"].includes(x.reg))
  if (ajFiscal.length) {
    const porCodigo = new Map<string, Record<string, string | number>>()
    for (const x of ajFiscal) {
      const k = `${x.reg}|${x.codigo}|${x.tipo}`
      const a = porCodigo.get(k) ?? { reg: x.reg, imposto: x.imposto, codigo: x.codigo, tipo: x.tipo, descricao: x.descricao, valor: 0, qtd: 0 }
      a.valor = r2((a.valor as number) + x.valor)
      a.qtd = (a.qtd as number) + 1
      porCodigo.set(k, a)
    }
    achados.push({
      id: "3.1-aj", etapa: "3", item: "3.1", titulo: "Ajustes de ICMS e IPI (E111, E220, E311, E530, C197)",
      criticidade: "info", valor: ajFiscal.reduce((s, x) => s + x.valor, 0),
      resumo: `${ajFiscal.length} lançamento(s) de ajuste. Os códigos mostram outros créditos, estornos e deduções que explicam a apuração.`,
      tabela: tabela([{ id: "reg", nome: "Registro", tipo: "texto" }, { id: "imposto", nome: "Imposto", tipo: "texto" }, { id: "codigo", nome: "Código", tipo: "texto" }, { id: "tipo", nome: "Natureza", tipo: "texto" }, { id: "descricao", nome: "Descrição", tipo: "texto" }, C.valor, C.qtd],
        [...porCodigo.values()].sort((a, b) => (b.valor as number) - (a.valor as number))),
      detalhe: tabela([C.periodo, C.estab, { id: "reg", nome: "Registro", tipo: "texto" }, { id: "codigo", nome: "Código", tipo: "texto" }, { id: "tipo", nome: "Natureza", tipo: "texto" }, { id: "descricao", nome: "Descrição", tipo: "texto" }, C.doc, C.valor],
        ajFiscal.map((x) => ({ periodo: fmtMes(x.periodo), estab: fmtCnpj(x.estab), reg: x.reg, codigo: x.codigo, tipo: x.tipo, descricao: x.descricao, doc: x.doc ?? "", valor: r2(x.valor) }))),
      fontes: ["lc87", "sped"],
    })
  }

  // 3.2 Receitas financeiras, depreciação, locação e outras operações do bloco F
  const NAT: Record<string, string> = {
    "01": "aquisição de bens para revenda", "02": "bens utilizados como insumo", "03": "serviços utilizados como insumo", "04": "energia elétrica e térmica",
    "05": "aluguéis de prédios", "06": "aluguéis de máquinas e equipamentos", "07": "armazenagem e frete na venda", "08": "arrendamento mercantil",
    "09": "máquinas e equipamentos (depreciação)", "10": "máquinas e equipamentos (aquisição)", "11": "amortização e depreciação de edificações",
    "12": "devolução de vendas", "13": "outras operações com direito a crédito", "14": "transporte (subcontratação)", "15": "atividade imobiliária (custo incorrido)",
    "16": "atividade imobiliária (custo orçado)", "17": "mão de obra (limpeza, conservação)", "18": "estoque de abertura",
  }
  const categoria = (f: (typeof l.f100)[number]) => {
    const d = f.descricao.toLowerCase()
    if (f.reg === "F120" || ["09", "11"].includes(f.natBcCred)) return "Crédito sobre depreciação / amortização"
    if (f.reg === "F130" || f.natBcCred === "10") return "Crédito sobre aquisição de ativo"
    if (["05", "06"].includes(f.natBcCred) || /alug|loca[cç]/.test(d)) return "Locação / aluguel"
    if (f.natBcCred === "08" || /arrendamento|leasing/.test(d)) return "Arrendamento mercantil"
    if (/financ|juros|rendiment|aplica[cç]|varia[cç][aã]o cambial|desconto obtido/.test(d)) return "Receitas financeiras"
    if (f.reg === "M400" || f.reg === "M800" || f.reg === "M410" || f.reg === "M810") return "Receitas sem incidência, isentas ou com alíquota zero (M400/M800)"
    return f.indOper === "0" ? `Outros créditos (${NAT[f.natBcCred] ?? "natureza não informada"})` : "Outras receitas (F100)"
  }
  const cat = new Map<string, { categoria: string; registros: number; valor: number; pis: number; cofins: number }>()
  for (const f of l.f100) {
    const k = categoria(f)
    const x = cat.get(k) ?? { categoria: k, registros: 0, valor: 0, pis: 0, cofins: 0 }
    x.registros++
    x.valor = r2(x.valor + f.valor)
    x.pis = r2(x.pis + f.pis)
    x.cofins = r2(x.cofins + f.cofins)
    cat.set(k, x)
  }
  achados.push({
    id: "3.2", etapa: "3", item: "3.2", titulo: "Receitas financeiras, depreciação, locação e outras operações",
    criticidade: cat.size ? "info" : "ok",
    resumo: cat.size ? [...cat.values()].map((x) => `${x.categoria}: ${moeda(x.valor)}`).join(" · ") : "Nenhuma operação nos blocos F e M400/M800.",
    tabela: cat.size ? tabela([{ id: "categoria", nome: "Categoria", tipo: "texto" }, { id: "registros", nome: "Registros", tipo: "num" }, C.valor, C.pis, C.cofins], [...cat.values()].sort((a, b) => b.valor - a.valor)) : undefined,
    detalhe: l.f100.length
      ? tabela([C.periodo, C.estab, { id: "reg", nome: "Registro", tipo: "texto" }, { id: "categoria", nome: "Categoria", tipo: "texto" }, { id: "nat", nome: "Natureza", tipo: "texto" }, { id: "cst", nome: "CST PIS/COFINS", tipo: "texto" }, { id: "descricao", nome: "Descrição", tipo: "texto" }, C.partDoc, C.valor, C.pis, C.cofins],
          l.f100.map((f) => ({ periodo: fmtMes(f.periodo), estab: fmtCnpj(f.estab), reg: f.reg, categoria: categoria(f), nat: f.natBcCred ? `${f.natBcCred} ${NAT[f.natBcCred] ?? ""}` : "", cst: `${f.cstPis}/${f.cstCofins}`, descricao: f.descricao, partDoc: fmtCnpj(f.partDoc), valor: r2(f.valor), pis: r2(f.pis), cofins: r2(f.cofins) })))
      : undefined,
    fontes: ["l10637", "l10833"],
  })

  // 3.3 Crédito presumido (ICMS por ajuste; PIS/COFINS por CST 60 a 67)
  const presumidoIcms = l.ajustes.filter((x) => /presum/i.test(x.descricao))
  const presumidoPc = l.itens.filter((g) => /^6[0-7]$/.test(g.cstPis) || /^6[0-7]$/.test(g.cstCofins))
  const bcPc = presumidoPc.reduce((s, g) => s + g.valor, 0)
  const credPc = presumidoPc.reduce((s, g) => s + g.pis + g.cofins, 0)
  achados.push({
    id: "3.3", etapa: "3", item: "3.3", titulo: "Crédito presumido",
    criticidade: presumidoIcms.length || presumidoPc.length ? "media" : "ok",
    valor: presumidoIcms.reduce((s, x) => s + x.valor, 0) + credPc,
    resumo: presumidoIcms.length || presumidoPc.length
      ? [
          presumidoIcms.length ? `ICMS: ${presumidoIcms.length} ajuste(s), ${moeda(presumidoIcms.reduce((s, x) => s + x.valor, 0))}.` : "",
          presumidoPc.length ? `PIS/COFINS (CST 60 a 67): ${moeda(credPc)} de crédito sobre ${moeda(bcPc)}, alíquota efetiva de ${pctTexto(pct(credPc, bcPc))}.` : "",
          "Conferir o fundamento do benefício e as condições de manutenção na transição.",
        ].filter(Boolean).join(" ")
      : "Nenhum crédito presumido identificado.",
    tabela: presumidoPc.length ? tabelaItens(presumidoPc, ["cstPis", "aliqPis", "cstCofins", "aliqCofins", "ncm", "descricao"], ehReforma, ["pis", "cofins"]) : undefined,
    detalhe: presumidoIcms.length
      ? tabela([C.periodo, C.estab, { id: "reg", nome: "Registro", tipo: "texto" }, { id: "codigo", nome: "Código", tipo: "texto" }, { id: "descricao", nome: "Descrição", tipo: "texto" }, C.valor],
          presumidoIcms.map((x) => ({ periodo: fmtMes(x.periodo), estab: fmtCnpj(x.estab), reg: x.reg, codigo: x.codigo, descricao: x.descricao, valor: r2(x.valor) })))
      : undefined,
    comoResolver: "Conferir o ato concessivo (ICMS: legislação da UF indicada pelo código do ajuste; PIS/COFINS: o artigo de lei correspondente ao CST e à natureza do crédito) e se o benefício está entre os mantidos na transição.",
    fontes: ["l10925", "lc214", "sped"],
  })

  // 3.4 Crédito de ICMS de fornecedor do Simples Nacional (CSOSN no C170 com ICMS)
  const CSOSN = new Set(["101", "102", "103", "201", "202", "203", "900"])
  const simples = fiscalItens.filter((g) => g.oper === "0" && CSOSN.has(g.cstIcms) && g.icms > 0)
  const credSimples = simples.reduce((s, g) => s + g.icms, 0)
  achados.push({
    id: "3.4", etapa: "3", item: "3.4", titulo: "Crédito de ICMS de fornecedor do Simples Nacional",
    criticidade: simples.length ? "media" : "ok", valor: credSimples,
    resumo: simples.length
      ? `${moeda(credSimples)} de crédito de ICMS em itens com CSOSN de Simples Nacional, lidos do C170 (registro de itens) do EFD ICMS/IPI. Conferir se o crédito segue o percentual informado na nota do fornecedor.`
      : "Nenhum crédito de ICMS em itens com CSOSN (C170).",
    tabela: simples.length ? tabelaItens(simples, ["partNome", "partDoc", "cfop", "cstIcms", "aliqIcms", "ncm"], ehReforma, ["icms"]) : undefined,
    comoResolver: "Conferir no XML (campo pCredSN/vCredICMSSN) o crédito permitido ao adquirente.",
    fontes: ["lc123"],
    reforma: itensReforma(simples),
  })

  // 3.5 Lucro Real com PIS/COFINS fora de 1,65% e 7,6% nas vendas e serviços
  const lucroReal = contribs.some((a) => a.incidencia === "1" || a.incidencia === "3")
  const saidasPc = l.itens.filter((g) => g.fonte === "contribuicoes" && g.oper === "1" && ["01", "02", "03"].includes(g.cstPis))
  const foraPadrao = lucroReal ? saidasPc.filter((g) => Math.abs(g.aliqPis - 1.65) > 0.001 || Math.abs(g.aliqCofins - 7.6) > 0.001) : []
  achados.push({
    id: "3.5", etapa: "3", item: "3.5", titulo: `Regime declarado: ${regime}`,
    criticidade: foraPadrao.length ? "media" : lucroReal || contribs.length ? "ok" : "info",
    valor: foraPadrao.reduce((s, g) => s + g.valor, 0),
    resumo: !contribs.length
      ? "Sem EFD Contribuições, não há como confirmar o regime."
      : lucroReal
        ? foraPadrao.length
          ? `Lucro Real, mas ${moeda(foraPadrao.reduce((s, g) => s + g.valor, 0))} de vendas tributadas com PIS/COFINS diferente de 1,65% + 7,6% (9,25%). Veja as exceções por CFOP, NCM e CST.`
          : "Lucro Real, com todas as vendas tributadas a 1,65% + 7,6% (9,25%)."
        : "Lucro Presumido (cumulativo): PIS 0,65% e COFINS 3% nas receitas tributadas.",
    tabela: foraPadrao.length ? tabelaItens(foraPadrao, ["cfop", "ncm", "descricao", "cstPis", "aliqPis", "cstCofins", "aliqCofins"], ehReforma, ["pis", "cofins"]) : undefined,
    fontes: ["l10637", "l10833"],
    reforma: itensReforma(foraPadrao),
  })

  // 3.6 Monofásico, alíquota zero, isenção, suspensão, sem incidência (CST 04 a 09)
  const CST_ESPECIAL: Record<string, string> = {
    "04": "monofásica (revenda a alíquota zero)", "05": "substituição tributária", "06": "alíquota zero", "07": "isenta", "08": "sem incidência", "09": "suspensão",
  }
  const especiais = l.itens.filter((g) => g.oper === "1" && (CST_ESPECIAL[g.cstPis] || CST_ESPECIAL[g.cstCofins]))
  const motivo = (cst: string, ncm: string) => {
    const cap = ncm.slice(0, 4)
    if (cst === "04") {
      if (/^(3003|3004)/.test(cap)) return "Medicamentos: monofásico da Lei 10.147/2000."
      if (/^(3303|3304|3305|3306|3307|3401)/.test(cap)) return "Perfumaria e higiene: monofásico da Lei 10.147/2000."
      if (/^(8708|4011|4013|8409|8413|8483)/.test(cap)) return "Autopeças: monofásico da Lei 10.485/2002 (conferir o Anexo)."
      if (/^(2710|2207)/.test(cap)) return "Combustíveis: monofásico (Lei 9.718/1998 e legislação específica)."
      if (/^(2201|2202|2203)/.test(cap)) return "Bebidas frias: conferir a legislação específica do produto."
      return "Monofásico: conferir se o NCM está na lista legal; se não estiver, a receita deveria ser tributada."
    }
    if (cst === "06") {
      if (/^(31)/.test(cap)) return "Fertilizantes: alíquota zero da Lei 10.925/2004, art. 1º."
      if (/^(1006|0713|1101|0401|0402|1901|0201|0202|0203|0207|0302|0303|0304|1507|1517)/.test(cap)) return "Cesta básica: alíquota zero (Lei 10.925/2004 e alterações)."
      return "Alíquota zero: conferir o dispositivo legal do produto."
    }
    if (cst === "09") return "Suspensão: depende de condição do comprador (ex.: agroindústria, exportadora); conferir o atendimento."
    if (cst === "07" || cst === "08") return "Isenção ou não incidência: conferir o dispositivo (ex.: exportação, ZFM)."
    return "Substituição tributária: o fabricante recolhe pelo revendedor."
  }
  const tabEsp = tabelaItens(especiais, ["cfop", "ncm", "descricao", "cstPis", "cstCofins"], ehReforma, ["pis", "cofins"])
  tabEsp.colunas.push({ id: "motivo", nome: "Possível motivo", tipo: "texto" })
  for (const ln of tabEsp.linhas) ln.motivo = motivo(String(ln.cstPis), String(ln.ncm))
  achados.push({
    id: "3.6", etapa: "3", item: "3.6", titulo: "Vendas monofásicas, com alíquota zero, isentas, suspensas ou sem incidência",
    criticidade: especiais.length ? "media" : "ok", valor: especiais.reduce((s, g) => s + g.valor, 0),
    representatividade: pct(especiais.reduce((s, g) => s + g.valor, 0), base.vendas),
    resumo: especiais.length
      ? Object.entries(groupBy(especiais, (g) => g.cstPis)).map(([cst, gs]) => `CST ${cst} (${CST_ESPECIAL[cst] ?? "outro"}): ${moeda(gs.reduce((s, g) => s + g.valor, 0))}`).join(" · ")
      : "Nenhuma venda com CST especial de PIS/COFINS.",
    tabela: especiais.length ? tabEsp : undefined,
    fontes: ["l10147", "l10485", "l10925", "l10865", "l9718"],
    reforma: itensReforma(especiais),
  })

  // 3.7 Zona Franca de Manaus (CFOP 6109/6110, UF AM/RR/AP/AC/RO, SUFRAMA)
  const zfm = l.docs.filter((d) => valido(d) && (d.cfops.some((c) => ["6109", "6110", "5109", "5110"].includes(c)) || (d.oper === "1" && ["AM", "RR", "AP", "AC", "RO"].includes(d.partUf) && d.cfops.some((c) => c === "6109" || c === "6110"))))
  const zfmUf = l.docs.filter((d) => valido(d) && d.oper === "1" && ["AM", "RR", "AP", "AC", "RO"].includes(d.partUf))
  const casosZfm = [...new Set([...zfm, ...zfmUf])]
  achados.push({
    id: "3.7", etapa: "3", item: "3.7", titulo: "Operações com a Zona Franca de Manaus e Áreas de Livre Comércio",
    criticidade: casosZfm.length ? "info" : "ok", valor: soma(casosZfm),
    resumo: casosZfm.length
      ? `${casosZfm.length} documento(s), ${moeda(soma(casosZfm))}: vendas com CFOP 6109/6110 ou para AM, RR, AP, AC e RO. Na reforma, a ZFM tem regime próprio de IBS e CBS.`
      : "Nenhuma operação com a Zona Franca ou Áreas de Livre Comércio.",
    detalhe: casosZfm.length ? detalheDocs(casosZfm, ehReforma) : undefined,
    fontes: ["dl288", "lc214"],
    reforma: reformaDe(casosZfm),
  })

  // 3.8 IPI: acima e abaixo de 6,5% (possível permanência do IPI)
  const comIpi = l.itens.filter((g) => g.ipi > 0 || g.aliqIpi > 0)
  const acima = comIpi.filter((g) => g.aliqIpi > 6.5)
  const ateLimite = comIpi.filter((g) => g.aliqIpi > 0 && g.aliqIpi <= 6.5)
  const tabIpi = tabelaItens(comIpi, ["oper", "ncm", "descricao", "cstIpi", "aliqIpi"], ehReforma, ["ipi"])
  tabIpi.colunas.push({ id: "faixa", nome: "Faixa", tipo: "texto" })
  for (const ln of tabIpi.linhas) ln.faixa = Number(ln.aliqIpi) > 6.5 ? "acima de 6,5%" : "até 6,5%"
  achados.push({
    id: "3.8", etapa: "3", item: "3.8", titulo: "Operações com IPI (acima e abaixo de 6,5%)",
    criticidade: acima.length ? "media" : comIpi.length ? "info" : "ok", valor: comIpi.reduce((s, g) => s + g.ipi, 0),
    resumo: comIpi.length
      ? `IPI em compras e vendas: ${moeda(acima.reduce((s, g) => s + g.ipi, 0))} em itens com alíquota acima de 6,5% e ${moeda(ateLimite.reduce((s, g) => s + g.ipi, 0))} até 6,5%. Pela EC 132/2023, o IPI vai a zero em 2027, exceto para produtos com industrialização incentivada na ZFM: os itens acima de 6,5% são candidatos à permanência e merecem conferência.`
      : "Nenhuma operação com IPI.",
    tabela: comIpi.length ? tabIpi : undefined,
    fontes: ["ec132", "lc214"],
    reforma: itensReforma(comIpi),
  })

  // 3.9 Registros especiais e possíveis inconsistências
  const especiais39: { ponto: string; criticidade: Criticidade; onde: string }[] = []
  for (const a of fiscaisValidos) {
    if (a.indAtiv === "0" && !a.registros.K200 && !a.registros.K230)
      especiais39.push({ ponto: "Empresa industrial sem Bloco K (produção e estoque)", criticidade: "media", onde: `${fmtCnpj(a.cnpj)} · ${fmtMes(a.periodo)}` })
    if (a.periodo.endsWith("-02") && !a.registros.H010)
      especiais39.push({ ponto: "Fevereiro sem inventário (Bloco H, H010)", criticidade: "baixa", onde: `${fmtCnpj(a.cnpj)} · ${fmtMes(a.periodo)}` })
    if (!a.registros.G110 && l.porCfop.some((x) => x.estab === a.cnpj && x.periodo === a.periodo && /^[12]55[1-3]$/.test(x.cfop)))
      especiais39.push({ ponto: "Compra de ativo (CFOP 1551/2551) sem CIAP (Bloco G)", criticidade: "media", onde: `${fmtCnpj(a.cnpj)} · ${fmtMes(a.periodo)}` })
    if (a.registros.C101 && !a.registros.E300)
      especiais39.push({ ponto: "DIFAL nos documentos (C101) sem apuração do DIFAL (E300/E310)", criticidade: "alta", onde: `${fmtCnpj(a.cnpj)} · ${fmtMes(a.periodo)}` })
    if (a.erros.length) especiais39.push({ ponto: `Linhas que não puderam ser lidas (${a.erros.length})`, criticidade: "media", onde: a.nome })
  }
  const semChave = l.docs.filter((d) => valido(d) && d.mod === "55" && d.chave.length !== 44)
  if (semChave.length) especiais39.push({ ponto: `${semChave.length} NF-e (modelo 55) sem chave de acesso válida`, criticidade: "media", onde: "documentos" })
  const chaves = new Map<string, number>()
  for (const d of l.docs.filter((x) => x.fonte === "fiscal" && x.chave)) chaves.set(`${d.estab}|${d.chave}`, (chaves.get(`${d.estab}|${d.chave}`) ?? 0) + 1)
  const repetidas = [...chaves.values()].filter((n) => n > 1).length
  if (repetidas) especiais39.push({ ponto: `${repetidas} chave(s) de acesso escriturada(s) mais de uma vez no mesmo estabelecimento`, criticidade: "alta", onde: "EFD ICMS/IPI" })
  const divergeItens = l.docs.filter((d) => d.itens > 0 && d.vlMerc > 0 && Math.abs(d.somaItens - d.vlMerc) > 1)
  if (divergeItens.length) especiais39.push({ ponto: `${divergeItens.length} documento(s) com soma dos itens diferente do valor das mercadorias`, criticidade: "media", onde: "C100 × C170" })
  const grandesAjustes = l.ajustes.filter((x) => x.reg === "E111" && x.valor > 0)
  if (grandesAjustes.length) especiais39.push({ ponto: `${grandesAjustes.length} ajuste(s) da apuração do ICMS (E111): conferir o fundamento de cada código`, criticidade: "baixa", onde: "E111" })
  const canceladas = l.docs.filter((d) => !valido(d)).length
  if (canceladas) especiais39.push({ ponto: `${canceladas} documento(s) cancelado(s), denegado(s) ou inutilizado(s), fora da análise`, criticidade: "info", onde: "C100 COD_SIT" })
  achados.push({
    id: "3.9", etapa: "3", item: "3.9", titulo: "Registros especiais e possíveis inconsistências",
    criticidade: especiais39.reduce<Criticidade>((p, x) => maisCritica(p, x.criticidade), "ok"),
    resumo: especiais39.length ? `${especiais39.length} ponto(s) para conferir. Regras automáticas de consistência entre blocos.` : "Nenhum ponto especial encontrado pelas regras automáticas.",
    tabela: especiais39.length
      ? tabela([{ id: "ponto", nome: "Ponto", tipo: "texto" }, { id: "criticidade", nome: "Criticidade", tipo: "texto" }, { id: "onde", nome: "Onde", tipo: "texto" }], especiais39.map((x) => ({ ...x, criticidade: rotuloCrit(x.criticidade) })))
      : undefined,
    detalhe: divergeItens.length ? detalheDocs(divergeItens, ehReforma, [{ id: "somaItens", nome: "Soma dos itens", tipo: "moeda" }, { id: "vlMerc", nome: "Valor das mercadorias", tipo: "moeda" }], (d) => ({ somaItens: r2(d.somaItens), vlMerc: r2(d.vlMerc) })) : undefined,
    fontes: ["sped"],
  })

  return {
    empresa: { nome: principal?.empresa ?? "", cnpj: principal?.cnpj ?? "", uf: principal?.uf ?? "", regime, incidencia: contribs[0]?.incidencia ?? "" },
    periodo: { inicio: meses[0] ?? "", fim: meses[meses.length - 1] ?? "", meses },
    arquivos: l.arquivos.map((a) => ({ indice: a.indice, nome: a.nome, tipo: a.tipo, cnpj: a.cnpj, empresa: a.empresa, periodo: a.periodo, finalidade: a.finalidade, versao: a.versao, linhas: a.linhas, uf: a.uf, erros: a.erros.length })),
    estabelecimentos: [...estabs.values()].sort((a, b) => a.cnpj.localeCompare(b.cnpj)),
    checklist,
    pendencias,
    achados,
    consolidacao,
    base,
  }
}

/* ─────────────── consolidação (3.1) ─────────────── */

function consolidar(l: Leitura): Consolidacao {
  const linhas = new Map<string, LinhaApuracao>()
  const linha = (periodo: string, imposto: Apuracao["imposto"]) => {
    const k = `${periodo}|${imposto}`
    if (!linhas.has(k))
      linhas.set(k, { periodo, imposto, creditosDocumentos: 0, debitos: 0, creditos: 0, ajustesDebito: 0, ajustesCredito: 0, estornosDebito: 0, estornosCredito: 0, aRecolher: 0, saldoCredor: 0 })
    return linhas.get(k)!
  }
  for (const a of l.apuracoes) {
    const x = linha(a.periodo, a.imposto)
    x.debitos += a.debitos
    x.creditos += a.creditos
    x.ajustesDebito += a.ajustesDebito
    x.ajustesCredito += a.ajustesCredito
    x.estornosDebito += a.estornosDebito
    x.estornosCredito += a.estornosCredito
    x.aRecolher += a.aRecolher
    x.saldoCredor += a.saldoCredorTransportar
  }
  for (const c of l.porCfop.filter((x) => x.fonte === "fiscal" && x.oper === "0")) {
    linha(c.periodo, "ICMS").creditosDocumentos += c.icms
    linha(c.periodo, "IPI").creditosDocumentos += c.ipi
  }
  for (const g of l.itens.filter((x) => x.fonte === "contribuicoes" && x.oper === "0" && /^(5\d|6\d)$/.test(x.cstPis))) {
    linha(g.periodo, "PIS").creditosDocumentos += g.pis
    linha(g.periodo, "COFINS").creditosDocumentos += g.cofins
  }
  const lista = [...linhas.values()].map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])) as LinhaApuracao)
  lista.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.imposto.localeCompare(b.imposto))
  const impostos = [...new Set(lista.map((x) => x.imposto))]
  const perfil = impostos.map((imposto) => {
    const xs = lista.filter((x) => x.imposto === imposto)
    const aRecolher = xs.reduce((s, x) => s + x.aRecolher, 0)
    const saldoCredorFinal = xs[xs.length - 1]?.saldoCredor ?? 0
    const ajustes = xs.reduce((s, x) => s + x.ajustesCredito + x.estornosDebito - x.ajustesDebito - x.estornosCredito, 0)
    const mesesDevedor = xs.filter((x) => x.aRecolher > 0.005).length
    const situacao =
      saldoCredorFinal > 0.005 && aRecolher < 0.005
        ? "credora (acumula saldo)"
        : mesesDevedor === xs.length
          ? "devedora (paga todo mês)"
          : saldoCredorFinal > 0.005
            ? "oscila (paga em alguns meses e acumula saldo)"
            : "devedora em parte do período"
    return { imposto, aRecolher, saldoCredorFinal, ajustes, situacao }
  })
  return { linhas: lista, perfil }
}

/* ─────────────── utilitários ─────────────── */

function agruparSimples<T extends Record<string, unknown>>(xs: T[], dims: string[]) {
  const m = new Map<string, Record<string, string | number>>()
  for (const x of xs) {
    const k = dims.map((d) => String(x[d])).join("|")
    const a = m.get(k) ?? Object.fromEntries(dims.map((d) => [d, String(x[d])]))
    for (const [c, v] of Object.entries(x)) if (typeof v === "number" && !dims.includes(c)) a[c] = r2(((a[c] as number) ?? 0) + v)
    m.set(k, a)
  }
  return [...m.values()].sort((a, b) => ((b.valor as number) ?? 0) - ((a.valor as number) ?? 0))
}

function groupBy<T>(xs: T[], f: (x: T) => string) {
  const r: Record<string, T[]> = {}
  for (const x of xs) (r[f(x)] ??= []).push(x)
  return r
}

const ORDEM: Criticidade[] = ["ok", "info", "baixa", "media", "alta"]
export const maisCritica = (a: Criticidade, b: Criticidade) => (ORDEM.indexOf(b) > ORDEM.indexOf(a) ? b : a)
export const rotuloCrit = (c: Criticidade) => ({ alta: "Alta", media: "Média", baixa: "Baixa", info: "Informativo", ok: "OK" })[c]
const critDeRotulo = (r: string): Criticidade => (({ Alta: "alta", Média: "media", Baixa: "baixa", Informativo: "info", OK: "ok" }) as Record<string, Criticidade>)[r] ?? "ok"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const moeda = (v: number) => brl.format(Math.abs(v) < 0.005 ? 0 : v)
export const pctTexto = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
