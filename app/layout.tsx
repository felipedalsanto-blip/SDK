import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Reforma Tributária · Pricetax",
  description: "Os efeitos da Reforma Tributária na empresa, a partir dos cálculos da Pricetax.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
