"use client"
import { TIPOS_LINHA, type DimensaoRanking } from "@/lib/catalogo"
import { explicarErro, fmtCnpj } from "./util"

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
