import type { Recorte } from "@pricetax/sdk"
import { periodo } from "@/lib/executivo"
import { obterCalculo, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Regimes, anos e cenários que o cálculo tem (o navegador só oferece estes) e a raiz da
 * informação: a primeira e a última competência com movimento.
 */
export const GET = rota(async (_req, { params }: Ctx) => {
  const { id } = await params
  const calculo = await obterCalculo(id)
  const ano = calculo.anos[0]
  const regime = calculo.regime_tributario && calculo.regimes.includes(calculo.regime_tributario) ? calculo.regime_tributario : calculo.regimes[0]
  const raiz = ano && regime ? await periodo(id, { regime: regime as Recorte["regime"], ano }) : { inicio: null, fim: null }
  return Response.json({ ...calculo, raiz })
})
