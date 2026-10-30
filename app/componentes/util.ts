"use client"
import { useEffect, useRef, useState } from "react"

/** Erro de uma rota /api do painel, com o `codigo` da API PriceTax (ou do painel). */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export async function api<T>(caminho: string, corpo?: unknown, sinal?: AbortSignal): Promise<T> {
  const r = await fetch(caminho, {
    method: corpo === undefined ? "GET" : "POST",
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: sinal,
  })
  const dados = await r.json().catch(() => null)
  if (!r.ok) throw new ErroApi(r.status, dados?.codigo ?? "erro_interno", dados?.mensagem ?? `Falha ${r.status}`)
  return dados as T
}

/** Texto para uma pessoa, decidido pelo código do erro. */
export function explicarErro(e: unknown): string {
  if (!(e instanceof ErroApi)) return "Não foi possível falar com o servidor do painel."
  switch (e.codigo) {
    case "sem_chave":
      return "O servidor do painel está sem a chave: defina PRICETAX_API_KEY no .env e reinicie."
    case "chave_invalida":
      return "A chave de API foi recusada (errada, revogada ou expirada). Confira em Meus Dados → Integrações."
    case "calculo_nao_encontrado":
      return "Este cálculo não existe ou não é da conta desta chave."
    case "recalcule":
      return "Os dados deste cálculo precisam ser gerados de novo no app da PriceTax."
    case "limite_excedido":
      return "Limite de 60 chamadas por minuto atingido. Aguarde um pouco e tente de novo."
    case "servico_ocupado":
    case "servico_indisponivel":
    case "falha_de_rede":
      return "A API da PriceTax não respondeu agora. Tente de novo em instantes."
    default:
      return e.message
  }
}

/** Busca dados quando as dependências mudam, cancelando a busca anterior. */
export function useBusca<T>(buscar: ((sinal: AbortSignal) => Promise<T>) | null, deps: unknown[]) {
  const [estado, setEstado] = useState<{ dados: T | null; erro: unknown; carregando: boolean }>({
    dados: null,
    erro: null,
    carregando: false,
  })
  useEffect(() => {
    if (!buscar) {
      setEstado({ dados: null, erro: null, carregando: false })
      return
    }
    const ctl = new AbortController()
    setEstado((s) => ({ ...s, erro: null, carregando: true }))
    buscar(ctl.signal).then(
      (dados) => setEstado({ dados, erro: null, carregando: false }),
      (erro) => {
        if (!ctl.signal.aborted) setEstado({ dados: null, erro, carregando: false })
      },
    )
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return estado
}

/** Largura de um elemento, acompanhando o redimensionamento. */
export function useLargura<E extends HTMLElement>() {
  const ref = useRef<E>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, largura] as const
}

type Valor = string | number | boolean | null | undefined
const num = (v: Valor) => (typeof v === "number" && Number.isFinite(v) ? v : null)

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 })
const brlCompacto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 })

// `null` é "sem dado", não zero: aparece como "n/d".
export const fmtBRL = (v: Valor) => (num(v) === null ? "n/d" : brl.format(num(v)!))
export const fmtBRLCurto = (v: Valor) => (num(v) === null ? "n/d" : brlCompacto.format(num(v)!))
export const fmtInt = (v: Valor) => (num(v) === null ? "n/d" : inteiro.format(num(v)!))
/** Alíquotas e cargas vêm em fração (0.27 = 27%). */
export const fmtPct = (v: Valor) => (num(v) === null ? "n/d" : pct.format(num(v)!))

/** Variação relativa de antes para depois, ou null quando não dá para calcular. */
export function variacao(antes: Valor, depois: Valor): number | null {
  const a = num(antes)
  const d = num(depois)
  if (a === null || d === null || a === 0) return null
  return (d - a) / Math.abs(a)
}

/** Diferença em pontos percentuais entre duas frações. */
export function pontos(antes: Valor, depois: Valor): number | null {
  const a = num(antes)
  const d = num(depois)
  return a === null || d === null ? null : (d - a) * 100
}

export function fmtData(v: Valor) {
  if (typeof v !== "string" || !v) return "n/d"
  const [a, m, d] = v.slice(0, 10).split("-")
  return d && m && a ? `${d}/${m}/${a}` : v
}

export function fmtCnpj(v: Valor) {
  if (typeof v !== "string") return "n/d"
  const s = v.replace(/\D/g, "")
  return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v
}

export { num }

/** Variação relativa formatada com sinal ("+12,3%"), ou null quando não dá para calcular. */
export function fmtVariacao(antes: Valor, depois: Valor): string | null {
  const v = variacao(antes, depois)
  if (v === null) return null
  return `${v > 0 ? "+" : ""}${fmtPct(v)}`
}

/** "jan/2024" a partir de "2024-01" ou "2024-01-15". */
export function fmtMes(v: string | null) {
  if (!v) return null
  const [a, m] = v.split("-")
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return m && a ? `${nomes[Number(m) - 1] ?? m}/${a}` : v
}
