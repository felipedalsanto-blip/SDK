import { montarAuditoria } from "@/lib/auditoria"
import tabela from "@/lib/cclasstrib.json"
import { lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/** DJF (Dinheiro Jogado Fora) do ano do recorte, do macro (total) ao micro (fornecedor, item). */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const { calculo, recorte } = await lerSelecao(id, await lerJson(req))
  return Response.json(
    await montarAuditoria(calculo, { regime: recorte.regime, ano: recorte.ano }, { fonte: tabela.fonte, obtidoEm: tabela.obtidoEm }),
  )
})
