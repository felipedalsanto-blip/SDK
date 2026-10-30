import { montarExecutivo } from "@/lib/executivo"
import { lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Visão executiva: Hoje e cada ano da reforma, no regime e nos cenários escolhidos. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { calculo, recorte } = await lerSelecao(id, await lerJson(req))
  return Response.json(await montarExecutivo(calculo, recorte))
})
