import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Painel de cálculos · PriceTax",
  description: "Antes e depois da reforma tributária, a partir dos cálculos da PriceTax.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
