// Tipos e rótulos da visão de classificação (CST e cClassTrib), compartilhados entre o
// servidor e o navegador. A tabela oficial fica só no servidor (lib/cclasstrib.json).

export type Situacao = "conforme" | "divergente" | "sem_nota" | "sem_calculo"

export const SITUACOES: Record<Situacao, string> = {
  conforme: "Conforme",
  divergente: "Divergente",
  sem_nota: "Sem cClassTrib na nota",
  sem_calculo: "Sem classificação calculada",
}

export type Codigo = { codigo: string | null; nome: string | null }

/** Tipos de erro do Auditor IVA. A ordem é a de exibição. */
export type TipoErro =
  | "beneficio_indevido"
  | "beneficio_nao_aplicado"
  | "redutor"
  | "classificacao"
  | "calculo"
  | "base"
  | "aliquota"

export type InfoTipo = {
  nome: string
  curto: string
  descricao: string
  /** "sim": medido; "inferido": deduzido do código da nota; "sem_dados": a API não traz o que a nota destacou. */
  deteccao: "sim" | "inferido" | "sem_dados"
  responsavel: string
  falta?: string
}

export const TIPOS_ERRO: Record<TipoErro, InfoTipo> = {
  beneficio_indevido: {
    nome: "Benefício aplicado indevidamente",
    curto: "Benefício indevido",
    descricao: "A nota usa isenção, alíquota zero, imunidade, não incidência ou redução de 100%, e a operação é tributada pelo cálculo.",
    deteccao: "inferido",
    responsavel: "Fiscal interno / Cadastro de produto",
  },
  beneficio_nao_aplicado: {
    nome: "Benefício não aplicado (oportunidade)",
    curto: "Benefício não aplicado",
    descricao: "A nota tributa, e pelo cálculo a operação tem isenção, alíquota zero ou redução de 100%.",
    deteccao: "inferido",
    responsavel: "Fiscal interno / Cadastro de produto",
  },
  redutor: {
    nome: "Redutor não aplicado ou com % errado",
    curto: "Redutor",
    descricao: "A nota e o cálculo diferem só no percentual de redução da alíquota (ex.: 0% na nota, 60% no cálculo).",
    deteccao: "inferido",
    responsavel: "Cadastro de produto / ERP",
  },
  classificacao: {
    nome: "Classificação errada (cClassTrib/CST)",
    curto: "Classificação",
    descricao: "O código da nota é outro, mas a carga é a mesma, ou um dos códigos tem regra própria (monofásica, diferimento, suspensão) e não entra no valor em R$.",
    deteccao: "sim",
    responsavel: "Cadastro de produto / ERP",
  },
  calculo: {
    nome: "Cálculo do IVA errado",
    curto: "Cálculo",
    descricao: "IBS/CBS destacado diferente de base × alíquota.",
    deteccao: "sem_dados",
    responsavel: "ERP",
    falta: "IBS e CBS destacados no item da nota (vIBS, vCBS).",
  },
  base: {
    nome: "Base de IBS/CBS composta errada",
    curto: "Base",
    descricao: "Inclusão ou exclusão indevida de IPI, frete, desconto ou ICMS na base.",
    deteccao: "sem_dados",
    responsavel: "ERP",
    falta: "Base de cálculo de IBS/CBS do item da nota (vBC).",
  },
  aliquota: {
    nome: "Alíquota errada",
    curto: "Alíquota",
    descricao: "Alíquota fora da do ano ou do ente (UF, município, União).",
    deteccao: "sem_dados",
    responsavel: "ERP",
    falta: "Alíquotas do item da nota (pIBSUF, pIBSMun, pCBS) e o redutor destacado (pRedAliq).",
  },
}

export const ORDEM_TIPOS = Object.keys(TIPOS_ERRO) as TipoErro[]

/**
 * CFOPs de operações que normalmente não são vendas ou compras onerosas (remessas, bonificação,
 * amostra, demonstração, conserto, consignação, industrialização, vasilhame, transferência, outras).
 * Uma divergência nelas pode ser falso positivo: o cálculo pode ter tratado como onerosa.
 */
const NAO_ONEROSOS = /^[1-7](15[0-9]|40[89]|55[2-7]|90[0-9]|91[0-9]|92[0-9]|949)$/
export const cfopNaoOneroso = (cfop: string | null | undefined) => !!cfop && NAO_ONEROSOS.test(cfop)

/** Valores estimados de IBS + CBS de um conjunto de itens divergentes. */
export type Estimativa = {
  /** Tributo pela classificação calculada (a correta). */
  correto: number
  /** Tributo que a classificação da nota geraria. */
  pelaNota: number
  /** Efeito para a empresa: negativo é perda potencial, positivo é ganho potencial. */
  impacto: number
}

export type ParDivergente = {
  sentido: "entrada" | "saida"
  tipo: TipoErro
  /** CFOPs em que o par aparece (até 8). */
  cfops: string[]
  nota: Codigo
  calculado: Codigo
  itens: number
  valor: number
  /** null quando um dos códigos tem regra própria (alíquota fixa, diferimento…) e não é estimado. */
  estimativa: Estimativa | null
}

export type ResumoClassificacao = {
  itens: number
  valor: number
  porSituacao: Record<Situacao, { itens: number; valor: number }>
  perda: number
  ganho: number
  /** Itens divergentes que ficaram fora da estimativa em R$. */
  naoEstimado: { itens: number; valor: number }
  /** Perda, ganho e volume por tipo de erro. */
  porTipo: Record<TipoErro, PorTipo>
}

export type PorTipo = { itens: number; valor: number; perda: number; ganho: number; pares: number }

export type CelulaCst = { nota: string | null; calculado: string | null; itens: number; valor: number }

export type ItemCritico = {
  /** Perda e ganho por tipo de erro, para filtrar sem perder a soma do item. */
  porTipo: Partial<Record<TipoErro, PorTipo>>
  cfops: string[]
  sentido: "entrada" | "saida"
  descricao: string | null
  pares: string[]
  itens: number
  valor: number
  perda: number
  ganho: number
}

export type FornecedorCritico = {
  /** Perda e ganho por tipo de erro, para filtrar sem perder a soma do item. */
  porTipo: Partial<Record<TipoErro, PorTipo>>
  cfops: string[]
  cnpj: string | null
  razaoSocial: string | null
  pares: string[]
  itens: number
  valor: number
  perda: number
  ganho: number
}

export type AnaliseClassificacao = {
  ano: number
  resumo: ResumoClassificacao
  cst: CelulaCst[]
  nomesCst: Record<string, string>
  pares: ParDivergente[]
  itens: ItemCritico[]
  fornecedores: FornecedorCritico[] | null
  /** A API devolveu mais grupos que o painel leu: os rankings cobrem só os maiores. */
  parcial: boolean
  tabela: { fonte: string; obtidoEm: string }
}

export type PontoProjecao = {
  ano: number
  perda: number
  ganho: number
  /** Multiplicador para 12 meses (12 ÷ meses analisados), ou null se o cálculo não informa o período. */
  fatorAnual: number | null
}

/** Uma nota (documento) de uma divergência, para a gaveta de detalhe. */
export type NotaDivergente = {
  chave: string | null
  numero: string | null
  data: string | null
  cfops: string[]
  parceiro: string | null
  sentido: "entrada" | "saida"
  tipo: TipoErro
  itens: { descricao: string | null; ncm: string | null; valor: number }[]
  nota: LadoClass
  correto: LadoClass
  /** Base de IBS/CBS do cálculo (valor sem IVA). A da nota a API não traz. */
  base: number
  valor: number
  aliqIbs: number | null
  aliqCbs: number | null
  ibs: { nota: number | null; correto: number }
  cbs: { nota: number | null; correto: number }
  impacto: number | null
  possivelFalsoPositivo: boolean
  fundamento: { url: string; rotulo: string } | null
}

export type LadoClass = {
  codigo: string | null
  cst: string | null
  nome: string | null
  reducaoIbs: number | null
  reducaoCbs: number | null
  /** O CST exige tributo? false: isenção, imunidade, não incidência, alíquota zero. */
  tributa: boolean | null
}

export type DetalheNotas = { notas: NotaDivergente[]; total: number; parcial: boolean }
