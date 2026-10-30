import { explorar } from "@/lib/explorar"
import { lerJson, obterCalculo, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Visão montável: agrupadores e colunas escolhidos na tela, validados contra a lista permitida. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const corpo = (await lerJson(req)) as Record<string, unknown>
  return Response.json(await explorar(await obterCalculo(id), corpo))
})
