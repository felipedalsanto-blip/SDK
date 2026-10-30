import { detalharRamo, type RamoId } from "@/lib/auditoria"
import { ErroDoPainel, lerJson, lerSelecao, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

const RAMOS_COM_DETALHE: RamoId[] = ["repasse", "preco"]

/** Nível micro de um caso do DJF: produtos de um fornecedor ou clientes de um produto. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const corpo = (await lerJson(req)) as Record<string, unknown>
  const { calculo, recorte } = await lerSelecao(id, corpo)
  const ramo = corpo.ramo as RamoId
  if (!RAMOS_COM_DETALHE.includes(ramo) || typeof corpo.valor !== "string" || !corpo.valor) {
    throw new ErroDoPainel(400, "requisicao_invalida", "Caso do DJF inválido.")
  }
  return Response.json({ detalhes: await detalharRamo(calculo, { regime: recorte.regime, ano: recorte.ano }, ramo, corpo.valor) })
})
