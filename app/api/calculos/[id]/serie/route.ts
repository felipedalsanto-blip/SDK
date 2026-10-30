import { METRICAS_SERIE } from "@/lib/catalogo"
import { emCache, lerJson, lerSelecao, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Evolução ano a ano no regime e nos cenários escolhidos: uma consulta por ano do cálculo
 * (até 9). Em sequência, não em paralelo, e com cache, para respeitar o limite de 60/min.
 */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { calculo, recorte, sentido, filtros } = await lerSelecao(id, await lerJson(req))
  const chave = `serie:${id}:${JSON.stringify({ ...recorte, ano: null, sentido, filtros })}`
  const serie = await emCache(chave, 600, async () => {
    const pontos = []
    for (const ano of [...calculo.anos].sort((a, b) => a - b)) {
      const { grupos } = await pricetax().calculos.consultar(id, {
        recorte: { ...recorte, ano },
        sentido,
        filtros,
        metricas: [...METRICAS_SERIE],
      })
      pontos.push({ ano, ...grupos[0] })
    }
    return pontos
  })
  return Response.json({ serie })
})
