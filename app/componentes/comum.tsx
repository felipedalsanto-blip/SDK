"use client"
import { TIPOS_LINHA, type DimensaoRanking } from "@/lib/catalogo"
import { explicarErro, fmtCnpj, useContagem } from "./util"

export function Erro({ erro }: { erro: unknown }) {
  return (
    <div className="erro" role="alert">
      <strong>Não deu para carregar.</strong> {explicarErro(erro)}
    </div>
  )
}

export function rotuloValor(dimensao: DimensaoRanking, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "(sem valor)"
  if (dimensao === "tipo_linha") return TIPOS_LINHA[String(valor)] ?? String(valor)
  if (dimensao === "cnpj_outra_parte") return fmtCnpj(String(valor))
  return String(valor)
}

/** Número grande que conta até o valor; leitores de tela recebem o valor final direto. */
export function Contador({ valor, formatar, sufixo = "" }: { valor: number; formatar: (v: number) => string; sufixo?: string }) {
  const atual = useContagem(valor)
  return (
    <>
      <span aria-hidden="true">
        {formatar(atual)}
        {sufixo}
      </span>
      <span className="so-leitor">
        {formatar(valor)}
        {sufixo}
      </span>
    </>
  )
}

/** Blocos cinza pulsando no lugar do conteúdo enquanto os números chegam. */
export function Esqueleto({ alturas }: { alturas: number[] }) {
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Carregando">
      {alturas.map((h, i) => (
        <div key={i} style={{ height: h }} />
      ))}
    </div>
  )
}
