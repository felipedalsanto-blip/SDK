import { DIMENSOES_RANKING, MEDIDAS, metricaAr, metricaDr, type DimensaoRanking, type Medida } from "@/lib/catalogo"
import { emCache, ErroDoPainel, lerJson, lerSelecao, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Maiores grupos de uma dimensão, comparando a medida antes × depois. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const corpo = (await lerJson(req)) as Record<string, unknown>
  const { recorte, sentido, filtros } = await lerSelecao(id, corpo)

  const dimensao = corpo.dimensao as DimensaoRanking
  const medida = corpo.medida as Medida
  if (!(dimensao in DIMENSOES_RANKING)) throw new ErroDoPainel(400, "requisicao_invalida", "Dimensão não permitida.")
  if (!(medida in MEDIDAS)) throw new ErroDoPainel(400, "requisicao_invalida", "Medida não permitida.")
  const limite = Math.min(Math.max(Number(corpo.limite) || 10, 1), 50)

  const entrada = {
    recorte,
    sentido,
    filtros,
    agrupar_por: [dimensao],
    metricas: ["itens", metricaAr(medida), metricaDr(medida), "carga_efetiva_ar", "carga_efetiva_dr"] as const,
    ordenar_por: { metrica: metricaAr(medida), direcao: "desc" as const },
    limite,
  }
  const resultado = await emCache(`ranking:${id}:${JSON.stringify(entrada)}`, 300, () =>
    pricetax().calculos.consultar(id, { ...entrada, metricas: [...entrada.metricas] }),
  )
  return Response.json(resultado)
})
