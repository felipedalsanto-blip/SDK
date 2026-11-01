import tabela from "./cclasstrib.json"

/* A tabela oficial de cClassTrib e CST do IBS e da CBS. Sem "server-only": o simulador usa no navegador. */

export type CClass = {
  cst: string
  nome: string
  reducaoIbs: number
  reducaoCbs: number
  fimVigencia: string | null
  /** Link oficial (Planalto) do dispositivo da LC 214/2025, como vem na tabela da SVRS. */
  lei?: string | null
  anexo?: number | null
}
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

/** Fundamento legal de um cClassTrib, só com o que a tabela oficial traz: link do artigo e anexo. */
export function fundamento(codigo: string | null): { url: string; rotulo: string } | null {
  const c = codigo ? CCLASS[codigo] : undefined
  if (!c?.lei) return null
  const art = c.lei.match(/#art(\d+)([a-z-]*)/i)
  const partes = ["LC 214/2025", art ? `art. ${art[1]}` : null, c.anexo ? `Anexo ${romano(c.anexo)}` : null].filter(Boolean)
  return { url: c.lei, rotulo: partes.join(", ") }
}

function romano(n: number) {
  const t: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]
  let r = ""
  for (const [v, s] of t) while (n >= v) (r += s), (n -= v)
  return r
}

/** CST e redução de um código, para mostrar nota × correto. */
export function detalheCclass(codigo: string | null) {
  const c = codigo ? CCLASS[codigo] : undefined
  const cst = c?.cst ?? codigo?.slice(0, 3) ?? null
  const tributa = cst ? (CST[cst]?.exigeTributo ?? null) : null
  return c
    ? { codigo, cst, nome: c.nome, reducaoIbs: c.reducaoIbs, reducaoCbs: c.reducaoCbs, tributa }
    : { codigo, cst, nome: null, reducaoIbs: null, reducaoCbs: null, tributa }
}

/**
 * Tipo de erro de um par nota → calculado, pela carga que cada código manda pagar:
 * nota sem tributo e cálculo com tributo é benefício indevido; o inverso, benefício não aplicado;
 * cargas diferentes com algum tributo dos dois lados, redutor; mesma carga ou regra própria, classificação.
 */
export function tipoDoPar(nota: string | null, calculado: string | null): import("./classificacao").TipoErro {
  const fn = [fator(nota, "ibs"), fator(nota, "cbs")]
  const fc = [fator(calculado, "ibs"), fator(calculado, "cbs")]
  if (fn.some((f) => f === null) || fc.some((f) => f === null)) return "classificacao"
  const igual = fn.every((f, i) => Math.abs(f! - fc[i]!) < 1e-9)
  if (igual) return "classificacao"
  const zero = (fs: (number | null)[]) => fs.every((f) => f === 0)
  if (zero(fn) && !zero(fc)) return "beneficio_indevido"
  if (zero(fc) && !zero(fn)) return "beneficio_nao_aplicado"
  return "redutor"
}
