import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Reforma Tributária · Pricetax",
  description: "Os efeitos da Reforma Tributária na empresa, a partir dos cálculos da Pricetax.",
}

// Aplica o tema escolhido (claro ou escuro) antes de pintar a página, para não piscar.
const TEMA = `try{var t=localStorage.getItem("tema");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Montserrat variável: um arquivo só para todos os pesos. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@100..900&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  )
}
