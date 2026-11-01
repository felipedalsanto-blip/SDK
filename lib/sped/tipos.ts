/*
 * Tipos da auditoria de EFD (ICMS/IPI e Contribuições). Tudo roda no navegador: os arquivos do
 * cliente não saem do computador de quem usa o painel.
 */

export type TipoEfd = "fiscal" | "contribuicoes" | "desconhecido"

/** Um documento (C100 ou A100) com os totais do cabeçalho e o que veio dos itens e do analítico. */
export type Doc = {
  arquivo: number
  fonte: "fiscal" | "contribuicoes"
  estab: string // CNPJ do estabelecimento que escriturou
  reg: "C100" | "A100"
  mod: string
  oper: "0" | "1" // 0 entrada, 1 saída
  emit: "0" | "1" // 0 emissão própria, 1 terceiros
  sit: string
  serie: string
  num: string
  chave: string
  data: string // AAAA-MM-DD
  periodo: string // AAAA-MM do arquivo
  part: string // código do participante
  partDoc: string // CNPJ ou CPF
  partNome: string
  partUf: string
  vlDoc: number
  vlMerc: number
  desc: number
  frete: number
  seguro: number
  outras: number
  bcIcms: number
  icms: number
  st: number
  ipi: number
  pis: number
  cofins: number
  difal: number // C101: ICMS da UF de destino (EC 87)
  fcp: number
  cfops: string[]
  itens: number
  /** Soma dos itens (C170/A170): comparada ao VL_MERC do cabeçalho. */
  somaItens: number
  /** Analítico do documento (C190): CST, CFOP e alíquota de ICMS. */
  c190: { cst: string; cfop: string; aliq: number; valor: number; icms: number; st: number; ipi: number }[]
}

/** Itens (C170, A170, C175, C190) somados por uma chave com todas as dimensões das análises. */
export type GrupoItem = {
  arquivo: number
  periodo: string
  fonte: "fiscal" | "contribuicoes"
  reg: string
  oper: string
  emit: string
  estab: string
  partDoc: string
  partNome: string
  partUf: string
  cfop: string
  ncm: string
  codItem: string
  descricao: string
  cstIcms: string
  aliqIcms: number
  cstIpi: string
  aliqIpi: number
  cstPis: string
  aliqPis: number
  cstCofins: string
  aliqCofins: number
  mod: string
  linhas: number
  qtd: number
  valor: number
  desc: number
  bcIcms: number
  icms: number
  st: number
  ipi: number
  pis: number
  cofins: number
  /** Até 30 documentos de exemplo (chave ou série/número), para navegar até o caso. */
  docs: string[]
}

export type Ajuste = {
  arquivo: number
  periodo: string
  estab: string
  reg: string // E111, E220, E311, E530, C197, M110, M220, M510, M620…
  imposto: "ICMS" | "ICMS-ST" | "DIFAL" | "IPI" | "PIS" | "COFINS"
  tipo: string // natureza do ajuste
  codigo: string
  descricao: string
  valor: number
  doc?: string
}

/** Apuração do mês de cada imposto (E110, E210, E310, E520, M200/M210, M600/M610, 1100/1500). */
export type Apuracao = {
  arquivo: number
  periodo: string
  estab: string
  imposto: "ICMS" | "ICMS-ST" | "DIFAL" | "IPI" | "PIS" | "COFINS"
  uf?: string
  debitos: number
  creditos: number
  ajustesDebito: number
  ajustesCredito: number
  estornosDebito: number
  estornosCredito: number
  deducoes: number
  saldoCredorAnterior: number
  aRecolher: number
  saldoCredorTransportar: number
}

export type F100 = {
  arquivo: number
  periodo: string
  estab: string
  reg: string // F100, F120, F130, F150
  indOper: string
  natBcCred: string
  cstPis: string
  aliqPis: number
  cstCofins: string
  aliqCofins: number
  valor: number
  pis: number
  cofins: number
  descricao: string
  partDoc: string
}

export type ArquivoLido = {
  indice: number
  nome: string
  tamanho: number
  tipo: TipoEfd
  versao: string
  finalidade: "original" | "retificadora" | "?"
  dtIni: string
  dtFin: string
  periodo: string
  cnpj: string
  empresa: string
  uf: string
  ie: string
  indAtiv: string // fiscal: 0 industrial, 1 outros
  perfil: string
  suframa: string
  /** Contribuições: 0110 */
  incidencia: string // 1 não cumulativo, 2 cumulativo, 3 ambos
  regimeCumulativo: string // 1 caixa (F500), 2 competência consolidada (F550), 9 competência detalhada
  /** Contribuições: estabelecimentos do 0140 (matriz e filiais). */
  estabelecimentos: { cnpj: string; nome: string; uf: string; ie: string }[]
  /** Contribuições: C010 IND_ESCRI por CNPJ (1 consolidado, 2 individualizado). */
  escrituracaoC: Record<string, string>
  registros: Record<string, number>
  linhas: number
  erros: string[]
}

export type Leitura = {
  arquivos: ArquivoLido[]
  docs: Doc[]
  itens: GrupoItem[]
  ajustes: Ajuste[]
  apuracoes: Apuracao[]
  f100: F100[]
  /** Totais por (fonte, oper, cfop) a partir do analítico C190 (EFD Fiscal) e C175/C170. */
  porCfop: { fonte: string; estab: string; periodo: string; oper: string; cfop: string; cst: string; aliq: number; valor: number; bc: number; icms: number; st: number; ipi: number }[]
}
