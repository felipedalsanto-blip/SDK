import { NextResponse, type NextRequest } from "next/server"

/**
 * Com PAINEL_USUARIO e PAINEL_SENHA definidos, o painel inteiro (páginas e /api) pede usuário e
 * senha (HTTP Basic). As rotas /api leem com a chave da conta: sem isto, quem tiver o endereço
 * vê todos os cálculos.
 */
export function middleware(req: NextRequest) {
  const usuario = process.env.PAINEL_USUARIO
  const senha = process.env.PAINEL_SENHA
  if (!usuario || !senha) return NextResponse.next()

  const [tipo, valor] = (req.headers.get("authorization") ?? "").split(" ")
  if (tipo === "Basic" && valor) {
    const [u, ...resto] = atob(valor).split(":")
    if (u === usuario && resto.join(":") === senha) return NextResponse.next()
  }
  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Painel PriceTax", charset="UTF-8"' },
  })
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
