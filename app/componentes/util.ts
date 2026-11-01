"use client"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

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

/*
 * Cache do navegador para as rotas do painel: a mesma pergunta (caminho + corpo) não vai ao servidor duas
 * vezes em 10 minutos. Trocar de aba volta na hora; pedidos iguais em andamento são compartilhados.
 * Cada pedido em andamento publica o progresso real (chamadas à API feitas / esperadas).
 */
const TTL_MEMORIA = 10 * 60_000
type Entrada = { quando: number; dados?: unknown; promessa?: Promise<unknown> }
const memoria = new Map<string, Entrada>()
export type ProgressoApi = { feito: number; total: number | null; inicio: number }
const progressos = new Map<string, ProgressoApi>()
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export const chaveApi = (caminho: string, corpo?: unknown) => `${caminho}|${corpo === undefined ? "" : JSON.stringify(corpo)}`

/** O que já está no cache para este pedido (ou undefined). */
export function daMemoria<T>(caminho: string, corpo?: unknown): T | undefined {
  const e = memoria.get(chaveApi(caminho, corpo))
  return e && e.dados !== undefined && Date.now() - e.quando < TTL_MEMORIA ? (e.dados as T) : undefined
}

async function buscarComProgresso<T>(caminho: string, corpo: unknown, k: string): Promise<T> {
  const r = await fetch(caminho, {
    method: corpo === undefined ? "GET" : "POST",
    headers: corpo === undefined ? { accept: "application/x-ndjson, application/json" } : { "content-type": "application/json", accept: "application/x-ndjson, application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (!(r.headers.get("content-type") ?? "").includes("ndjson") || !r.body) {
    const dados = await r.json().catch(() => null)
    if (!r.ok) throw new ErroApi(r.status, dados?.codigo ?? "erro_interno", dados?.mensagem ?? `Falha ${r.status}`)
    return dados as T
  }
  progressos.set(k, { feito: 0, total: null, inicio: Date.now() })
  avisar()
  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let resto = ""
  try {
    for (;;) {
      const { value, done } = await leitor.read()
      if (done) break
      resto += value
      let i: number
      while ((i = resto.indexOf("\n")) >= 0) {
        const linha = resto.slice(0, i)
        resto = resto.slice(i + 1)
        if (!linha) continue
        const m = JSON.parse(linha)
        if ("p" in m) {
          const atual = progressos.get(k)!
          progressos.set(k, { ...atual, feito: m.p, total: m.t })
          avisar()
        } else if ("r" in m) return m.r as T
        else if ("e" in m) throw new ErroApi(m.e.status ?? 500, m.e.codigo ?? "erro_interno", m.e.mensagem ?? "Falha")
      }
    }
    throw new ErroApi(502, "erro_interno", "A resposta do servidor terminou antes do resultado.")
  } finally {
    progressos.delete(k)
    avisar()
  }
}

/** Busca com cache e progresso. O sinal só desliga quem esperava: o pedido continua e fica no cache. */
export function buscarMemo<T>(caminho: string, corpo?: unknown, sinal?: AbortSignal): Promise<T> {
  const k = chaveApi(caminho, corpo)
  const e = memoria.get(k)
  let p: Promise<unknown>
  if (e && Date.now() - e.quando < TTL_MEMORIA && (e.dados !== undefined || e.promessa)) p = e.dados !== undefined ? Promise.resolve(e.dados) : e.promessa!
  else {
    const promessa = buscarComProgresso<T>(caminho, corpo, k).then(
      (dados) => {
        memoria.set(k, { quando: Date.now(), dados })
        return dados
      },
      (erro) => {
        memoria.delete(k)
        throw erro
      },
    )
    memoria.set(k, { quando: Date.now(), promessa })
    p = promessa
  }
  if (!sinal) return p as Promise<T>
  return new Promise<T>((ok, falha) => {
    if (sinal.aborted) return falha(new DOMException("abortado", "AbortError"))
    sinal.addEventListener("abort", () => falha(new DOMException("abortado", "AbortError")), { once: true })
    p.then((d) => ok(d as T), falha)
  })
}

/** Busca no cache e acompanha o progresso. `corpo === null` desliga a busca. */
export function useApi<T>(caminho: string, corpo: unknown | null) {
  const k = corpo === null ? null : chaveApi(caminho, corpo)
  const inicial = corpo === null ? undefined : daMemoria<T>(caminho, corpo)
  const [estado, setEstado] = useState<{ k: string | null; dados: T | null; erro: unknown; carregando: boolean }>({
    k,
    dados: inicial ?? null,
    erro: null,
    carregando: corpo !== null && inicial === undefined,
  })
  useEffect(() => {
    if (k === null) return setEstado({ k, dados: null, erro: null, carregando: false })
    const pronto = daMemoria<T>(caminho, corpo)
    if (pronto !== undefined) return setEstado({ k, dados: pronto, erro: null, carregando: false })
    const ctl = new AbortController()
    setEstado((s) => ({ ...s, k, erro: null, carregando: true }))
    buscarMemo<T>(caminho, corpo, ctl.signal).then(
      (dados) => setEstado({ k, dados, erro: null, carregando: false }),
      (erro) => {
        if (!ctl.signal.aborted) setEstado({ k, dados: null, erro, carregando: false })
      },
    )
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k])
  // Ao trocar de pedido com o novo já no cache, mostra direto (sem um quadro com os dados antigos).
  const dados = estado.k === k ? estado.dados : (inicial ?? estado.dados)
  const progresso = useSyncExternalStore(
    (f) => (ouvintes.add(f), () => ouvintes.delete(f)),
    () => (k ? progressos.get(k) : undefined),
    () => undefined,
  )
  return { dados, erro: estado.k === k ? estado.erro : null, carregando: estado.k !== k ? inicial === undefined : estado.carregando, progresso }
}

/** Progresso de um pedido em andamento (para quem busca com buscarMemo). */
export function useProgresso(caminho: string, corpo: unknown | null) {
  const k = corpo === null ? null : chaveApi(caminho, corpo)
  return useSyncExternalStore(
    (f) => (ouvintes.add(f), () => ouvintes.delete(f)),
    () => (k ? progressos.get(k) : undefined),
    () => undefined,
  )
}

/** Pré-carga em segundo plano, uma por vez, quando o navegador está livre. Erros são ignorados. */
const filaPre: { caminho: string; corpo: unknown }[] = []
let preAtivo = false
export function preCarregar(pedidos: { caminho: string; corpo: unknown }[]) {
  for (const p of pedidos) if (daMemoria(p.caminho, p.corpo) === undefined && !memoria.get(chaveApi(p.caminho, p.corpo))?.promessa) filaPre.push(p)
  if (preAtivo) return
  preAtivo = true
  const proximo = () => {
    const p = filaPre.shift()
    if (!p) return void (preAtivo = false)
    buscarMemo(p.caminho, p.corpo)
      .catch(() => {})
      .finally(() => setTimeout(proximo, 200))
  }
  setTimeout(proximo, 800)
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

// `null` é "sem dado", não zero: aparece como travessão.
export const fmtBRL = (v: Valor) => (num(v) === null ? "—" : brl.format(Math.abs(num(v)!) < 0.005 ? 0 : num(v)!))
export const fmtBRLCurto = (v: Valor) => (num(v) === null ? "—" : brlCompacto.format(num(v)!))
export const fmtInt = (v: Valor) => (num(v) === null ? "—" : inteiro.format(num(v)!))
/** Alíquotas e cargas vêm em fração (0.27 = 27%). */
export const fmtPct = (v: Valor) => (num(v) === null ? "—" : pct.format(num(v)!))

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
  if (typeof v !== "string" || !v) return "—"
  const [a, m, d] = v.slice(0, 10).split("-")
  return d && m && a ? `${d}/${m}/${a}` : v
}

export function fmtCnpj(v: Valor) {
  if (typeof v !== "string") return "—"
  const s = v.replace(/\D/g, "")
  return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : v
}

export { num }
