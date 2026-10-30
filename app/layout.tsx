import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Painel de cálculos · PriceTax",
  description: "Antes e depois da reforma tributária, a partir dos cálculos da PriceTax.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica o tema escolhido antes da primeira pintura, para não piscar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("pricetax-tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
