// Qualidade da base e tipo de operação.
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { descricaoGenerica, ncmAusente } from "../lib/qualidade"
import { tipoDaLinha } from "../lib/tipos"

describe("descrição genérica", () => {
  for (const d of ["DIVERSOS", "Material de consumo", "conforme nota", "123", "", "PEÇAS 01"]) it(`"${d}" é genérica`, () => assert.ok(descricaoGenerica(d)))
  for (const d of ["PA SX MA 8.8 12 X 120", "VÁLVULA ESFERA 2 POL", "Tênis couro 38"]) it(`"${d}" identifica o item`, () => assert.ok(!descricaoGenerica(d)))
})

describe("NCM ausente", () => {
  it("vazio, curto ou zerado", () => assert.ok([null, "", "1234", "00000000", "8421230"].every(ncmAusente)))
  it("8 dígitos válidos", () => assert.ok(!ncmAusente("84212300")))
})

describe("tipo de operação", () => {
  it("produto, serviço e as duas locações", () => {
    assert.equal(tipoDaLinha("produto", "venda"), "produto")
    assert.equal(tipoDaLinha("servico", "compra"), "servico")
    assert.equal(tipoDaLinha("locacao", "locacao_imovel"), "locacao_imovel")
    assert.equal(tipoDaLinha("locacao", "locacao_bem_movel"), "locacao_movel")
    assert.equal(tipoDaLinha(null, null), "produto")
  })
  it("tipo desconhecido fica com o próprio nome", () => assert.equal(tipoDaLinha("energia", "x"), "outro:energia"))
})
