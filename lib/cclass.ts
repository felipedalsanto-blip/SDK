import tabela from "./cclasstrib.json"

/* A tabela oficial de cClassTrib e CST do IBS e da CBS. Sem "server-only": o simulador usa no navegador. */

export type CClass = { cst: string; nome: string; reducaoIbs: number; reducaoCbs: number; fimVigencia: string | null }
export type Cst = { nome: string; exigeTributo: boolean }
export const CCLASS = tabela.cclass as Record<string, CClass>
export const CST = tabela.cst as Record<string, Cst>
export const FONTE_TABELA = { fonte: tabela.fonte, obtidoEm: tabela.obtidoEm }

/**
 * CSTs em que o tributo é a alíquota padrão vezes (1 − redução da tabela), ou zero quando o CST
 * não exige tributo. Os demais (alíquota fixa, uniformes, diferimento, suspensão, monofásica,
 * transferência de crédito, ajustes) têm regra própria e ficam fora da estimativa em R$.
 */
const CST_ESTIMAVEIS = new Set(["000", "200", "222", "400", "410"])

export type Tributo = "ibs" | "cbs"

/** Parcela do tributo cheio que a classificação manda pagar (0 a 1), ou null se não é estimável. */
export function fator(codigo: string | null, tributo: Tributo): number | null {
  const c = codigo ? CCLASS[codigo] : undefined
  if (!c || !CST_ESTIMAVEIS.has(c.cst)) return null
  if (!CST[c.cst]?.exigeTributo) return 0
  return 1 - (tributo === "ibs" ? c.reducaoIbs : c.reducaoCbs) / 100
}

export const nomeCclass = (codigo: string | null) => (codigo ? (CCLASS[codigo]?.nome ?? null) : null)
