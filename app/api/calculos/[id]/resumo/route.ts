import { METRICAS_RESUMO } from "@/lib/catalogo"
import { emCache, lerJson, lerSelecao, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Totais do recorte, antes × depois: uma consulta sem `agrupar_por`. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { recorte, sentido, filtros } = await lerSelecao(id, await lerJson(req))
  const entrada = { recorte, sentido, filtros, metricas: [...METRICAS_RESUMO] }
  const { grupos } = await emCache(`resumo:${id}:${JSON.stringify(entrada)}`, 300, () =>
    pricetax().calculos.consultar(id, entrada),
  )
  return Response.json({ total: grupos[0] ?? null })
})
