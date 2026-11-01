import "server-only" // falha o build se este arquivo for importado num Client Component
import { PriceTax, PriceTaxErro, type Calculo, type CalculoDetalhe, type Filtros, type Recorte } from "@pricetax/sdk"
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
      obter: async (id) => (await clienteDe(id)).calculos.obter(id),
      consultar: async (id, entrada) => (await clienteDe(id)).calculos.consultar(id, entrada),
      pagina: async (id, entrada) => (await clienteDe(id)).calculos.pagina(id, entrada),
      exportar: async (id, selecao) => (await clienteDe(id)).calculos.exportar(id, selecao),
    },
  }
}

// Cache em memória no servidor: poupa o limite de 60 chamadas/min por chave.
const cache = new Map<string, { expira: number; valor: Promise<unknown> }>()
export function emCache<T>(chave: string, segundos: number, buscar: () => Promise<T>): Promise<T> {
  const atual = cache.get(chave)
  if (atual && atual.expira > Date.now()) return atual.valor as Promise<T>
  const valor = buscar().catch((e) => {
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
