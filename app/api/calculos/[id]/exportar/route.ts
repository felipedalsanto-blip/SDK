import { DIMENSOES_RANKING } from "@/lib/catalogo"
import { lerSelecao, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

/**
 * O recorte inteiro em CSV (formato das planilhas do app: `;`, decimal com vírgula, UTF-8 com
 * BOM), repassado em stream do SDK para o navegador. GET para funcionar como link de download.
 */
export const GET = rota(async (req, { params }: Ctx) => {
  const { id } = await params
  const q = new URL(req.url).searchParams
  const dimensao = q.get("filtro_dimensao")
  const { recorte, sentido, filtros } = await lerSelecao(id, {
    recorte: {
      regime: q.get("regime"),
      ano: q.get("ano"),
      cenario_vendas: q.get("cenario_vendas"),
      cenario_compras: q.get("cenario_compras"),
    },
    sentido: q.get("sentido") ?? "ambas",
    filtro: dimensao && dimensao in DIMENSOES_RANKING ? { dimensao, valor: q.get("filtro_valor") } : null,
  })

  const csv = await pricetax().calculos.exportar(id, { recorte, sentido, filtros })
  const nome = `pricetax-${recorte.regime}-${recorte.ano}-${sentido}.csv`
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "no-store",
    },
  })
})
