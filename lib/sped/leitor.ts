import type { Ajuste, Apuracao, ArquivoLido, Doc, F100, GrupoItem, Leitura } from "./tipos"

/*
 * Leitor de EFD ICMS/IPI (Fiscal) e EFD Contribuições, linha a linha. Os campos seguem os Guias
 * Práticos (numeração a partir de 1 depois do REG). O tipo do arquivo sai do 0000: no Fiscal as
 * datas estão nos campos 3 e 4; no Contribuições, nos campos 5 e 6.
 *
 * Os itens (C170, A170, C175) não ficam um a um: são somados por fornecedor/cliente, CFOP, NCM,
 * item e tributação, o que cabe na memória mesmo com arquivos grandes e atende todas as análises.
 */

const UF_IBGE: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE",
  "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
}

/** "1234,56" → 1234.56 (SPED usa vírgula decimal, sem separador de milhar). */
export const num = (v: string | undefined) => {
  if (!v) return 0
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
const ehData = (v: string | undefined) => !!v && /^\d{8}$/.test(v)
/** ddmmaaaa → aaaa-mm-dd */
export const data = (v: string | undefined) => (ehData(v) ? `${v!.slice(4, 8)}-${v!.slice(2, 4)}-${v!.slice(0, 2)}` : "")

export function novaLeitura(): Leitura {
  return { arquivos: [], docs: [], itens: [], ajustes: [], apuracoes: [], f100: [], porCfop: [] }
}

type Participante = { doc: string; nome: string; uf: string }
type Produto = { ncm: string; descricao: string }

export class LeitorEfd {
  readonly arq: ArquivoLido
  private participantes = new Map<string, Participante>()
  private produtos = new Map<string, Produto>()
  private estab = ""
  private doc: Doc | null = null
  private ufApuracao = ""
  private grupos: Map<string, GrupoItem>
  private cfops: Map<string, Leitura["porCfop"][number]>

  constructor(
    private leitura: Leitura,
    indice: number,
    nome: string,
    tamanho: number,
    grupos: Map<string, GrupoItem>,
    cfops: Map<string, Leitura["porCfop"][number]>,
  ) {
    this.grupos = grupos
    this.cfops = cfops
    this.arq = {
      indice, nome, tamanho, tipo: "desconhecido", versao: "", finalidade: "?", dtIni: "", dtFin: "", periodo: "", cnpj: "", empresa: "",
      uf: "", ie: "", indAtiv: "", perfil: "", suframa: "", incidencia: "", regimeCumulativo: "", estabelecimentos: [], escrituracaoC: {},
      registros: {}, linhas: 0, erros: [],
    }
  }

  linha(texto: string) {
    if (!texto || texto.charCodeAt(0) !== 124 /* | */) return
    const c = texto.split("|").slice(1, -1)
    const reg = c[0]
    if (!reg) return
    this.arq.linhas++
    this.arq.registros[reg] = (this.arq.registros[reg] ?? 0) + 1
    try {
      this.registro(reg, c)
    } catch (e) {
      if (this.arq.erros.length < 20) this.arq.erros.push(`Linha ${this.arq.linhas} (${reg}): ${(e as Error).message}`)
    }
  }

  /** Fecha o arquivo: grava o último documento. */
  fim(): ArquivoLido {
    this.fecharDoc()
    this.leitura.arquivos.push(this.arq)
    return this.arq
  }

  private get fonte(): "fiscal" | "contribuicoes" {
    return this.arq.tipo === "contribuicoes" ? "contribuicoes" : "fiscal"
  }

  private registro(reg: string, c: string[]) {
    const a = this.arq
    switch (reg) {
      case "0000":
        if (ehData(c[3]) && ehData(c[4])) {
          a.tipo = "fiscal"
          a.versao = c[1]
          a.finalidade = c[2] === "0" ? "original" : c[2] === "1" ? "retificadora" : "?"
          a.dtIni = data(c[3])
          a.dtFin = data(c[4])
          a.empresa = c[5]
          a.cnpj = c[6] || c[7]
          a.uf = c[8]
          a.ie = c[9]
          a.suframa = c[12] ?? ""
          a.perfil = c[13] ?? ""
          a.indAtiv = c[14] ?? ""
        } else if (ehData(c[5]) && ehData(c[6])) {
          a.tipo = "contribuicoes"
          a.versao = c[1]
          a.finalidade = c[2] === "0" ? "original" : c[2] === "1" ? "retificadora" : "?"
          a.dtIni = data(c[5])
          a.dtFin = data(c[6])
          a.empresa = c[7]
          a.cnpj = c[8]
          a.uf = c[9]
          a.suframa = c[11] ?? ""
          a.indAtiv = c[13] ?? ""
        }
        a.periodo = a.dtIni.slice(0, 7)
        this.estab = a.cnpj
        return
      case "0110":
        a.incidencia = c[1]
        a.regimeCumulativo = c[4] ?? ""
        return
      case "0140":
        a.estabelecimentos.push({ cnpj: c[3], nome: c[2], uf: c[4], ie: c[5] ?? "" })
        return
      case "0150":
        this.participantes.set(c[1], { doc: c[4] || c[5] || "", nome: c[2], uf: UF_IBGE[(c[7] ?? "").slice(0, 2)] ?? (c[3] && c[3] !== "1058" ? "EX" : "") })
        return
      case "0200":
        this.produtos.set(c[1], { ncm: c[7] ?? "", descricao: c[2] ?? "" })
        return
      case "C010":
      case "A010":
      case "D010":
      case "F010":
        this.fecharDoc()
        this.estab = c[1]
        if (reg === "C010") a.escrituracaoC[c[1]] = c[2] ?? ""
        return
      case "C100":
        this.fecharDoc()
        this.abrirC100(c)
        return
      case "C101":
        if (this.doc) {
          this.doc.fcp += num(c[1])
          this.doc.difal += num(c[2])
        }
        return
      case "C170":
        this.c170(c)
        return
      case "C175":
        this.c175(c)
        return
      case "C190":
        this.c190(c)
        return
      case "C197":
        this.ajuste(reg, "ICMS", "ajuste do documento", c[1], c[2], num(c[6]) || num(c[7]), this.doc ? rotuloDoc(this.doc) : undefined)
        return
      case "A100":
        this.fecharDoc()
        this.abrirA100(c)
        return
      case "A170":
        this.a170(c)
        return
      case "E110":
        this.apuracao("ICMS", {
          debitos: num(c[1]), ajustesDebito: num(c[2]) + num(c[3]), estornosCredito: num(c[4]), creditos: num(c[5]),
          ajustesCredito: num(c[6]) + num(c[7]), estornosDebito: num(c[8]), saldoCredorAnterior: num(c[9]), deducoes: num(c[11]),
          aRecolher: num(c[12]), saldoCredorTransportar: num(c[13]),
        })
        return
      case "E111":
        this.ajuste(reg, "ICMS", NATUREZA_E111[(c[1] ?? "")[3]] ?? "ajuste", c[1], c[2], num(c[3]))
        return
      case "E200":
      case "E300":
        this.ufApuracao = c[1]
        return
      case "E210":
        this.apuracao("ICMS-ST", {
          saldoCredorAnterior: num(c[2]), creditos: num(c[3]) + num(c[4]) + num(c[5]), ajustesCredito: num(c[6]), debitos: num(c[7]),
          ajustesDebito: num(c[8]) + num(c[9]), deducoes: num(c[11]), aRecolher: num(c[12]), saldoCredorTransportar: num(c[13]),
        }, this.ufApuracao)
        return
      case "E220":
        this.ajuste(reg, "ICMS-ST", NATUREZA_E111[(c[1] ?? "")[3]] ?? "ajuste", c[1], c[2], num(c[3]))
        return
      case "E310":
        this.apuracao("DIFAL", {
          saldoCredorAnterior: num(c[2]), debitos: num(c[3]), ajustesDebito: num(c[4]), creditos: num(c[5]), ajustesCredito: num(c[6]),
          deducoes: num(c[8]), aRecolher: num(c[9]), saldoCredorTransportar: num(c[10]),
        }, this.ufApuracao)
        return
      case "E311":
        this.ajuste(reg, "DIFAL", NATUREZA_E111[(c[1] ?? "")[3]] ?? "ajuste", c[1], c[2], num(c[3]))
        return
      case "E520":
        this.apuracao("IPI", {
          saldoCredorAnterior: num(c[1]), debitos: num(c[2]), creditos: num(c[3]), ajustesDebito: num(c[4]), ajustesCredito: num(c[5]),
          saldoCredorTransportar: num(c[6]), aRecolher: num(c[7]),
        })
        return
      case "E530":
        this.ajuste(reg, "IPI", c[1] === "0" ? "ajuste a débito" : "ajuste a crédito", c[3], c[6] ?? "", num(c[2]))
        return
      case "M100":
      case "M500": {
        const imposto = reg === "M100" ? "PIS" : "COFINS"
        this.apuracao(imposto, { creditos: num(c[7]), ajustesCredito: num(c[8]), estornosCredito: num(c[9]) }, undefined, c[1])
        return
      }
      case "M110":
      case "M510":
        this.ajuste(reg, reg === "M110" ? "PIS" : "COFINS", c[1] === "1" ? "acréscimo de crédito" : "redução de crédito", c[3], c[5] ?? "", num(c[2]))
        return
      case "M200":
      case "M600": {
        const imposto = reg === "M200" ? "PIS" : "COFINS"
        this.apuracao(imposto, {
          debitos: num(c[1]) + num(c[8]), deducoes: num(c[5]) + num(c[6]) + num(c[9]) + num(c[10]), aRecolher: num(c[12]),
          creditos: 0,
        }, undefined, "apuracao")
        return
      }
      case "M210":
      case "M610": {
        const n = c.length - 1
        const imposto = reg === "M210" ? "PIS" : "COFINS"
        this.apuracao(imposto, { ajustesDebito: num(c[n - 4]), estornosDebito: num(c[n - 3]) }, undefined, `contribuicao ${c[1]}`)
        return
      }
      case "M220":
      case "M620":
        this.ajuste(reg, reg === "M220" ? "PIS" : "COFINS", c[1] === "1" ? "acréscimo de débito" : "redução de débito", c[3], c[5] ?? "", num(c[2]))
        return
      case "M400":
      case "M800":
        this.f100Linha({ reg, indOper: "1", natBcCred: "", cstPis: reg === "M400" ? c[1] : "", cstCofins: reg === "M800" ? c[1] : "", valor: num(c[2]), descricao: c[4] ?? "" })
        return
      case "M410":
      case "M810":
        this.f100Linha({ reg, indOper: "1", natBcCred: c[1], valor: num(c[2]), descricao: c[4] ?? "" })
        return
      case "1100":
      case "1500":
        this.apuracao(reg === "1100" ? "PIS" : "COFINS", { saldoCredorTransportar: num(c[17]) }, undefined, `credito ${c[1]}`)
        return
      case "F100": {
        const p = this.participantes.get(c[2])
        this.f100Linha({
          reg, indOper: c[1], natBcCred: c[14] ?? "", cstPis: c[6], aliqPis: num(c[8]), cstCofins: c[10], aliqCofins: num(c[12]),
          valor: num(c[5]), pis: num(c[9]), cofins: num(c[13]), descricao: c[18] ?? "", partDoc: p?.doc ?? "",
        })
        return
      }
      case "F120":
        this.f100Linha({
          reg, indOper: "0", natBcCred: c[1], cstPis: c[7], aliqPis: num(c[9]), cstCofins: c[11], aliqCofins: num(c[13]),
          valor: num(c[5]), pis: num(c[10]), cofins: num(c[14]), descricao: c[17] ?? "depreciação",
        })
        return
      case "F130":
        this.f100Linha({
          reg, indOper: "0", natBcCred: c[1], cstPis: c[10], aliqPis: num(c[12]), cstCofins: c[14], aliqCofins: num(c[16]),
          valor: num(c[6]), pis: num(c[13]), cofins: num(c[17]), descricao: c[20] ?? "aquisição de ativo",
        })
        return
    }
  }

  private abrirC100(c: string[]) {
    const p = this.participantes.get(c[3])
    this.doc = {
      arquivo: this.arq.indice, fonte: this.fonte, estab: this.estab, reg: "C100", mod: c[4], oper: c[1] === "1" ? "1" : "0",
      emit: c[2] === "0" ? "0" : "1", sit: c[5], serie: c[6], num: c[7], chave: c[8] ?? "", data: data(c[9]), periodo: this.arq.periodo,
      part: c[3], partDoc: p?.doc ?? "", partNome: p?.nome ?? "", partUf: p?.uf ?? "",
      vlDoc: num(c[11]), desc: num(c[13]), vlMerc: num(c[15]), frete: num(c[17]), seguro: num(c[18]), outras: num(c[19]),
      bcIcms: num(c[20]), icms: num(c[21]), st: num(c[23]), ipi: num(c[24]), pis: num(c[25]), cofins: num(c[26]),
      difal: 0, fcp: 0, cfops: [], itens: 0, somaItens: 0, c190: [],
    }
  }

  private abrirA100(c: string[]) {
    const p = this.participantes.get(c[3])
    this.doc = {
      arquivo: this.arq.indice, fonte: this.fonte, estab: this.estab, reg: "A100", mod: "NFS-e", oper: c[1] === "1" ? "1" : "0",
      emit: c[2] === "0" ? "0" : "1", sit: c[4], serie: c[5], num: c[7], chave: c[8] ?? "", data: data(c[9]), periodo: this.arq.periodo,
      part: c[3], partDoc: p?.doc ?? "", partNome: p?.nome ?? "", partUf: p?.uf ?? "",
      vlDoc: num(c[11]), desc: num(c[13]), vlMerc: num(c[11]), frete: 0, seguro: 0, outras: 0, bcIcms: 0, icms: 0, st: 0, ipi: 0,
      pis: num(c[15]), cofins: num(c[17]), difal: 0, fcp: 0, cfops: [], itens: 0, somaItens: 0, c190: [],
    }
  }

  private fecharDoc() {
    if (this.doc) this.leitura.docs.push(this.doc)
    this.doc = null
  }

  private c170(c: string[]) {
    const d = this.doc
    const prod = this.produtos.get(c[2])
    if (d) {
      d.itens++
      d.somaItens += num(c[6])
      if (c[10] && !d.cfops.includes(c[10])) d.cfops.push(c[10])
    }
    this.somarItem({
      reg: "C170", cfop: c[10], ncm: prod?.ncm ?? "", codItem: c[2], descricao: prod?.descricao || c[3] || "",
      cstIcms: c[9], aliqIcms: num(c[13]), cstIpi: c[19], aliqIpi: num(c[22]), cstPis: c[24], aliqPis: num(c[26]), cstCofins: c[30],
      aliqCofins: num(c[32]), qtd: num(c[4]), valor: num(c[6]), desc: num(c[7]), bcIcms: num(c[12]), icms: num(c[14]), st: num(c[17]),
      ipi: num(c[23]), pis: num(c[29]), cofins: num(c[35]),
    })
  }

  private c175(c: string[]) {
    const d = this.doc
    if (d && c[1] && !d.cfops.includes(c[1])) d.cfops.push(c[1])
    this.somarItem({
      reg: "C175", cfop: c[1], ncm: "", codItem: "", descricao: "NFC-e (analítico C175)", cstIcms: "", aliqIcms: 0, cstIpi: "", aliqIpi: 0,
      cstPis: c[4], aliqPis: num(c[6]), cstCofins: c[10], aliqCofins: num(c[12]), qtd: 0, valor: num(c[2]), desc: num(c[3]), bcIcms: 0,
      icms: 0, st: 0, ipi: 0, pis: num(c[9]), cofins: num(c[15]),
    })
  }

  private a170(c: string[]) {
    const d = this.doc
    const prod = this.produtos.get(c[2])
    if (d) {
      d.itens++
      d.somaItens += num(c[4])
    }
    this.somarItem({
      reg: "A170", cfop: "", ncm: prod?.ncm ?? "", codItem: c[2], descricao: prod?.descricao || c[3] || "serviço", cstIcms: "", aliqIcms: 0,
      cstIpi: "", aliqIpi: 0, cstPis: c[8], aliqPis: num(c[10]), cstCofins: c[12], aliqCofins: num(c[14]), qtd: 0, valor: num(c[4]),
      desc: num(c[5]), bcIcms: 0, icms: 0, st: 0, ipi: 0, pis: num(c[11]), cofins: num(c[15]),
    })
  }

  private c190(c: string[]) {
    const d = this.doc
    if (d && c[2] && !d.cfops.includes(c[2])) d.cfops.push(c[2])
    d?.c190.push({ cst: c[1], cfop: c[2], aliq: num(c[3]), valor: num(c[4]), icms: num(c[6]), st: num(c[8]), ipi: num(c[10]) })
    const oper = d?.oper ?? (c[2]?.[0] && "567".includes(c[2][0]) ? "1" : "0")
    const k = [this.fonte, this.estab, this.arq.periodo, oper, c[2], c[1], c[3]].join("|")
    let g = this.cfops.get(k)
    if (!g) {
      g = { fonte: this.fonte, estab: this.estab, periodo: this.arq.periodo, oper, cfop: c[2], cst: c[1], aliq: num(c[3]), valor: 0, bc: 0, icms: 0, st: 0, ipi: 0 }
      this.cfops.set(k, g)
    }
    g.valor += num(c[4])
    g.bc += num(c[5])
    g.icms += num(c[6])
    g.st += num(c[8])
    g.ipi += num(c[10])
  }

  private somarItem(i: Omit<GrupoItem, "arquivo" | "periodo" | "fonte" | "oper" | "emit" | "estab" | "partDoc" | "partNome" | "partUf" | "mod" | "linhas" | "docs">) {
    const d = this.doc
    const base = {
      arquivo: this.arq.indice, periodo: this.arq.periodo, fonte: this.fonte, oper: d?.oper ?? "", emit: d?.emit ?? "", estab: this.estab, partDoc: d?.partDoc ?? "", partNome: d?.partNome ?? "",
      partUf: d?.partUf ?? "", mod: d?.mod ?? "",
    }
    const k = [
      base.arquivo, base.fonte, i.reg, base.oper, base.emit, base.estab, base.partDoc, i.cfop, i.ncm, i.codItem, i.cstIcms, i.aliqIcms, i.cstIpi, i.aliqIpi,
      i.cstPis, i.aliqPis, i.cstCofins, i.aliqCofins, base.mod,
    ].join("|")
    let g = this.grupos.get(k)
    if (!g) {
      g = { ...base, ...i, linhas: 0, qtd: 0, valor: 0, desc: 0, bcIcms: 0, icms: 0, st: 0, ipi: 0, pis: 0, cofins: 0, docs: [] }
      this.grupos.set(k, g)
    }
    g.linhas++
    g.qtd += i.qtd
    g.valor += i.valor
    g.desc += i.desc
    g.bcIcms += i.bcIcms
    g.icms += i.icms
    g.st += i.st
    g.ipi += i.ipi
    g.pis += i.pis
    g.cofins += i.cofins
    if (d && g.docs.length < 30) {
      const r = rotuloDoc(d)
      if (!g.docs.includes(r)) g.docs.push(r)
    }
  }

  private ajuste(reg: string, imposto: Ajuste["imposto"], tipo: string, codigo: string | undefined, descricao: string | undefined, valor: number, doc?: string) {
    this.leitura.ajustes.push({
      arquivo: this.arq.indice, periodo: this.arq.periodo, estab: this.estab, reg, imposto, tipo, codigo: codigo ?? "", descricao: descricao ?? "",
      valor, doc,
    })
  }

  /** Soma na apuração do mês (uma por arquivo, imposto e UF), criando quando ainda não existe. */
  private apuracao(imposto: Apuracao["imposto"], v: Partial<Apuracao>, uf?: string, _origem?: string) {
    const lista = this.leitura.apuracoes
    let ap = lista.find((x) => x.arquivo === this.arq.indice && x.imposto === imposto && (x.uf ?? "") === (uf ?? "") && x.estab === this.arq.cnpj)
    if (!ap) {
      ap = {
        arquivo: this.arq.indice, periodo: this.arq.periodo, estab: this.arq.cnpj, imposto, uf, debitos: 0, creditos: 0, ajustesDebito: 0,
        ajustesCredito: 0, estornosDebito: 0, estornosCredito: 0, deducoes: 0, saldoCredorAnterior: 0, aRecolher: 0, saldoCredorTransportar: 0,
      }
      lista.push(ap)
    }
    const alvo = ap as unknown as Record<string, number>
    for (const [k, x] of Object.entries(v)) if (typeof x === "number") alvo[k] = (alvo[k] ?? 0) + x
  }

  private f100Linha(v: Partial<F100> & { reg: string; valor: number }) {
    this.leitura.f100.push({
      arquivo: this.arq.indice, periodo: this.arq.periodo, estab: this.estab, indOper: "", natBcCred: "", cstPis: "", aliqPis: 0, cstCofins: "",
      aliqCofins: 0, pis: 0, cofins: 0, descricao: "", partDoc: "", ...v,
    })
  }
}

/** E111/E220/E311: o 4º caractere do código é a natureza do ajuste (Tabela 5.1.1). */
export const NATUREZA_E111: Record<string, string> = {
  "0": "outros débitos",
  "1": "estorno de créditos",
  "2": "outros créditos",
  "3": "estorno de débitos",
  "4": "deduções do imposto apurado",
  "5": "débitos especiais",
}

export const rotuloDoc = (d: Pick<Doc, "chave" | "mod" | "serie" | "num" | "data">) =>
  d.chave && d.chave.length >= 44 ? d.chave : `mod ${d.mod} · série ${d.serie || "-"} · nº ${d.num} · ${d.data}`

/** Lê um conjunto de arquivos já em texto (testes e leitura em memória). */
export function lerTextos(arquivos: { nome: string; texto: string }[]): Leitura {
  const leitura = novaLeitura()
  const grupos = new Map<string, GrupoItem>()
  const cfops = new Map<string, Leitura["porCfop"][number]>()
  arquivos.forEach((a, i) => {
    const l = new LeitorEfd(leitura, i, a.nome, a.texto.length, grupos, cfops)
    for (const linha of a.texto.split(/\r?\n/)) l.linha(linha)
    l.fim()
  })
  leitura.itens = [...grupos.values()]
  leitura.porCfop = [...cfops.values()]
  return leitura
}
