import { classificador, type RegraCfop } from "./cfop"
import { versoesValidas, fmtCnpj, moeda, type Achado, type Tabela } from "./analise"
import type { Doc, Leitura } from "./tipos"

/*
 * Etapa 4: EFD (Fiscal + Contribuições, sem duplicidade pela chave de acesso) × relatório padrão da
 * Pricetax (Excel/CSV). Cruza documento a documento quando há chave, e por fornecedor, NCM e CFOP
 * sempre, e explica cada diferença pela regra que mais provavelmente a causou.
 */

/** Uma linha do relatório da Pricetax já com os nomes padronizados. */
export type LinhaPricetax = {
  chave: string
  numero: string
  cnpj: string
  oper: string // "0" entrada, "1" saída, "" desconhecido
  ncm: string
  cfop: string
  produto: string
  cst: string
  ufOrigem: string
  ufDestino: string
  valorBruto: number
  desconto: number
  frete: number
  outras: number
  icms: number
  ipi: number
  pis: number
  cofins: number
  st: number
  difal: number
}

/** Os campos que o mapeamento procura, com os nomes que costumam aparecer nos relatórios. */
export const CAMPOS: { id: keyof LinhaPricetax; nome: string; numero: boolean; sinonimos: string[] }[] = [
  { id: "chave", nome: "Chave de acesso", numero: false, sinonimos: ["chave", "chave de acesso", "chave nfe", "chave_documento", "chv_nfe", "chave da nota"] },
  { id: "numero", nome: "Número do documento", numero: false, sinonimos: ["numero", "número", "numero nf", "numero_nf", "num_doc", "nota", "nf", "documento"] },
  { id: "cnpj", nome: "CNPJ/CPF do fornecedor ou cliente", numero: false, sinonimos: ["cnpj", "cnpj_outra_parte", "cnpj fornecedor", "cnpj cliente", "cpf/cnpj", "cnpj/cpf", "participante"] },
  { id: "oper", nome: "Entrada ou saída", numero: false, sinonimos: ["tipo_movimentacao", "movimentacao", "entrada/saida", "operacao", "tipo"] },
  { id: "ncm", nome: "NCM", numero: false, sinonimos: ["ncm", "cod_ncm", "codigo ncm"] },
  { id: "cfop", nome: "CFOP", numero: false, sinonimos: ["cfop"] },
  { id: "produto", nome: "Produto", numero: false, sinonimos: ["produto", "descricao_produto", "descrição", "descricao", "item", "codigo_produto", "cod_item"] },
  { id: "cst", nome: "CST ICMS", numero: false, sinonimos: ["cst", "cst_icms", "cst icms"] },
  { id: "ufOrigem", nome: "UF de origem", numero: false, sinonimos: ["uf origem", "uf_emitente", "uf emitente", "uf_origem"] },
  { id: "ufDestino", nome: "UF de destino", numero: false, sinonimos: ["uf destino", "uf_destino", "uf destinatario"] },
  { id: "valorBruto", nome: "Valor bruto (total)", numero: true, sinonimos: ["valor bruto", "valor_bruto_input", "valor total", "vl_doc", "valor do documento", "total", "valor"] },
  { id: "desconto", nome: "Desconto", numero: true, sinonimos: ["desconto", "vl_desc", "valor desconto"] },
  { id: "frete", nome: "Frete", numero: true, sinonimos: ["frete", "vl_frt", "valor frete"] },
  { id: "outras", nome: "Outras despesas", numero: true, sinonimos: ["outras despesas", "outras", "vl_out_da", "despesas acessorias"] },
  { id: "icms", nome: "ICMS", numero: true, sinonimos: ["icms", "valor icms", "valor_icms_input", "vl_icms", "valor_icms_nota_input"] },
  { id: "ipi", nome: "IPI", numero: true, sinonimos: ["ipi", "valor ipi", "valor_ipi_input", "vl_ipi"] },
  { id: "pis", nome: "PIS", numero: true, sinonimos: ["pis", "valor pis", "vl_pis"] },
  { id: "cofins", nome: "COFINS", numero: true, sinonimos: ["cofins", "valor cofins", "vl_cofins"] },
  { id: "st", nome: "ICMS-ST", numero: true, sinonimos: ["icms st", "icms-st", "st", "valor_icms_st_input", "vl_icms_st"] },
  { id: "difal", nome: "ICMS DIFAL", numero: true, sinonimos: ["difal", "icms difal", "valor_icms_difal_input"] },
]

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim()

/** Sugere, para cada campo, a coluna do arquivo com o nome mais parecido. */
export function sugerirMapeamento(cabecalho: string[]): Partial<Record<keyof LinhaPricetax, string>> {
  const r: Partial<Record<keyof LinhaPricetax, string>> = {}
  const usadas = new Set<string>()
  for (const campo of CAMPOS) {
    const alvo = campo.sinonimos.map(norm)
    const exata = cabecalho.find((c) => !usadas.has(c) && alvo.includes(norm(c)))
    const parcial = exata ?? cabecalho.find((c) => !usadas.has(c) && alvo.some((s) => s.length > 3 && norm(c).includes(s)))
    if (parcial) {
      r[campo.id] = parcial
      usadas.add(parcial)
    }
  }
  return r
}

/** Número de planilha: aceita 1.234,56, 1234.56 e número já convertido. */
export function numeroPlanilha(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  const s = String(v ?? "").trim().replace(/[R$\s]/g, "")
  if (!s) return 0
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s)
  return Number.isFinite(n) ? n : 0
}

export function aplicarMapeamento(linhas: Record<string, unknown>[], mapa: Partial<Record<keyof LinhaPricetax, string>>): LinhaPricetax[] {
  return linhas.map((ln) => {
    const v = (id: keyof LinhaPricetax) => (mapa[id] ? ln[mapa[id]!] : undefined)
    const txt = (id: keyof LinhaPricetax) => String(v(id) ?? "").trim()
    const oper = norm(txt("oper"))
    return {
      chave: txt("chave").replace(/\D/g, ""),
      numero: txt("numero").replace(/^0+/, ""),
      cnpj: txt("cnpj").replace(/\D/g, ""),
      oper: /^(0|e|entrada|compra)/.test(oper) ? "0" : /^(1|s|saida|venda)/.test(oper) ? "1" : "",
      ncm: txt("ncm").replace(/\D/g, ""),
      cfop: txt("cfop").replace(/\D/g, ""),
      produto: txt("produto"),
      cst: txt("cst"),
      ufOrigem: txt("ufOrigem").toUpperCase(),
      ufDestino: txt("ufDestino").toUpperCase(),
      valorBruto: numeroPlanilha(v("valorBruto")),
      desconto: numeroPlanilha(v("desconto")),
      frete: numeroPlanilha(v("frete")),
      outras: numeroPlanilha(v("outras")),
      icms: numeroPlanilha(v("icms")),
      ipi: numeroPlanilha(v("ipi")),
      pis: numeroPlanilha(v("pis")),
      cofins: numeroPlanilha(v("cofins")),
      st: numeroPlanilha(v("st")),
      difal: numeroPlanilha(v("difal")),
    }
  })
}

/** Lê CSV (separador ; ou ,) com aspas. */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ";" : ","
  const partir = (l: string) => {
    const r: string[] = []
    let atual = ""
    let aspas = false
    for (let i = 0; i < l.length; i++) {
      const c = l[i]
      if (c === '"') {
        if (aspas && l[i + 1] === '"') {
          atual += '"'
          i++
        } else aspas = !aspas
      } else if (c === sep && !aspas) {
        r.push(atual)
        atual = ""
      } else atual += c
    }
    r.push(atual)
    return r
  }
  const cab = partir(linhas[0]).map((c) => c.trim())
  return linhas.slice(1).map((l) => {
    const v = partir(l)
    return Object.fromEntries(cab.map((c, i) => [c, v[i] ?? ""]))
  })
}

type Totais = { vlDoc: number; desc: number; frete: number; outras: number; icms: number; ipi: number; pis: number; cofins: number; st: number; difal: number }
const zero = (): Totais => ({ vlDoc: 0, desc: 0, frete: 0, outras: 0, icms: 0, ipi: 0, pis: 0, cofins: 0, st: 0, difal: 0 })
const r2 = (v: number) => Math.round(v * 100) / 100
const IMPOSTOS = ["icms", "ipi", "pis", "cofins", "st", "difal"] as const satisfies readonly (keyof Totais & keyof LinhaPricetax)[]

/** EFD Fiscal + Contribuições sem duplicidade: um documento por chave (ICMS/IPI do Fiscal, PIS/COFINS do Contribuições). */
export function unirDocumentos(l: Leitura) {
  const validos = versoesValidas(l.arquivos)
  const porChave = new Map<string, { doc: Doc; fontes: Set<string> }>()
  for (const d of l.docs.filter((x) => validos.has(x.arquivo) && !["02", "03", "04", "05"].includes(x.sit))) {
    const k = d.chave && d.chave.length >= 44 ? d.chave : `${d.partDoc}|${d.serie}|${d.num}|${d.oper}`
    const atual = porChave.get(k)
    if (!atual) {
      porChave.set(k, { doc: { ...d, cfops: [...d.cfops] }, fontes: new Set([d.fonte]) })
      continue
    }
    atual.fontes.add(d.fonte)
    const a = atual.doc
    if (d.fonte === "fiscal") {
      Object.assign(a, { icms: d.icms, ipi: d.ipi, st: d.st, difal: d.difal, fcp: d.fcp, bcIcms: d.bcIcms, vlDoc: d.vlDoc || a.vlDoc })
    } else {
      a.pis = d.pis || a.pis
      a.cofins = d.cofins || a.cofins
    }
    for (const c of d.cfops) if (!a.cfops.includes(c)) a.cfops.push(c)
  }
  return porChave
}

export function cruzar(l: Leitura, pricetax: LinhaPricetax[], regra: RegraCfop): { achados: Achado[]; resumo: Record<string, number> } {
  const ehReforma = classificador(regra)
  const efd = unirDocumentos(l)
  const nos = new Map<string, Totais & { linhas: number; cnpj: string; numero: string; cfops: Set<string>; ncms: Set<string> }>()
  for (const p of pricetax) {
    const k = p.chave.length >= 44 ? p.chave : `${p.cnpj}|${p.numero}`
    const t = nos.get(k) ?? { ...zero(), linhas: 0, cnpj: p.cnpj, numero: p.numero, cfops: new Set<string>(), ncms: new Set<string>() }
    t.vlDoc += p.valorBruto
    t.desc += p.desconto
    t.frete += p.frete
    t.outras += p.outras
    for (const i of IMPOSTOS) t[i] += p[i]
    t.linhas++
    if (p.cfop) t.cfops.add(p.cfop)
    if (p.ncm) t.ncms.add(p.ncm)
    nos.set(k, t)
  }
  const temChave = pricetax.some((p) => p.chave.length >= 44)
  // Sem chave na planilha, cruza por CNPJ + número do documento.
  const chaveEfd = (d: Doc) => (temChave && d.chave.length >= 44 ? d.chave : `${d.partDoc}|${d.num.replace(/^0+/, "")}`)
  const efdPorChave = new Map<string, Doc>()
  for (const { doc } of efd.values()) efdPorChave.set(chaveEfd(doc), doc)

  const soEfd: Doc[] = []
  const diferencas: Record<string, string | number>[] = []
  let iguais = 0
  for (const [k, d] of efdPorChave) {
    const p = nos.get(k)
    if (!p) {
      soEfd.push(d)
      continue
    }
    const efdT: Totais = { vlDoc: d.vlDoc, desc: d.desc, frete: d.frete, outras: d.outras, icms: d.icms, ipi: d.ipi, pis: d.pis, cofins: d.cofins, st: d.st, difal: d.difal + d.fcp }
    const campos = (["vlDoc", ...IMPOSTOS] as (keyof Totais)[]).filter((c) => Math.abs(efdT[c] - p[c]) > 1)
    if (!campos.length) {
      iguais++
      continue
    }
    for (const c of campos)
      diferencas.push({
        doc: d.chave || `${d.serie}/${d.num}`, data: d.data, part: d.partNome || d.part, partDoc: fmtCnpj(d.partDoc), cfop: d.cfops.join(", "),
        reforma: d.cfops.some(ehReforma) ? "sim" : "não", campo: NOME_CAMPO[c], efd: r2(efdT[c]), pricetax: r2(p[c]), diferenca: r2(p[c] - efdT[c]),
        causa: causaProvavel(c, efdT, p),
      })
  }
  const soPricetax = [...nos.entries()].filter(([k]) => !efdPorChave.has(k))

  // Totais por fornecedor/cliente, NCM e CFOP (EFD × Pricetax)
  const porDim = (dim: "cnpj" | "cfop") => {
    const m = new Map<string, { chave: string; efd: number; pricetax: number }>()
    for (const { doc } of efd.values()) {
      const ks = dim === "cnpj" ? [doc.partDoc] : doc.cfops.length ? [doc.cfops[0]] : [""]
      for (const k of ks) {
        const x = m.get(k) ?? { chave: k, efd: 0, pricetax: 0 }
        x.efd += doc.vlDoc
        m.set(k, x)
      }
    }
    for (const p of pricetax) {
      const k = dim === "cnpj" ? p.cnpj : p.cfop
      const x = m.get(k) ?? { chave: k, efd: 0, pricetax: 0 }
      x.pricetax += p.valorBruto
      m.set(k, x)
    }
    return [...m.values()]
      .map((x) => ({ chave: dim === "cnpj" ? fmtCnpj(x.chave) : x.chave, reforma: dim === "cfop" ? (ehReforma(x.chave) ? "sim" : "não") : "", efd: r2(x.efd), pricetax: r2(x.pricetax), diferenca: r2(x.pricetax - x.efd) }))
      .filter((x) => Math.abs(x.diferenca) > 1)
      .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  }
  // NCM: itens do EFD (entradas do Fiscal, saídas do Contribuições) × linhas da planilha
  const validos = versoesValidas(l.arquivos)
  const ncmEfd = new Map<string, number>()
  for (const g of l.itens.filter((x) => validos.has(x.arquivo) && ((x.fonte === "fiscal" && x.oper === "0") || (x.fonte === "contribuicoes" && x.oper === "1")) && x.ncm))
    ncmEfd.set(g.ncm, (ncmEfd.get(g.ncm) ?? 0) + g.valor)
  const ncmPt = new Map<string, number>()
  for (const p of pricetax) if (p.ncm) ncmPt.set(p.ncm, (ncmPt.get(p.ncm) ?? 0) + p.valorBruto - p.ipi - p.st)
  const porNcm = [...new Set([...ncmEfd.keys(), ...ncmPt.keys()])]
    .map((n) => ({ chave: n, reforma: "", efd: r2(ncmEfd.get(n) ?? 0), pricetax: r2(ncmPt.get(n) ?? 0), diferenca: r2((ncmPt.get(n) ?? 0) - (ncmEfd.get(n) ?? 0)) }))
    .filter((x) => Math.abs(x.diferenca) > 1)
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))

  const colDim = (nome: string): Tabela["colunas"] => [
    { id: "chave", nome, tipo: "texto" }, { id: "reforma", nome: "Reforma", tipo: "texto" }, { id: "efd", nome: "EFD", tipo: "moeda" }, { id: "pricetax", nome: "Pricetax", tipo: "moeda" }, { id: "diferenca", nome: "Diferença (Pricetax − EFD)", tipo: "moeda" },
  ]
  const totalEfd = [...efd.values()].reduce((s, x) => s + x.doc.vlDoc, 0)
  const totalPt = pricetax.reduce((s, p) => s + p.valorBruto, 0)
  const duplicadosRemovidos = [...efd.values()].filter((x) => x.fontes.size > 1).length

  const achados: Achado[] = [
    {
      id: "4.1", etapa: "4", item: "4.1.1", titulo: "Documentos do EFD que não estão no relatório da Pricetax",
      criticidade: soEfd.length ? "alta" : "ok", valor: soEfd.reduce((s, d) => s + d.vlDoc, 0),
      resumo: soEfd.length
        ? `${soEfd.length} documento(s), ${moeda(soEfd.reduce((s, d) => s + d.vlDoc, 0))}, escriturados no EFD e ausentes da planilha.`
        : "Todos os documentos do EFD estão no relatório.",
      detalhe: soEfd.length
        ? {
            colunas: [{ id: "doc", nome: "Documento", tipo: "texto" }, { id: "data", nome: "Data", tipo: "texto" }, { id: "part", nome: "Fornecedor / cliente", tipo: "texto" }, { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" }, { id: "cfop", nome: "CFOP", tipo: "texto" }, { id: "reforma", nome: "Reforma", tipo: "texto" }, { id: "valor", nome: "Total do documento", tipo: "moeda" }],
            linhas: soEfd.map((d) => ({ doc: d.chave || `${d.serie}/${d.num}`, data: d.data, part: d.partNome || d.part, partDoc: fmtCnpj(d.partDoc), cfop: d.cfops.join(", "), reforma: d.cfops.some(ehReforma) ? "sim" : "não", valor: r2(d.vlDoc) })),
          }
        : undefined,
      comoResolver: "Incluir os documentos na planilha (eles estavam no EFD na consolidação). Se forem de outra competência ou estabelecimento, conferir o filtro usado na extração.",
    },
    {
      id: "4.2", etapa: "4", item: "4.1.1", titulo: "Linhas do relatório da Pricetax sem documento no EFD",
      criticidade: soPricetax.length ? "alta" : "ok", valor: soPricetax.reduce((s, [, p]) => s + p.vlDoc, 0),
      resumo: soPricetax.length ? `${soPricetax.length} documento(s) da planilha, ${moeda(soPricetax.reduce((s, [, p]) => s + p.vlDoc, 0))}, sem correspondente no EFD.` : "Toda a planilha tem correspondente no EFD.",
      detalhe: soPricetax.length
        ? {
            colunas: [{ id: "doc", nome: "Chave / documento", tipo: "texto" }, { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" }, { id: "cfop", nome: "CFOP", tipo: "texto" }, { id: "ncm", nome: "NCM", tipo: "texto" }, { id: "linhas", nome: "Linhas", tipo: "num" }, { id: "valor", nome: "Valor bruto", tipo: "moeda" }],
            linhas: soPricetax.map(([k, p]) => ({ doc: k.includes("|") ? `nº ${p.numero}` : k, partDoc: fmtCnpj(p.cnpj), cfop: [...p.cfops].join(", "), ncm: [...p.ncms].slice(0, 5).join(", "), linhas: p.linhas, valor: r2(p.vlDoc) })),
          }
        : undefined,
      comoResolver: "Conferir se o documento é de outra competência ou estabelecimento, se foi cancelado (fora do EFD) ou se houve erro de digitação da chave/número.",
    },
    {
      id: "4.3", etapa: "4", item: "4.1.1", titulo: "Documentos com valores diferentes",
      criticidade: diferencas.length ? "media" : "ok",
      resumo: diferencas.length
        ? `${new Set(diferencas.map((d) => d.doc)).size} documento(s) com diferença acima de R$ 1,00 em algum campo; ${iguais} conferem. A coluna "Causa provável" indica a regra que explica cada diferença.`
        : `${iguais} documento(s) conferem nos totais e nos impostos.`,
      detalhe: diferencas.length
        ? {
            colunas: [{ id: "doc", nome: "Documento", tipo: "texto" }, { id: "data", nome: "Data", tipo: "texto" }, { id: "part", nome: "Fornecedor / cliente", tipo: "texto" }, { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" }, { id: "cfop", nome: "CFOP", tipo: "texto" }, { id: "reforma", nome: "Reforma", tipo: "texto" }, { id: "campo", nome: "Campo", tipo: "texto" }, { id: "efd", nome: "EFD", tipo: "moeda" }, { id: "pricetax", nome: "Pricetax", tipo: "moeda" }, { id: "diferenca", nome: "Diferença", tipo: "moeda" }, { id: "causa", nome: "Causa provável e correção", tipo: "texto" }],
            linhas: diferencas,
          }
        : undefined,
      comoResolver: "Corrigir na planilha o campo indicado, seguindo a causa provável de cada linha.",
    },
    { id: "4.4", etapa: "4", item: "4.1.1", titulo: "Diferenças por fornecedor / cliente", criticidade: porDim("cnpj").length ? "media" : "ok", resumo: `${porDim("cnpj").length} fornecedor(es)/cliente(s) com total diferente.`, tabela: { colunas: colDim("Fornecedor / cliente"), linhas: porDim("cnpj") } },
    { id: "4.5", etapa: "4", item: "4.1.1", titulo: "Diferenças por CFOP", criticidade: porDim("cfop").length ? "media" : "ok", resumo: `${porDim("cfop").length} CFOP(s) com total diferente.`, tabela: { colunas: colDim("CFOP"), linhas: porDim("cfop") } },
    { id: "4.6", etapa: "4", item: "4.1.1", titulo: "Diferenças por NCM (valor dos itens)", criticidade: porNcm.length ? "media" : "ok", resumo: `${porNcm.length} NCM(s) com total diferente (itens do EFD × planilha, sem IPI e ST).`, tabela: { colunas: colDim("NCM"), linhas: porNcm } },
  ]
  return {
    achados,
    resumo: { documentosEfd: efd.size, duplicadosRemovidos, documentosPricetax: nos.size, conferem: iguais, totalEfd: r2(totalEfd), totalPricetax: r2(totalPt) },
  }
}

const NOME_CAMPO: Record<keyof Totais, string> = {
  vlDoc: "Valor total", desc: "Desconto", frete: "Frete", outras: "Outras despesas", icms: "ICMS", ipi: "IPI", pis: "PIS", cofins: "COFINS", st: "ICMS-ST", difal: "ICMS DIFAL",
}

/** A regra que mais provavelmente explica a diferença de um campo. */
function causaProvavel(campo: keyof Totais, efd: Totais, pt: Totais): string {
  const dif = pt[campo] - efd[campo]
  const perto = (v: number) => Math.abs(Math.abs(dif) - Math.abs(v)) <= 1
  if (campo === "vlDoc") {
    if (efd.ipi && perto(efd.ipi)) return `A planilha ${dif < 0 ? "não somou" : "somou a mais"} o IPI (${moeda(efd.ipi)}) no valor bruto: ajustar o valor bruto.`
    if (efd.st && perto(efd.st)) return `A planilha ${dif < 0 ? "não somou" : "somou a mais"} o ICMS-ST (${moeda(efd.st)}) no valor bruto.`
    if (efd.ipi + efd.st && perto(efd.ipi + efd.st)) return "A diferença é o IPI mais o ICMS-ST: o valor bruto da planilha está sem os tributos por fora."
    if (efd.frete && perto(efd.frete)) return `A diferença é o frete (${moeda(efd.frete)}): incluir o frete no valor bruto.`
    if (efd.desc && perto(efd.desc)) return `A diferença é o desconto (${moeda(efd.desc)}): o valor bruto deve ser líquido do desconto (ou o desconto deve estar na coluna própria).`
    if (efd.outras && perto(efd.outras)) return `A diferença são outras despesas (${moeda(efd.outras)}).`
    if (Math.abs(pt.vlDoc) > 0 && Math.abs(pt.vlDoc - 2 * efd.vlDoc) <= 1) return "O valor está em dobro: provável linha duplicada na planilha."
    return dif < 0 ? "Faltam itens do documento na planilha: conferir se todos os itens (C170) entraram." : "Há valor a mais na planilha: conferir itens repetidos ou de outro documento."
  }
  if (Math.abs(pt[campo]) < 0.01) return `O ${NOME_CAMPO[campo]} do documento (${moeda(efd[campo])}) não foi informado na planilha.`
  if (Math.abs(efd[campo]) < 0.01) return `A planilha tem ${NOME_CAMPO[campo]} que o EFD não escritura: conferir se o tributo é destacado na nota ou se veio de outro campo.`
  if (Math.abs(pt[campo] - 2 * efd[campo]) <= 1) return "O imposto está em dobro: provável linha duplicada."
  return "Valor diferente do escriturado: conferir a alíquota e a base usadas na planilha."
}
