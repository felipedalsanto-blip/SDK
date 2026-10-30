import type { RamoId } from "@/lib/auditoria"

/** As quatro causas do DJF em linguagem de cliente, com a ação que resolve cada uma. */
export const CAUSAS: Record<RamoId, { titulo: string; frase: string; acao: string; alvo: "fornecedor" | "item" }> = {
  repasse: {
    titulo: "Fornecedores cobrando a mais",
    frase: "Fornecedores que não ajustarem o preço vão somar o novo imposto ao preço cheio de hoje.",
    acao: "Negociar o preço com os fornecedores",
    alvo: "fornecedor",
  },
  preco: {
    titulo: "Preço de venda desatualizado",
    frase: "Se o preço de venda não acompanhar o novo imposto, a diferença sai da margem.",
    acao: "Revisar o preço de venda dos itens",
    alvo: "item",
  },
  credito: {
    titulo: "Crédito que ficou para trás",
    frase: "Notas de compra com a classificação fiscal errada geram menos crédito do que a empresa tem direito.",
    acao: "Pedir aos fornecedores a correção das notas",
    alvo: "fornecedor",
  },
  destaque: {
    titulo: "Imposto pago a mais nas vendas",
    frase: "Itens cadastrados sem a redução de imposto a que têm direito.",
    acao: "Corrigir o cadastro fiscal dos itens",
    alvo: "item",
  },
}

/** Tons das causas: só cores da paleta (amarelo, preto, cinza e um cinza claro). */
export const COR_CAUSA: Record<RamoId, string> = {
  repasse: "var(--amarelo)",
  preco: "var(--cor-pleno)",
  credito: "var(--cor-hoje)",
  destaque: "var(--cor-neutra-clara)",
}
