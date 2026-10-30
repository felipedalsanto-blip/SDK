import type { Recorte } from "@pricetax/sdk"
import { montarCompras, montarEstorno, montarFicha, montarTrilha, montarVendas } from "@/lib/capitulos"
import { montarPrecificacao } from "@/lib/precificacao"
import { ErroDoPainel, lerJson, obterCalculo, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"
// A trilha e o estorno leem vários anos e cenários: dá tempo à função em produção.
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; capitulo: string }> }

/** Os capítulos do diagnóstico: compras, vendas, trilha (DRE e fluxo de caixa) e estorno de débito. */
export const POST = rota(async (req, { params }: Ctx) => {
  const { id, capitulo } = await params
  const corpo = (await lerJson(req)) as Record<string, unknown>
  const calculo = await obterCalculo(id)
  const regime = corpo.regime
  if (typeof regime !== "string" || !calculo.regimes.includes(regime)) {
    throw new ErroDoPainel(400, "recorte_invalido", `Regime fora deste cálculo. Disponíveis: ${calculo.regimes.join(", ")}.`)
  }
  const r = regime as Recorte["regime"]
  switch (capitulo) {
    case "compras":
      return Response.json(await montarCompras(calculo, r))
    case "vendas": {
      const qtd = [10, 20, 30, 40, 50].includes(Number(corpo.quantidade)) ? Number(corpo.quantidade) : 10
      return Response.json(await montarVendas(calculo, r, String(corpo.cenario ?? "base"), qtd))
    }
    case "trilha":
      return Response.json(await montarTrilha(calculo, r))
    case "estorno":
      return Response.json(await montarEstorno(calculo, r))
    case "precificacao":
      return Response.json(await montarPrecificacao(calculo, r))
    case "ficha": {
      const tipo = corpo.tipo === "item" ? "item" : "parceiro"
      const sentido = corpo.sentido === "saida" ? "saida" : "entrada"
      if (typeof corpo.valor !== "string" || !corpo.valor) throw new ErroDoPainel(400, "requisicao_invalida", "Informe o fornecedor, cliente ou item.")
      return Response.json(await montarFicha(calculo, r, sentido, String(corpo.cenario ?? "base"), tipo, corpo.valor))
    }
    default:
      throw new ErroDoPainel(404, "requisicao_invalida", "Capítulo desconhecido.")
  }
})
