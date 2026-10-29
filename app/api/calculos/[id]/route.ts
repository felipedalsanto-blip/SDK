import { obterCalculo, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Regimes, anos e cenários que o cálculo tem: o navegador só oferece estes. */
export const GET = rota(async (_req, { params }: Ctx) => {
  const { id } = await params
  return Response.json(await obterCalculo(id))
})
