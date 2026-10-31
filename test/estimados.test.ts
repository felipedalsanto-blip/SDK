// Ajuste "sem tributos estimados": o tributo estimado volta a ser preço.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ajusteDaLinha, semEstimados, vazio } from "../lib/estimados-calculo"

const quase = (real: number | undefined, esperado: number, nome: string) => assert.ok(Math.abs((real ?? 0) - esperado) < 0.005, `${nome}: ${real} ≠ ${esperado}`)

// Compra de R$ 1.000 desonerados, ICMS estimado de R$ 100 com crédito, IBS+CBS de 8,9% em 2027.
const linha = {
  estimou_icms: "true", estimou_ipi: "false",
  valor_icms_ar: "100,00", credito_icms_ar: "100,00", valor_icms_dr: "100,00", credito_icms_dr: "100,00",
  valor_desonerado_dr: "1.000,00", valor_ibs_dr: "1,00", valor_cbs_dr: "88,00", credito_ibs_dr: "1,00", credito_cbs_dr: "88,00",
}

describe("ajuste de uma linha com ICMS estimado (compra)", () => {
  const lado = vazio()
  const d = ajusteDaLinha(linha, true, lado)!
  it("hoje: o valor pago é o mesmo; sai o ICMS e o crédito dele volta ao custo", () => {
    assert.equal(d.valor_ar, undefined)
    quase(d.valor_icms_ar, -100, "ICMS hoje")
    quase(d.custo_ar, 100, "custo hoje")
    quase(d.credito_ar, -100, "crédito hoje")
  })
  it("no ano: o estimado vira preço e recebe IBS e CBS na proporção da linha", () => {
    quase(d.valor_dr, 100 - 100 + 0.089 * 100, "valor no ano")
    quase(d.credito_dr, -100 + 0.089 * 100, "crédito no ano")
    quase(d.custo_dr, 100, "custo no ano")
  })
  it("conta no resumo como ICMS estimado", () => {
    assert.equal(lado.resumo.icms.linhas, 1)
    quase(lado.resumo.icms.valorAr, 100, "resumo")
  })
  it("linha sem marca de estimado não gera ajuste", () => {
    assert.equal(ajusteDaLinha({ ...linha, estimou_icms: "false" }, true, vazio()), null)
  })
})

describe("aplicar aos grupos", () => {
  it("soma o ajuste só nas métricas que o grupo tem", () => {
    const [g] = semEstimados([{ cnpj_outra_parte: "1", valor_dr: 500, custo_ar: 400 }], new Map([["1", { valor_dr: 10, custo_ar: 5, credito_ar: -5 }]]), (x) => String(x.cnpj_outra_parte))
    assert.deepEqual(g, { cnpj_outra_parte: "1", valor_dr: 510, custo_ar: 405 })
  })
})
