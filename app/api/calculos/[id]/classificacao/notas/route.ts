import { detalharNotas, lerAlvo } from "@/lib/notas-divergentes"
import { lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** As notas de uma divergência (par, item, fornecedor ou tipo de erro), para a gaveta de detalhe. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const corpo = await lerJson(req)
  const { recorte, sentido, filtros } = await lerSelecao(id, corpo)
  return Response.json(await detalharNotas(id, { recorte, sentido, filtros }, lerAlvo((corpo as Record<string, unknown>)?.alvo)))
})
