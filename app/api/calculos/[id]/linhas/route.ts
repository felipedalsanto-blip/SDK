import { COLUNAS_LINHAS, type LinhaResumida } from "@/lib/catalogo"
import { lerJson, lerSelecao, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** Uma página de linhas, só com as colunas que a tabela mostra. Sem cache: o cursor é por página. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const corpo = (await lerJson(req)) as Record<string, unknown>
  const { recorte, sentido, filtros } = await lerSelecao(id, corpo)
  const limite = Math.min(Math.max(Number(corpo.limite) || 50, 1), 200)
  const cursor = typeof corpo.cursor === "string" && corpo.cursor ? corpo.cursor : undefined

  const pagina = await pricetax().calculos.pagina(id, { recorte, sentido, filtros, limite, cursor })
  const linhas = pagina.linhas.map((l) => {
    const origem = l as Record<string, unknown>
    return Object.fromEntries(COLUNAS_LINHAS.map((c) => [c, origem[c] ?? null])) as LinhaResumida
  })
  return Response.json({ linhas, total_linhas: pagina.total_linhas, proximo_cursor: pagina.proximo_cursor })
})
