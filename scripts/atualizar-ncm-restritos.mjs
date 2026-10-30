// Descobre quais cClassTrib dependem do NCM (os ligados a anexos da LC 214, como cesta básica,
// medicamentos e insumos agropecuários), na calculadora oficial da Receita. As demais classificações
// a calculadora aceita para qualquer NCM: dependem da operação, não do produto.
// Rode quando a tabela mudar: `npm run ncm:atualizar`. Grava lib/ncm-restritos.json.
import { writeFileSync } from "node:fs"

const BASE = "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/api/calculadora/dados-abertos"
const DATA = "2027-01-01"
// NCMs de controle bem diferentes entre si: quem é válido para todos não restringe por NCM.
const CONTROLE = ["84212300", "10063021", "30049099", "87032310", "22030000", "96190000", "27101259", "07020000", "39269090", "61091000"]

const json = async (url) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} em ${url}`)
  return r.json()
}

const classes = (await json(`${BASE}/classificacoes-tributarias/cbs-ibs?data=${DATA}`)).filter((c) => c.nomenclatura === "NCM" || c.nomenclatura === "NBS ou NCM")
const restritos = []
for (const c of classes) {
  let validos = 0
  for (const ncm of CONTROLE) {
    const r = await json(`${BASE}/classificacoes-tributarias/ncm-aplicavel?cClassTrib=${c.codigo}&ncm=${ncm}&dataOcorrenciaFatoGerador=${DATA}`)
    if (r.valido) validos++
  }
  if (validos < CONTROLE.length) restritos.push(c.codigo)
}
const versao = await json(`${BASE}/versao`)
writeFileSync(
  new URL("../lib/ncm-restritos.json", import.meta.url),
  JSON.stringify({ fonte: BASE, versaoDb: versao.versaoDb, obtidoEm: new Date().toISOString().slice(0, 10), restritos }, null, 2) + "\n",
)
console.log(`${restritos.length} de ${classes.length} cClassTrib dependem do NCM: ${restritos.join(" ")}`)
