// Atualiza lib/cclasstrib.json a partir da tabela oficial de CST e cClassTrib do IBS/CBS
// (Portal DF-e da SVRS). Rode quando a tabela mudar: `npm run cclasstrib:atualizar`.
import { writeFileSync } from "node:fs"

const FONTE = "https://dfe-portal.svrs.rs.gov.br/DFE/ClassificacaoTributaria"

const html = await (await fetch(FONTE)).text()
const marca = "var dadosOriginais = "
const inicio = html.indexOf(marca)
if (inicio < 0) throw new Error("Formato da página mudou: não achei dadosOriginais.")

// O JSON vem embutido no script da página; lê só o array, até o colchete que o fecha.
let profundidade = 0
let fim = inicio + marca.length
let emTexto = false
for (; fim < html.length; fim++) {
  const c = html[fim]
  if (emTexto) {
    if (c === "\\") fim++
    else if (c === '"') emTexto = false
  } else if (c === '"') emTexto = true
  else if (c === "[" || c === "{") profundidade++
  else if (c === "]" || c === "}") {
    profundidade--
    if (profundidade === 0) break
  }
}
const dados = JSON.parse(html.slice(inicio + marca.length, fim + 1))

const cst = {}
const cclass = {}
for (const c of dados) {
  cst[c.Cst] = {
    nome: c.NomeCst,
    exigeTributo: c.IndExigeTrib,
    reducaoAliquota: c.IndReducaoAliq,
    reducaoBase: c.IndReducaoBc,
    diferimento: c.IndDiferimento,
    monofasica: c.IndMonofasica,
  }
  for (const k of c.ClassificacoesTributarias) {
    cclass[k.CodClassTrib] = {
      cst: k.Cst,
      nome: k.NomeReduzido || k.NomeClassTrib,
      reducaoIbs: k.PercRedIbs,
      reducaoCbs: k.PercRedCbs,
      fimVigencia: k.DthFimVig,
    }
  }
}

writeFileSync(
  new URL("../lib/cclasstrib.json", import.meta.url),
  JSON.stringify({ fonte: FONTE, obtidoEm: new Date().toISOString().slice(0, 10), cst, cclass }, null, 1) + "\n",
)
console.log(`${Object.keys(cst).length} CST e ${Object.keys(cclass).length} cClassTrib gravados em lib/cclasstrib.json`)
