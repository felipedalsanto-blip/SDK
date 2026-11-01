import "server-only" // falha o build se este arquivo for importado num Client Component
import { PriceTax, PriceTaxErro, type Calculo, type CalculoDetalhe, type Filtros, type Recorte } from "@pricetax/sdk"
import { AsyncLocalStorage } from "node:async_hooks"
import { unstable_cache } from "next/cache"
import { DIMENSOES_RANKING, SENTIDOS, type Sentido } from "./catalogo"

/** Erro do próprio painel (validação), com o mesmo formato de resposta dos erros da API. */
export class ErroDoPainel extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

/**
 * As chaves de API do servidor. Aceita mais de uma conta PriceTax ao mesmo tempo:
 * PRICETAX_API_KEY, PRICETAX_API_KEY_2, PRICETAX_API_KEY_3… (ou PRICETAX_API_KEYS separadas por vírgula).
 */
function chavesDoAmbiente(): string[] {
  const numeradas = Object.keys(process.env)
    .filter((k) => /^PRICETAX_API_KEY_\d+$/.test(k))
    .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .map((k) => process.env[k])
  const lista = [process.env.PRICETAX_API_KEY, ...numeradas, ...(process.env.PRICETAX_API_KEYS ?? "").split(/[\s,;]+/)]
  return [...new Set(lista.map((c) => c?.trim()).filter((c): c is string => !!c))]
}

let clientes: PriceTax[] | null = null
/** De qual cliente (conta) é cada cálculo, aprendido ao listar. */
const dono = new Map<string, PriceTax>()

function todosOsClientes(): PriceTax[] {
  if (!clientes) {
    const chaves = chavesDoAmbiente()
    if (!chaves.length) {
      throw new ErroDoPainel(500, "sem_chave", "PRICETAX_API_KEY não está definida no .env do servidor.")
    }
    const baseUrl = process.env.PRICETAX_BASE_URL
    clientes = chaves.map((apiKey) => new PriceTax({ apiKey, ...(baseUrl ? { baseUrl } : {}) }))
  }
  return clientes
}

/** Lista os cálculos de todas as contas, do mais novo para o mais antigo. Uma conta fora do ar não derruba as outras. */
export type SituacaoConta = { conta: number; calculos: number; erro?: string }

async function listarTodos(): Promise<{ calculos: Calculo[]; contas: SituacaoConta[] }> {
  const cs = todosOsClientes()
  const respostas = await Promise.allSettled(cs.map((c) => c.calculos.listar()))
  const calculos: Calculo[] = []
  const contas: SituacaoConta[] = respostas.map((r, i) => {
    if (r.status === "fulfilled") return { conta: i + 1, calculos: r.value.calculos.length }
    const e = r.reason
    const erro = e instanceof PriceTaxErro ? `${e.codigo}: ${e.message}` : e instanceof Error ? e.message : String(e)
    return { conta: i + 1, calculos: 0, erro }
  })
  respostas.forEach((r, i) => {
    if (r.status !== "fulfilled") return
    for (const calc of r.value.calculos) {
      if (dono.has(calc.id) && dono.get(calc.id) !== cs[i]) continue
      dono.set(calc.id, cs[i])
      calculos.push(calc)
    }
  })
  const falha = respostas.find((r): r is PromiseRejectedResult => r.status === "rejected")
  if (!calculos.length && falha) throw falha.reason
  calculos.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
  return { calculos, contas }
}

/** O cliente da conta dona do cálculo. Com uma chave só, é sempre ela. */
async function clienteDe(id: string): Promise<PriceTax> {
  const cs = todosOsClientes()
  if (cs.length === 1) return cs[0]
  if (!dono.has(id)) await listarTodos()
  const c = dono.get(id)
  if (!c) throw new ErroDoPainel(404, "calculo_nao_encontrado", "Este cálculo não pertence a nenhuma das chaves configuradas no servidor.")
  return c
}

type Calculos = PriceTax["calculos"]

/**
 * Cliente da API. Com várias chaves, cada chamada vai para a conta dona do cálculo; a lista junta todas.
 * Criado na primeira chamada, para o build não depender da chave.
 */
export function pricetax(): { calculos: Pick<Calculos, "listar" | "obter" | "consultar" | "pagina" | "exportar"> } {
  return {
    calculos: {
      listar: listarTodos,
      obter: async (id) => limitar(async () => (await clienteDe(id)).calculos.obter(id)),
      consultar: async (id, entrada) => limitar(async () => (await clienteDe(id)).calculos.consultar(id, entrada)),
      pagina: async (id, entrada) => limitar(async () => (await clienteDe(id)).calculos.pagina(id, entrada)),
      // O stream é lido depois: a vaga só fica presa até a resposta começar.
      exportar: async (id, selecao) => limitar(async () => (await clienteDe(id)).calculos.exportar(id, selecao)),
    },
  }
}

/*
 * Concorrência: até 6 chamadas à API ao mesmo tempo por instância. O código pode pedir tudo em paralelo
 * (Promise.all) sem estourar o limite de 60/min de uma vez; o SDK espera e repete quando a API pede (429).
 */
const MAX_PARALELO = 6
let emUso = 0
const fila: (() => void)[] = []
async function limitar<T>(f: () => Promise<T>): Promise<T> {
  if (emUso >= MAX_PARALELO) await new Promise<void>((ok) => fila.push(ok))
  emUso++
  try {
    return await f()
  } finally {
    emUso--
    fila.shift()?.()
    progresso.getStore()?.passo()
  }
}

/** Progresso de uma requisição: quantas chamadas à API já terminaram (e quantas se espera, se souber). */
export type Progresso = { feito: number; total: number | null; passo: () => void }
export const progresso = new AsyncLocalStorage<Progresso>()

/*
 * Cache em dois níveis: memória da instância e, por baixo, o Data Cache do Next (na Vercel, compartilhado
 * entre as instâncias e os acessos). Assim trocar de aba ou cair noutra instância não refaz as consultas.
 * Só valores JSON (Map vira lista e volta); streams ficam só na memória (persistir: false).
 */
const cache = new Map<string, { expira: number; valor: Promise<unknown> }>()
const serializar = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Map ? { __mapa: [...x.entries()] } : x))
const desserializar = (t: string) => JSON.parse(t, (_k, x) => (x && typeof x === "object" && "__mapa" in x ? new Map(x.__mapa) : x))
const persistivel = () => process.env.PAINEL_SEM_CACHE_PERSISTENTE !== "1"

export function emCache<T>(chave: string, segundos: number, buscar: () => Promise<T>, persistir = true): Promise<T> {
  const atual = cache.get(chave)
  if (atual && atual.expira > Date.now()) return atual.valor as Promise<T>
  const ler = persistir && persistivel()
    ? unstable_cache(async () => serializar(await buscar()), ["painel", chave], { revalidate: segundos })().then(
        (t) => desserializar(t) as T,
        // Fora do Next (scripts, testes) o Data Cache não existe: busca direto.
        (e) => (String(e).includes("incrementalCache") ? buscar() : Promise.reject(e)),
      )
    : buscar()
  const valor = ler.catch((e) => {
    cache.delete(chave)
    throw e
  })
  cache.set(chave, { expira: Date.now() + segundos * 1000, valor })
  return valor
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function conferirId(id: string): string {
  if (!UUID.test(id)) throw new ErroDoPainel(400, "requisicao_invalida", "Id de cálculo inválido.")
  return id
}

/** Detalhe do cálculo (regimes, anos, cenários). Curto no cache: um recálculo no app aparece logo. */
export function obterCalculo(id: string): Promise<CalculoDetalhe> {
  return emCache(`calculo:${id}`, 60, () => pricetax().calculos.obter(conferirId(id)))
}

export type SelecaoValidada = {
  calculo: CalculoDetalhe
  recorte: Recorte
  sentido: Sentido
  filtros?: Filtros
}

/**
 * Valida o recorte que veio do navegador contra o que o cálculo tem. Um regime, ano ou
 * cenário que o cálculo não tem não dá erro na API (volta tudo zerado), então é barrado aqui.
 */
export async function lerSelecao(id: string, corpo: unknown): Promise<SelecaoValidada> {
  const calculo = await obterCalculo(id)
  const b = (corpo ?? {}) as Record<string, unknown>
  const r = (b.recorte ?? {}) as Record<string, unknown>
  const invalido = (msg: string) => new ErroDoPainel(400, "recorte_invalido", msg)

  if (typeof r.regime !== "string" || !calculo.regimes.includes(r.regime)) {
    throw invalido(`Regime fora deste cálculo. Disponíveis: ${calculo.regimes.join(", ")}.`)
  }
  const ano = Number(r.ano)
  if (!calculo.anos.includes(ano)) throw invalido(`Ano fora deste cálculo. Disponíveis: ${calculo.anos.join(", ")}.`)

  const cenarios = new Set(calculo.cenarios.map((c) => c.id))
  const cenario = (v: unknown) => {
    const c = typeof v === "string" && v ? v : "base"
    if (!cenarios.has(c)) throw invalido(`Cenário "${c}" fora deste cálculo.`)
    return c
  }

  const sentido = (b.sentido ?? "ambas") as Sentido
  if (!(sentido in SENTIDOS)) throw invalido("Sentido deve ser entrada, saida ou ambas.")

  let filtros: Filtros | undefined
  const f = b.filtro as { dimensao?: unknown; valor?: unknown } | null | undefined
  if (f) {
    if (typeof f.dimensao !== "string" || !(f.dimensao in DIMENSOES_RANKING)) throw invalido("Filtro com dimensão não permitida.")
    if (f.valor !== null && typeof f.valor !== "string") throw invalido("Filtro com valor inválido.")
    filtros = { [f.dimensao]: [f.valor as string | null] }
  }

  return {
    calculo,
    recorte: {
      regime: r.regime as Recorte["regime"],
      ano,
      cenario_vendas: cenario(r.cenario_vendas),
      cenario_compras: cenario(r.cenario_compras),
    },
    sentido,
    filtros,
  }
}

export async function lerJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErroDoPainel(400, "requisicao_invalida", "O corpo da requisição não é JSON.")
  }
}

/** Converte qualquer falha numa resposta `{ codigo, mensagem }`, decidindo pelo código. */
export function respostaDeErro(e: unknown): Response {
  if (e instanceof ErroDoPainel || e instanceof PriceTaxErro) {
    const status = e instanceof PriceTaxErro && e.codigo === "falha_de_rede" ? 502 : e.status || 502
    return Response.json({ codigo: e.codigo, mensagem: e.message }, { status })
  }
  console.error(e)
  return Response.json({ codigo: "erro_interno", mensagem: "Erro inesperado no servidor do painel." }, { status: 500 })
}

/** Envolve um handler de rota: erros viram JSON e nada vai para cache do navegador ou CDN. */
export function rota<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      const res = await handler(req, ctx)
      if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store")
      return res
    } catch (e) {
      return respostaDeErro(e)
    }
  }
}

/**
 * Resposta com progresso real: se o navegador pedir `accept: application/x-ndjson`, cada chamada à API
 * que termina vira uma linha {"p": feitas, "t": total esperado ou null} e a última traz {"r": resultado}
 * (ou {"e": erro}). Sem esse cabeçalho, responde JSON comum.
 */
export async function comProgresso(req: Request, total: number | null, gerar: () => Promise<unknown>): Promise<Response> {
  if (!(req.headers.get("accept") ?? "").includes("application/x-ndjson")) return Response.json(await gerar())
  const cod = new TextEncoder()
  let enviar: (o: unknown) => void = () => {}
  const corpo = new ReadableStream<Uint8Array>({
    start(ctl) {
      enviar = (o) => ctl.enqueue(cod.encode(JSON.stringify(o) + "\n"))
      const estado: Progresso = {
        feito: 0,
        total,
        passo() {
          this.feito++
          enviar({ p: this.feito, t: this.total })
        },
      }
      progresso
        .run(estado, gerar)
        .then(
          (r) => enviar({ r }),
          async (e) => {
            const res = respostaDeErro(e)
            enviar({ e: { status: res.status, ...(await res.json()) } })
          },
        )
        .finally(() => ctl.close())
    },
  })
  return new Response(corpo, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } })
}
