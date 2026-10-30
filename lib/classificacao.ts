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
}

export type CelulaCst = { nota: string | null; calculado: string | null; itens: number; valor: number }

export type ItemCritico = {
  sentido: "entrada" | "saida"
  descricao: string | null
  pares: string[]
  itens: number
  valor: number
  perda: number
  ganho: number
}

export type FornecedorCritico = {
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
