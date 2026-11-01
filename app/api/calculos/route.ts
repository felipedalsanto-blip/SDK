import { emCache, pricetax, rota, type SituacaoConta } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

/** Lista os cálculos da conta (só nome, empresa e datas: o navegador escolhe pelo id). */
export const GET = rota(async () => {
  const { calculos, contas } = (await emCache("calculos", 60, () => pricetax().calculos.listar())) as Awaited<
    ReturnType<ReturnType<typeof pricetax>["calculos"]["listar"]>
  > & { contas?: SituacaoConta[] }
  return Response.json({ calculos, contas: contas ?? [] })
})
