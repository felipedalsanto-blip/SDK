import "server-only"
import { CCLASS } from "./cclass"
import restritos from "./ncm-restritos.json"
import { ErroDoPainel, emCache } from "./pricetax"

/*
 * Classificação de um produto (NCM) ou serviço (NBS) novo na calculadora oficial do IBS e da CBS
 * da Receita Federal (dados abertos, sem chave). Por NCM, testa só os cClassTrib que dependem do
 * produto (anexos da LC 214, ver lib/ncm-restritos.json); por NBS, a calculadora devolve os
 * cClassTrib específicos do serviço.
 */

const BASE = "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora"
const UM_DIA = 86_400

export type Opcao = { cclass: string; cst: string; nome: string; reducaoIbs: number; reducaoCbs: number }
export type Classificacao = {
  tipo: "ncm" | "nbs"
  codigo: string
  descricao: string
  /** Reduções e benefícios que a calculadora oficial vincula a este código. */
  especificas: Opcao[]
  /** Só NBS: outras reduções aceitas para o serviço, que dependem da operação ou de quem presta. */
  gerais: Opcao[]
  fonte: string
}

async function buscar<T>(caminho: string): Promise<T | null> {
  let r: Response
  try {
    r = await fetch(`${BASE}${caminho}`, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new ErroDoPainel(502, "receita_indisponivel", "A calculadora da Receita não respondeu. Tente de novo em instantes.")
  }
  if (r.status === 404) return null
  if (!r.ok) throw new ErroDoPainel(502, "receita_indisponivel", `A calculadora da Receita respondeu ${r.status}.`)
  return (await r.json()) as T
}

const opcao = (cclass: string, nomeOficial?: string): Opcao => {
  const c = CCLASS[cclass]
  return { cclass, cst: c?.cst ?? cclass.slice(0, 3), nome: c?.nome ?? nomeOficial ?? cclass, reducaoIbs: c?.reducaoIbs ?? 0, reducaoCbs: c?.reducaoCbs ?? 0 }
}

type Nomenclatura = { capitulo?: string; posicao?: string; subposicao?: string; item?: string; subitem?: string }
const descrever = (n: Nomenclatura) => [n.posicao, n.subposicao, n.item, n.subitem].filter(Boolean).join(" · ") || n.capitulo || ""

const dataDe = (ano: number) => `${Math.max(2027, ano)}-01-01`

export function classificarNcm(ncm: string, ano: number): Promise<Classificacao> {
  if (!/^\d{8}$/.test(ncm)) throw new ErroDoPainel(400, "requisicao_invalida", "O NCM tem 8 dígitos.")
  const data = dataDe(ano)
  return emCache(`receita-ncm:${ncm}:${data}`, UM_DIA, async () => {
    const nome = await buscar<Nomenclatura>(`/dados-abertos/ncm?ncm=${ncm}&data=${data}`)
    if (!nome) throw new ErroDoPainel(404, "ncm_inexistente", `O NCM ${ncm} não existe na tabela oficial para ${data.slice(0, 4)}.`)
    const especificas: Opcao[] = []
    const lista = restritos.restritos
    for (let i = 0; i < lista.length; i += 6) {
      const lote = await Promise.all(
        lista.slice(i, i + 6).map((c) =>
          buscar<{ valido: boolean }>(`/dados-abertos/classificacoes-tributarias/ncm-aplicavel?cClassTrib=${c}&ncm=${ncm}&dataOcorrenciaFatoGerador=${data}`),
        ),
      )
      lote.forEach((r, j) => r?.valido && especificas.push(opcao(lista[i + j])))
    }
    return { tipo: "ncm", codigo: ncm, descricao: descrever(nome), especificas: ordenar(especificas), gerais: [], fonte: `Calculadora oficial da Receita (base ${restritos.versaoDb})` }
  })
}

export function classificarNbs(nbs: string, ano: number): Promise<Classificacao> {
  if (!/^\d{9}$/.test(nbs)) throw new ErroDoPainel(400, "requisicao_invalida", "A NBS tem 9 dígitos.")
  const data = dataDe(ano)
  return emCache(`receita-nbs:${nbs}:${data}`, UM_DIA, async () => {
    const nome = await buscar<Nomenclatura>(`/dados-abertos/nbs?nbs=${nbs}&data=${data}`)
    if (!nome) throw new ErroDoPainel(404, "nbs_inexistente", `A NBS ${nbs} não existe na tabela oficial para ${data.slice(0, 4)}.`)
    type Situacao = { codigoClassificacaoTributaria: string; descricaoClassificacaoTributaria: string }
    const proprias = (await buscar<Situacao[]>(`/nfse/situacoes-classificacoes-tributarias?nbs=${nbs}&data=${data}`)) ?? []
    const aceitas = (await buscar<string[]>(`/dados-abertos/classificacoes-tributarias/nbs?nbs=${nbs}&data=${data}`)) ?? []
    const especificas = proprias.map((s) => opcao(s.codigoClassificacaoTributaria, s.descricaoClassificacaoTributaria))
    const ja = new Set(especificas.map((o) => o.cclass))
    // Reduções de alíquota que valem para qualquer serviço (dependem de quem presta ou da operação).
    const gerais = aceitas.filter((c) => !ja.has(c) && CCLASS[c]?.cst === "200").map((c) => opcao(c))
    return { tipo: "nbs", codigo: nbs, descricao: descrever(nome), especificas: ordenar(especificas), gerais: ordenar(gerais), fonte: "Calculadora oficial da Receita" }
  })
}

/** A lista de NBS vigentes, para a busca por descrição. */
export function listarNbs(ano: number): Promise<{ codigo: string; descricao: string }[]> {
  const data = dataDe(ano)
  return emCache(`receita-nbs-lista:${data}`, UM_DIA, async () => (await buscar<{ codigo: string; descricao: string }[]>(`/dados-abertos/nbs/lista?data=${data}`)) ?? [])
}

/** Maior redução primeiro: é a que o simulador sugere. */
const ordenar = (l: Opcao[]) => [...l].sort((a, b) => b.reducaoCbs + b.reducaoIbs - (a.reducaoCbs + a.reducaoIbs))
