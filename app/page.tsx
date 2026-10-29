import { Painel } from "./componentes/Painel"

// Renderiza a cada requisição: o cálculo padrão vem do .env do servidor, não do build.
export const dynamic = "force-dynamic"

export default function Page() {
  return <Painel calculoPadrao={process.env.PRICETAX_CALCULO_ID || null} />
}
