import { projetarClassificacao } from "@/lib/divergencias"
import { lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Perda e ganho estimados das divergências em cada ano da transição. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { calculo, recorte, sentido, filtros } = await lerSelecao(id, await lerJson(req))
  const projecao = await projetarClassificacao(id, { recorte, sentido, filtros }, calculo.anos, calculo.periodo_meses)
  return Response.json({ projecao })
})
