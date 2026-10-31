// DRE: receita líquida, lucro bruto, IRPJ e CSLL por regime.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Trilha } from "../lib/capitulos"
import { acharLinha, montarDre, type PremissasIr } from "../lib/demonstrativos"

const quase = (real: number | null | undefined, esperado: number, nome: string) =>
  assert.ok(Math.abs((real ?? 0) - esperado) < 0.005, `${nome}: ${real} ≠ ${esperado}`)

/** Hoje: vendas de 1.000 com 200 de tributos atuais e custo de 500. Em 2027 o preço líquido é o mesmo. */
function trilha(k = 1): Trilha {
  return {
    anos: [2027],
    ar: { vendas: { valor_ar: 1000 * k, debito_ar: 200 * k }, compras: { custo_ar: 500 * k, valor_ar: 600 * k, credito_ar: 100 * k } },
    compras: [{ custo_dr: 500 * k, valor_dr: 590 * k, credito_dr: 90 * k }],
    cenarios: [
      {
        id: "base",
        nome: "Ajustado",
        rotulo: "Com Reajuste",
        vendas: [{ valor_dr: 900 * k, valor_sem_iva_dr: 811 * k, debito_dr: 100 * k, debito_ibs_dr: 1 * k, debito_cbs_dr: 88 * k }],
      },
    ],
    estimados: { anos: [], excluidos: false },
  }
}
const linha = (t: Trilha, id: string, p?: PremissasIr) => acharLinha(montarDre(t, "base", p), id)?.valores ?? []
const premissas = (regime: string, despesasPct: number, meses = 12, atividade: PremissasIr["atividade"] = "comercio"): PremissasIr => ({
  regime,
  meses,
  despesas: { modo: "percentual", valor: despesasPct },
  atividade,
})

describe("DRE até o lucro bruto", () => {
  it("receita líquida e lucro bruto, hoje e em 2027", () => {
    const t = trilha()
    quase(linha(t, "rl")[0], 800, "receita líquida hoje")
    quase(linha(t, "lb")[0], 300, "lucro bruto hoje")
    quase(linha(t, "rl")[1], 811 - (100 - 89), "receita líquida 2027")
  })
})

describe("IRPJ e CSLL", () => {
  it("Lucro Real: 15% e 9% sobre o lucro antes do IR, sem adicional abaixo de R$ 20 mil por mês", () => {
    const t = trilha()
    const p = premissas("lucroReal", 10)
    quase(linha(t, "lair", p)[0], 300 - 80, "LAIR")
    quase(linha(t, "irpj", p)[0], -(0.15 * 220), "IRPJ")
    quase(linha(t, "csll", p)[0], -(0.09 * 220), "CSLL")
    quase(linha(t, "ll", p)[0], 220 * (1 - 0.15 - 0.09), "lucro líquido")
  })
  it("Lucro Real: adicional de 10% acima de R$ 20 mil × meses", () => {
    const t = trilha(1000)
    const p = premissas("lucroReal", 10, 1)
    quase(linha(t, "irpj", p)[0], -(0.15 * 220_000 + 0.1 * (220_000 - 20_000)), "IRPJ com adicional")
  })
  it("Lucro Presumido comércio: bases de 8% (IRPJ) e 12% (CSLL) da receita bruta", () => {
    const p = premissas("lucroPresumido", 10)
    quase(linha(trilha(), "irpj", p)[0], -(0.15 * 0.08 * 1000), "IRPJ")
    quase(linha(trilha(), "csll", p)[0], -(0.09 * 0.12 * 1000), "CSLL")
  })
  it("Lucro Presumido serviços: 32% nas duas bases", () => {
    const p = premissas("lucroPresumido", 10, 12, "servicos")
    quase(linha(trilha(), "irpj", p)[0], -(0.15 * 0.32 * 1000), "IRPJ")
  })
  it("Simples Nacional: IRPJ e CSLL ficam no DAS", () => {
    assert.ok(acharLinha(montarDre(trilha(), "base", premissas("simplesNacional", 10)), "ir-simples"))
    assert.equal(acharLinha(montarDre(trilha(), "base", premissas("simplesNacional", 10)), "irpj"), undefined)
  })
})
