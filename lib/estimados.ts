import "server-only"
import type { CalculoDetalhe, Recorte } from "@pricetax/sdk"
import { registrosCsv } from "./csv"
import { ajusteDaLinha, noMapa, somar, vazio, chaveItem, type Estimados } from "./estimados-calculo"
import { emCache, pricetax } from "./pricetax"
import { tipoDaLinha } from "./tipos"

export * from "./estimados-calculo"

/*
 * IPI e ICMS ESTIMADOS: quando o documento não destaca o tributo (revenda de distribuidor, compra do
 * Simples…), a Pricetax estima o quanto dele veio embutido no preço pela cadeia. Esse valor não veio
 * do fornecedor nem do cliente. A API marca a linha (estimou_ipi, estimou_icms), mas a marca não é
 * dimensão da consulta agregada: aqui lemos as linhas do ano (uma exportação, com cache), somamos o
 * estimado e montamos o ajuste para ver o cálculo SEM o efeito dos estimados.
 *
 * Sem o estimado, o tributo deixa de existir e o valor volta a ser preço:
 * - AR: o valor pago é o mesmo; sai o tributo estimado (e o crédito dele, que volta ao custo);
 * - DR: o preço desonerado fica maior pelo estimado de hoje, o IBS e a CBS incidem sobre ele na mesma
 *   proporção da linha, e sai a parte estimada que ainda restaria no ano (ICMS da transição).
 * O ajuste é calculado no cenário Ajustado (compras) e Com Reajuste (vendas) e aplicado aos demais.
 */

/** Lê as linhas do ano (compras e vendas, cenário Ajustado/Com Reajuste) e soma os estimados. */
export function lerEstimados(calculo: CalculoDetalhe, regime: Recorte["regime"], ano: number): Promise<Estimados> {
  const recorte: Recorte = { regime, ano, cenario_vendas: "base", cenario_compras: "base" }
  return emCache(`estimados:${calculo.id}:${JSON.stringify(recorte)}`, 900, async () => {
    const res: Estimados = { entrada: vazio(), saida: vazio() }
    const stream = await pricetax().calculos.exportar(calculo.id, { recorte, sentido: "ambas" })
    for await (const r of registrosCsv(stream)) {
      const entrada = r.tipo_movimentacao === "entrada"
      const lado = entrada ? res.entrada : res.saida
      const d = ajusteDaLinha(r, entrada, lado)
      if (!d) continue
      somar(lado.total, d)
      noMapa(lado.porCnpj, r.cnpj_outra_parte ?? "", d)
      noMapa(lado.porRegime, r.regime_outra_parte ?? "", d)
      noMapa(lado.porNcm, r.ncm ?? "", d)
      noMapa(lado.porDescricao, r.descricao_produto ?? "", d)
      noMapa(lado.porItem, chaveItem(r.descricao_produto ?? "", r.ncm ?? "", r.cnpj_outra_parte ?? ""), d)
      noMapa(lado.porTipo, tipoDaLinha(r.tipo_linha, r.tipo_operacao), d)
    }
    return res
  })
}

