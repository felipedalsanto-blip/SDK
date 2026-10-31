// Fórmulas do precificador (Novo produto). Os esperados vêm das fórmulas escritas aqui por extenso,
// não do motor. Elas foram conferidas contra linhas reais da Pricetax (venda interestadual a 12%,
// PIS/COFINS 9,25% com Tema 69, CBS 11,25% e IBS 0,1% em 2027): diferença de até R$ 0,02 por
// arredondamento da linha. Os valores abaixo são sintéticos.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { precoLiquido, simular, transicao, type Entrada } from "../lib/precificacao-calculo"

const base: Entrada = {
  tipo: "produto", descricao: "", ncm: "", nbs: "", metodo: "transicao", custo: 1000, margemModo: "preco", margem: 1000, despesas: 0,
  ano: 2027, destino: "revenda", interestadual: true, hoje: { icms: 12, iss: 0, pis_cofins: 9.25, ipi: 0 }, tema69: true,
  st: { ativo: false, mva: 0, aliqDestino: 0 }, difal: { ativo: false, aliqDestino: 0 }, ipiZfm: false, cclass: "000001",
  cheias: { "2027": { ibs: 0.1, cbs: 11.25 }, "2029": { ibs: 1.87, cbs: 11.35 }, "2033": { ibs: 18.7, cbs: 11.35 } }, manual: { ibs: 0, cbs: 0 },
}
const quase = (real: number, esperado: number, nome: string) => assert.ok(Math.abs(real - esperado) < 0.005, `${nome}: ${real} ≠ ${esperado}`)

describe("hoje (AR)", () => {
  it("ICMS por dentro e PIS/COFINS sem o ICMS na base (Tema 69): a empresa fica com o valor líquido", () => {
    const n = simular(base, "ar")
    const G = 1000 / ((1 - 0.12) * (1 - 0.0925))
    quase(n.operacao, G, "valor da operação")
    quase(n.valores.icms, 0.12 * G, "ICMS")
    quase(n.valores.pis_cofins, 0.0925 * (G - 0.12 * G), "PIS/COFINS")
    quase(n.operacao - n.valores.icms - n.valores.pis_cofins, 1000, "líquido")
  })
  it("sem Tema 69, o PIS/COFINS incide sobre o ICMS", () => {
    const n = simular({ ...base, tema69: false }, "ar")
    quase(n.operacao, 1000 / (1 - 0.12 - 0.0925), "valor da operação")
  })
  it("IPI por fora; na venda para consumo entra na base do ICMS", () => {
    const comIpi = { ...base, hoje: { ...base.hoje, ipi: 10 } }
    const revenda = simular(comIpi, "ar")
    quase(revenda.bases.icms, revenda.operacao, "revenda: base do ICMS sem IPI")
    const consumo = simular({ ...comIpi, destino: "consumo" }, "ar")
    quase(consumo.bases.icms, consumo.operacao * 1.1, "consumo: base do ICMS com IPI")
    quase(consumo.total, consumo.operacao + consumo.valores.ipi, "total")
  })
})

describe("reforma", () => {
  it("2027: IBS e CBS sobre o valor líquido; ICMS sobre líquido + IBS + CBS, com gross-up", () => {
    const n = simular(base, 2027)
    quase(n.valores.cbs, 1000 * 0.1125, "CBS")
    quase(n.valores.ibs, 1000 * 0.001, "IBS")
    quase(n.bases.icms, (1000 + 113.5) / 0.88, "base do ICMS")
    quase(n.total, (1000 + 113.5) / 0.88, "total")
    quase(n.valores.pis_cofins, 0, "PIS/COFINS extinto")
  })
  it("2029: ICMS a 90% da alíquota", () => {
    const n = simular(base, 2029)
    quase(n.aliq.icms, 0.12 * 0.9, "alíquota do ICMS")
  })
  it("2033: só IBS e CBS", () => {
    const n = simular(base, 2033)
    quase(n.total, 1000 * (1 + 0.187 + 0.1135), "total")
    quase(n.valores.icms, 0, "ICMS extinto")
  })
  it("ISS: base = líquido + IBS + CBS, com gross-up do ISS", () => {
    const n = simular({ ...base, tipo: "servico", hoje: { icms: 0, iss: 5, pis_cofins: 0, ipi: 0 } }, 2027)
    quase(n.valores.iss, 0.05 * ((1000 + 113.5) / 0.95), "ISS")
    quase(n.total, (1000 + 113.5) / 0.95, "total")
  })
  it("metodologia só dos novos: líquido + IBS + CBS", () => {
    const n = simular({ ...base, metodo: "novos" }, 2027)
    quase(n.total, 1113.5, "total")
  })
  it("cClassTrib com redução de 100% zera IBS e CBS", () => {
    const n = simular({ ...base, cclass: "200003" }, 2033)
    quase(n.valores.ibs + n.valores.cbs, 0, "IBS + CBS")
  })
})

describe("ICMS-ST e DIFAL", () => {
  it("ST interna: (operação + IPI) × (1 + MVA) × alíquota do destino − ICMS próprio", () => {
    const e = { ...base, interestadual: false, hoje: { ...base.hoje, icms: 18, ipi: 10 }, st: { ativo: true, mva: 40, aliqDestino: 18 } }
    const n = simular(e, "ar")
    quase(n.valores.icms_st, (n.operacao + n.valores.ipi) * 1.4 * 0.18 - n.valores.icms, "ST")
  })
  it("ST interestadual usa a MVA ajustada", () => {
    const n = simular({ ...base, st: { ativo: true, mva: 40, aliqDestino: 18 } }, "ar")
    quase(n.aliq.mva, (1.4 * 0.88) / 0.82 - 1, "MVA ajustada")
  })
  it("DIFAL a não contribuinte: remetente paga, base única, dentro do preço", () => {
    const n = simular({ ...base, destino: "final", difal: { ativo: true, aliqDestino: 18 } }, "ar")
    assert.equal(n.difalPagoPor, "remetente")
    quase(n.valores.icms_difal, 0.06 * n.bases.icms, "DIFAL")
    quase(n.operacao - n.valores.icms - n.valores.pis_cofins - n.valores.icms_difal, 1000, "líquido")
  })
  it("DIFAL a contribuinte (uso e consumo): destinatário paga, base dupla", () => {
    const n = simular({ ...base, destino: "consumo", difal: { ativo: true, aliqDestino: 18 } }, "ar")
    assert.equal(n.difalPagoPor, "destinatario")
    const baseDupla = (n.bases.icms - n.valores.icms) / (1 - 0.18)
    quase(n.valores.icms_difal, baseDupla * 0.18 - n.valores.icms, "DIFAL")
  })
  it("sem venda interestadual não há DIFAL", () => {
    const n = simular({ ...base, interestadual: false, destino: "final", difal: { ativo: true, aliqDestino: 18 } }, "ar")
    assert.equal(n.difalPagoPor, null)
  })
})

describe("cronograma e margem", () => {
  it("cronograma da EC 132", () => {
    assert.deepEqual([2027, 2028, 2029, 2030, 2031, 2032, 2033].map((a) => transicao("icms", a)), [1, 1, 0.9, 0.8, 0.7, 0.6, 0])
    assert.equal(transicao("pis_cofins", 2027), 0)
    assert.equal(transicao("ipi", 2027), 0)
    assert.equal(transicao("ipi", 2027, true), 1)
  })
  it("margem sobre o preço, markup e preço informado", () => {
    quase(precoLiquido({ ...base, custo: 100, margemModo: "margem", margem: 30 }), 100 / 0.7, "margem")
    quase(precoLiquido({ ...base, custo: 100, margemModo: "markup", margem: 30 }), 130, "markup")
    quase(precoLiquido({ ...base, custo: 100, margemModo: "preco", margem: 150 }), 150, "preço")
  })
})
