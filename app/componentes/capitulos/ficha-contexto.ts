"use client"
import { createContext, useContext } from "react"

export type Alvo = { tipo: "parceiro" | "item"; valor: string; rotulo: string }
export const FichaCtx = createContext<((a: Alvo) => void) | null>(null)

/** Abre a ficha de um fornecedor/cliente ou item; null fora de um capítulo com fichas. */
export function useAbrirFicha() {
  return useContext(FichaCtx)
}
