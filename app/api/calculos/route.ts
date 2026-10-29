import { emCache, pricetax, rota } from "@/lib/pricetax"

export const dynamic = "force-dynamic"

/** Lista os cálculos da conta (só nome, empresa e datas: o navegador escolhe pelo id). */
export const GET = rota(async () => {
  const { calculos } = await emCache("calculos", 60, () => pricetax().calculos.listar())
  return Response.json({ calculos })
})
