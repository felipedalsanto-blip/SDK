import { ErroDoPainel, rota } from "@/lib/pricetax"
import { classificarNbs, classificarNcm, listarNbs } from "@/lib/receita"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Classificação oficial de um NCM ou NBS novo (calculadora da Receita) e a lista de NBS. */
export const GET = rota(async (req: Request) => {
  const u = new URL(req.url)
  const ano = Number(u.searchParams.get("ano")) || 2027
  const codigo = (u.searchParams.get("codigo") ?? "").replace(/\D/g, "")
  switch (u.searchParams.get("tipo")) {
    case "ncm":
      return Response.json(await classificarNcm(codigo, ano))
    case "nbs":
      return Response.json(await classificarNbs(codigo, ano))
    case "nbs-lista": {
      const res = Response.json(await listarNbs(ano))
      res.headers.set("cache-control", "private, max-age=86400")
      return res
    }
    default:
      throw new ErroDoPainel(400, "requisicao_invalida", "Informe tipo=ncm, nbs ou nbs-lista.")
  }
})
