import { analisarClassificacao } from "@/lib/divergencias"
import { lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** CST e cClassTrib da nota × calculados no ano do recorte, com perda e ganho estimados. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { recorte, sentido, filtros } = await lerSelecao(id, await lerJson(req))
  return Response.json(await analisarClassificacao(id, { recorte, sentido, filtros }))
})
