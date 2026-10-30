import "server-only"
import type { CalculoDetalhe, Dimensao, Metrica, Recorte } from "@pricetax/sdk"
import { anoAcao } from "./capitulos"
import { registrosCsv } from "./csv"
import { emCache, ErroDoPainel, pricetax } from "./pricetax"
import { AGRUPADORES, METRICAS_EXPLORAR } from "./tributos"

export type Exploracao = {
  ano: number
  grupos: Record<string, string | number | boolean | null>[]
  total: number
  nomes: Record<string, string>
}

const POR_PAGINA = 200

/** A visão montável: agrupa pelos campos escolhidos e soma as colunas escolhidas, com paginação. */
export async function explorar(calculo: CalculoDetalhe, corpo: Record<string, unknown>): Promise<Exploracao> {
  const regime = String(corpo.regime ?? "")
  if (!calculo.regimes.includes(regime)) throw new ErroDoPainel(400, "recorte_invalido", "Regime fora deste cálculo.")
  const sentido = corpo.sentido === "saida" ? "saida" : "entrada"
  const cenario = typeof corpo.cenario === "string" && calculo.cenarios.some((c) => c.id === corpo.cenario) ? corpo.cenario : "base"
  const agrupar = (Array.isArray(corpo.agrupar_por) ? corpo.agrupar_por : []).filter((d): d is string => typeof d === "string" && d in AGRUPADORES)
  const metricas = (Array.isArray(corpo.metricas) ? corpo.metricas : []).filter((m): m is string => typeof m === "string" && METRICAS_EXPLORAR.has(m))
  if (agrupar.length === 0 || agrupar.length > 4) throw new ErroDoPainel(400, "requisicao_invalida", "Escolha de 1 a 4 agrupadores.")
  if (metricas.length === 0) throw new ErroDoPainel(400, "requisicao_invalida", "Escolha ao menos uma coluna.")
  const ordenar = typeof corpo.ordenar === "string" && metricas.includes(corpo.ordenar) ? corpo.ordenar : metricas[0]
  const direcao = corpo.direcao === "asc" ? "asc" : "desc"
  const pagina = Math.max(0, Math.min(400, Number(corpo.pagina) || 0))

  const ano = anoAcao(calculo, corpo.ano)
  const recorte: Recorte = { regime: regime as Recorte["regime"], ano, cenario_vendas: cenario, cenario_compras: "base" }
  const entrada = {
    recorte,
    sentido,
    agrupar_por: agrupar as Dimensao[],
    metricas: metricas as Metrica[],
    ordenar_por: { metrica: ordenar as Metrica, direcao },
    limite: POR_PAGINA,
    offset: pagina * POR_PAGINA,
  } as const
  const r = await emCache(`explorar:${calculo.id}:${JSON.stringify(entrada)}`, 600, () =>
    pricetax().calculos.consultar(calculo.id, { ...entrada, agrupar_por: [...entrada.agrupar_por], metricas: [...entrada.metricas] }),
  )

  // Com fornecedor/cliente entre os agrupadores, busca a razão social dos CNPJs da página (uma exportação filtrada).
  const nomes: Record<string, string> = {}
  if (agrupar.includes("cnpj_outra_parte")) {
    const cnpjs = [...new Set(r.grupos.map((g) => g.cnpj_outra_parte).filter((c): c is string => typeof c === "string" && !!c))].sort()
    if (cnpjs.length) {
      const lista = await emCache(`explorar-nomes:${calculo.id}:${sentido}:${JSON.stringify(recorte)}:${cnpjs.join(",")}`, 3600, async () => {
        const stream = await pricetax().calculos.exportar(calculo.id, { recorte, sentido, filtros: { cnpj_outra_parte: cnpjs } })
        const achados: [string, string][] = []
        const vistos = new Set<string>()
        for await (const reg of registrosCsv(stream)) {
          if (reg.cnpj_outra_parte && !vistos.has(reg.cnpj_outra_parte) && reg.razao_social_outra_parte) {
            vistos.add(reg.cnpj_outra_parte)
            achados.push([reg.cnpj_outra_parte, reg.razao_social_outra_parte])
          }
        }
        return achados
      })
      for (const [c, nome] of lista) nomes[c] = nome
    }
  }
  return { ano, grupos: r.grupos, total: r.total_grupos, nomes }
}
