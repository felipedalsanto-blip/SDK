import { classificador, ehCompra, ehVenda, type RegraCfop } from "./cfop"
import { fmtCnpj, fmtMes, moeda, pctTexto, versoesValidas, type Achado, type Coluna, type Criticidade, type Tabela } from "./analise"
import type { Doc, Leitura } from "./tipos"

/*
 * Cruzamentos entre o EFD ICMS/IPI e o EFD Contribuições, nota a nota pela chave de acesso:
 * documentos que estão em um e não no outro, valores diferentes, crédito de PIS/COFINS não apropriado
 * ou possivelmente indevido, ativo e devolução sem crédito, ICMS creditado com CST sem tributação e a
 * conciliação mensal do faturamento. As estimativas de crédito são indicativas, para priorizar a
 * revisão; o crédito efetivo depende do enquadramento de cada item.
 */

const CANCELADO = new Set(["02", "03", "04", "05"])
const r2 = (v: number) => Math.round(v * 100) / 100
const pct = (a: number, b: number) => (b > 0 ? a / b : 0)
const SEM_CREDITO = /^(7[0-5]|98|99|49)$/
const COM_CREDITO = /^(5[0-6]|6[0-6])$/
/** Compras para revenda, industrialização, ST de revenda/industrialização, energia e serviços de transporte. */
const compraComCredito = (cfop: string) => /^[123](10[12]|11[6-9]|12[0-4]|40[13]|25[1-7]|35[0-6]|93[23])$/.test(cfop)
const usoConsumo = (cfop: string) => /^[12](556|407)$/.test(cfop)
const ativo = (cfop: string) => /^[123](551|406)$/.test(cfop)
const devolucaoVenda = (cfop: string) => /^[12](20[12]|41[01])$/.test(cfop)
/** CST de ICMS sem tributação na operação (isenta, não tributada, suspensa, ST cobrada antes). */
const cstSemIcms = (cst: string) => /^\d(40|41|50|60)$/.test(cst)

const COLS: Record<string, Coluna> = {
  doc: { id: "doc", nome: "Chave de acesso", tipo: "texto" },
  data: { id: "data", nome: "Data", tipo: "texto" },
  periodo: { id: "periodo", nome: "Competência", tipo: "texto" },
  estab: { id: "estab", nome: "Estabelecimento", tipo: "texto" },
  part: { id: "part", nome: "Fornecedor / cliente", tipo: "texto" },
  partDoc: { id: "partDoc", nome: "CNPJ/CPF", tipo: "texto" },
  cfop: { id: "cfop", nome: "CFOP", tipo: "texto" },
  reforma: { id: "reforma", nome: "Reforma", tipo: "texto" },
  vlDoc: { id: "vlDoc", nome: "Total do documento", tipo: "moeda" },
  icms: { id: "icms", nome: "ICMS", tipo: "moeda" },
  cstPis: { id: "cstPis", nome: "CST PIS/COFINS (Contribuições)", tipo: "texto" },
  credito: { id: "credito", nome: "Crédito estimado (PIS+COFINS)", tipo: "moeda" },
}

export function conciliar(leitura: Leitura, regra: RegraCfop): Achado[] {
  const ehReforma = classificador(regra)
  const validos = versoesValidas(leitura.arquivos)
  const docs = leitura.docs.filter((d) => validos.has(d.arquivo) && !CANCELADO.has(d.sit))
  const fiscais = leitura.arquivos.filter((a) => validos.has(a.indice) && a.tipo === "fiscal")
  const contribs = leitura.arquivos.filter((a) => validos.has(a.indice) && a.tipo === "contribuicoes")
  if (!fiscais.length || !contribs.length) {
    return [
      {
        id: "5.0", etapa: "5", item: "5", titulo: "Cruzamentos EFD ICMS/IPI × EFD Contribuições", criticidade: "info",
        resumo: "Para cruzar, carregue os dois EFDs das mesmas competências (ICMS/IPI dos estabelecimentos e o Contribuições da empresa).",
      },
    ]
  }
  const naoCumulativo = contribs.some((a) => a.incidencia === "1" || a.incidencia === "3")
  const raiz = (c: string) => c.slice(0, 8)
  const contribNoMes = new Set(contribs.map((a) => `${raiz(a.cnpj)}|${a.periodo}`))
  const fiscalNoMes = new Set(fiscais.map((a) => `${a.cnpj}|${a.periodo}`))

  const chave = (d: Doc) => (d.chave && d.chave.length === 44 ? d.chave : "")
  const fiscal = new Map<string, Doc>()
  const contrib = new Map<string, Doc>()
  for (const d of docs) {
    const k = chave(d)
    if (!k) continue
    ;(d.fonte === "fiscal" ? fiscal : contrib).set(k, d)
  }

  const base = (d: Doc) => Math.max(0, d.vlMerc - d.desc - d.icms)
  const credito = (d: Doc) => (naoCumulativo ? base(d) * 0.0925 : 0)
  const linha = (d: Doc, outro?: Doc, extra: Record<string, string | number> = {}) => ({
    doc: d.chave, data: d.data, periodo: fmtMes(d.periodo), estab: fmtCnpj(d.estab), part: d.partNome || d.part, partDoc: fmtCnpj(d.partDoc),
    cfop: d.cfops.join(", "), reforma: d.cfops.some(ehReforma) ? "sim" : "não", vlDoc: r2(d.vlDoc), icms: r2(d.icms),
    cstPis: outro ? [...new Set([...outro.cstPis])].join(", ") || "—" : "ausente", ...extra,
  })
  const det = (cols: Coluna[], linhas: Record<string, string | number>[]): Tabela => ({ colunas: cols, linhas })
  const reformaDe = (ds: Doc[]) => ({ dentro: ds.filter((d) => d.cfops.some(ehReforma)).reduce((s, d) => s + d.vlDoc, 0), fora: ds.filter((d) => !d.cfops.some(ehReforma)).reduce((s, d) => s + d.vlDoc, 0) })
  const soma = (ds: Doc[], f: (d: Doc) => number = (d) => d.vlDoc) => ds.reduce((s, d) => s + f(d), 0)
  const porFornecedor = (ds: Doc[], valor: (d: Doc) => number) => {
    const m = new Map<string, { part: string; partDoc: string; docs: number; vlDoc: number; credito: number }>()
    for (const d of ds) {
      const x = m.get(d.partDoc) ?? { part: d.partNome || d.part, partDoc: fmtCnpj(d.partDoc), docs: 0, vlDoc: 0, credito: 0 }
      x.docs++
      x.vlDoc = r2(x.vlDoc + d.vlDoc)
      x.credito = r2(x.credito + valor(d))
      m.set(d.partDoc, x)
    }
    return det(
      [COLS.part, COLS.partDoc, { id: "docs", nome: "Documentos", tipo: "num" }, COLS.vlDoc, COLS.credito],
      [...m.values()].sort((a, b) => b.credito - a.credito || b.vlDoc - a.vlDoc),
    )
  }
  const compras = docs.filter((d) => d.fonte === "fiscal" && d.oper === "0" && d.cfops.some(ehCompra))
  const totalCompras = soma(compras)
  const porPeso = (r: number): Criticidade => (r > 0.05 ? "alta" : r > 0.01 ? "media" : r > 0 ? "baixa" : "ok")

  const achados: Achado[] = []

  // 5.1 Entradas com direito a crédito no Fiscal e ausentes no Contribuições
  const entradasAusentes = [...fiscal.values()].filter(
    (d) => d.oper === "0" && d.mod === "55" && d.cfops.some(compraComCredito) && contribNoMes.has(`${raiz(d.estab)}|${d.periodo}`) && !contrib.has(d.chave),
  )
  const credAusentes = soma(entradasAusentes, credito)
  achados.push({
    id: "5.1", etapa: "5", item: "5.1", titulo: "Compras com direito a crédito no EFD ICMS/IPI que não estão no EFD Contribuições",
    criticidade: porPeso(pct(soma(entradasAusentes), totalCompras)), valor: soma(entradasAusentes), representatividade: pct(soma(entradasAusentes), totalCompras),
    resumo: entradasAusentes.length
      ? `${entradasAusentes.length} nota(s) de compra para revenda, industrialização, energia ou frete (${moeda(soma(entradasAusentes))}) estão no Fiscal e não foram escrituradas no Contribuições.${naoCumulativo ? ` Crédito de PIS/COFINS potencial estimado: ${moeda(credAusentes)} (9,25% sobre mercadorias − desconto − ICMS).` : ""} Conferir se o item dá direito a crédito (monofásico e alíquota zero na aquisição não dão).`
      : "Toda compra com direito a crédito do Fiscal está no Contribuições.",
    tabela: entradasAusentes.length ? porFornecedor(entradasAusentes, credito) : undefined,
    detalhe: entradasAusentes.length ? det(Object.values(COLS), entradasAusentes.map((d) => linha(d, undefined, { credito: r2(credito(d)) }))) : undefined,
    comoResolver: "Revisar as notas pela ordem do crédito estimado. Sendo crédito válido, escriturar no EFD Contribuições (retificadora) ou apropriar como crédito extemporâneo, dentro do prazo de 5 anos.",
    fontes: ["l10637", "l10833", "l14592"],
    reforma: reformaDe(entradasAusentes),
  })

  // 5.2 Saídas de venda no Fiscal ausentes no Contribuições (receita fora da base)
  const saidasAusentes = [...fiscal.values()].filter(
    (d) => d.oper === "1" && d.mod === "55" && d.cfops.some(ehVenda) && contribNoMes.has(`${raiz(d.estab)}|${d.periodo}`) && !contrib.has(d.chave),
  )
  const vendas = docs.filter((d) => d.fonte === "fiscal" && d.oper === "1" && d.cfops.some(ehVenda))
  achados.push({
    id: "5.2", etapa: "5", item: "5.2", titulo: "Vendas no EFD ICMS/IPI que não estão no EFD Contribuições",
    criticidade: saidasAusentes.length ? (pct(soma(saidasAusentes), soma(vendas)) > 0.01 ? "alta" : "media") : "ok",
    valor: soma(saidasAusentes), representatividade: pct(soma(saidasAusentes), soma(vendas)),
    resumo: saidasAusentes.length
      ? `${saidasAusentes.length} nota(s) de venda (${moeda(soma(saidasAusentes))}, ${pctTexto(pct(soma(saidasAusentes), soma(vendas)))} das vendas) no Fiscal sem escrituração no Contribuições: receita que pode ter ficado fora da base de PIS/COFINS.`
      : "Toda venda do Fiscal está no Contribuições.",
    tabela: saidasAusentes.length ? porFornecedor(saidasAusentes, () => 0) : undefined,
    detalhe: saidasAusentes.length ? det(Object.values(COLS).filter((c) => c.id !== "credito"), saidasAusentes.map((d) => linha(d))) : undefined,
    comoResolver: "Confirmar se a receita foi oferecida por outro registro (consolidado, F100). Se não, retificar o EFD Contribuições e recolher a diferença.",
    fontes: ["l10637", "l10833"],
    reforma: reformaDe(saidasAusentes),
  })

  // 5.3 Notas do Contribuições que não estão no Fiscal do estabelecimento
  const soContrib = [...contrib.values()].filter((d) => d.mod === "55" && fiscalNoMes.has(`${d.estab}|${d.periodo}`) && !fiscal.has(d.chave))
  achados.push({
    id: "5.3", etapa: "5", item: "5.3", titulo: "Notas do EFD Contribuições que não estão no EFD ICMS/IPI",
    criticidade: soContrib.length ? "media" : "ok", valor: soma(soContrib),
    resumo: soContrib.length
      ? `${soContrib.length} nota(s), ${moeda(soma(soContrib))}, escrituradas no Contribuições e ausentes do Fiscal do mesmo estabelecimento e mês. Pode ser competência diferente, estabelecimento errado ou nota não escriturada no Fiscal.`
      : "Toda nota modelo 55 do Contribuições está no Fiscal do estabelecimento.",
    detalhe: soContrib.length ? det(Object.values(COLS).filter((c) => c.id !== "credito"), soContrib.map((d) => linha(d, d))) : undefined,
    comoResolver: "Conferir a data de entrada/saída e o estabelecimento; corrigir o EFD que estiver errado.",
    fontes: ["sped"],
    reforma: reformaDe(soContrib),
  })

  // 5.4 Mesma nota com valor diferente
  const divergentes = [...fiscal.values()].filter((d) => contrib.has(d.chave) && Math.abs(contrib.get(d.chave)!.vlDoc - d.vlDoc) > 1)
  achados.push({
    id: "5.4", etapa: "5", item: "5.4", titulo: "Mesma nota com valor diferente nos dois EFDs",
    criticidade: divergentes.length ? "media" : "ok",
    valor: divergentes.reduce((s, d) => s + Math.abs(contrib.get(d.chave)!.vlDoc - d.vlDoc), 0),
    resumo: divergentes.length
      ? `${divergentes.length} nota(s) com o total do documento diferente entre o Fiscal e o Contribuições; diferença somada de ${moeda(divergentes.reduce((s, d) => s + Math.abs(contrib.get(d.chave)!.vlDoc - d.vlDoc), 0))}.`
      : "As notas presentes nos dois EFDs têm o mesmo valor.",
    detalhe: divergentes.length
      ? det(
          [COLS.doc, COLS.data, COLS.estab, COLS.part, COLS.cfop, COLS.reforma, { id: "fiscal", nome: "Valor no Fiscal", tipo: "moeda" }, { id: "contrib", nome: "Valor no Contribuições", tipo: "moeda" }, { id: "dif", nome: "Diferença", tipo: "moeda" }],
          divergentes.map((d) => {
            const c = contrib.get(d.chave)!
            return { doc: d.chave, data: d.data, estab: fmtCnpj(d.estab), part: d.partNome, cfop: d.cfops.join(", "), reforma: d.cfops.some(ehReforma) ? "sim" : "não", fiscal: r2(d.vlDoc), contrib: r2(c.vlDoc), dif: r2(c.vlDoc - d.vlDoc) }
          }),
        )
      : undefined,
    comoResolver: "Conferir o XML: o EFD que estiver diferente da nota deve ser retificado.",
    fontes: ["sped"],
  })

  // 5.5 Crédito de PIS/COFINS não apropriado: compra com crédito de ICMS, mas CST sem crédito no Contribuições
  const naoApropriado = [...fiscal.values()].filter((d) => {
    const c = contrib.get(d.chave)
    return (
      c && d.oper === "0" && d.cfops.some(compraComCredito) && !d.cfops.some(usoConsumo) && d.icms > 0 &&
      c.cstPis.length > 0 && c.cstPis.every((x) => SEM_CREDITO.test(x)) && c.pis < 0.01
    )
  })
  const credNaoAprop = soma(naoApropriado, credito)
  achados.push({
    id: "5.5", etapa: "5", item: "5.5", titulo: "Crédito de PIS/COFINS possivelmente não apropriado",
    criticidade: naoApropriado.length ? (pct(soma(naoApropriado), totalCompras) > 0.01 ? "alta" : "media") : "ok",
    valor: credNaoAprop, representatividade: pct(soma(naoApropriado), totalCompras),
    resumo: naoApropriado.length
      ? `${naoApropriado.length} compra(s) para revenda ou industrialização com crédito de ICMS no Fiscal, mas escrituradas sem crédito no Contribuições (CST 70 a 75, 98, 99 ou 49). ${naoCumulativo ? `Crédito potencial estimado: ${moeda(credNaoAprop)}.` : ""} Excluir os itens monofásicos, com alíquota zero ou suspensão na aquisição.`
      : "Nenhuma compra com crédito de ICMS escriturada sem crédito de PIS/COFINS.",
    tabela: naoApropriado.length ? porFornecedor(naoApropriado, credito) : undefined,
    detalhe: naoApropriado.length ? det(Object.values(COLS), naoApropriado.map((d) => linha(d, contrib.get(d.chave), { credito: r2(credito(d)) }))) : undefined,
    comoResolver: "Revisar os fornecedores de maior crédito estimado: confirmado o direito, retificar o EFD Contribuições (CST 50 a 56) ou apropriar como extemporâneo.",
    fontes: ["l10637", "l10833", "l14592"],
    reforma: reformaDe(naoApropriado),
  })

  // 5.6 Crédito possivelmente indevido: crédito de PIS/COFINS em nota de uso e consumo
  const indevido = [...contrib.values()].filter((c) => {
    const f = fiscal.get(c.chave)
    return f && c.oper === "0" && f.cfops.length > 0 && f.cfops.every(usoConsumo) && (c.pis > 0 || c.cstPis.some((x) => COM_CREDITO.test(x)))
  })
  achados.push({
    id: "5.6", etapa: "5", item: "5.6", titulo: "Crédito de PIS/COFINS em notas de uso e consumo",
    criticidade: indevido.length ? "media" : "ok", valor: soma(indevido, (c) => c.pis + c.cofins),
    resumo: indevido.length
      ? `${indevido.length} nota(s) que o Fiscal classifica como uso e consumo (CFOP x556/x407) com crédito no Contribuições (${moeda(soma(indevido, (c) => c.pis + c.cofins))} de PIS+COFINS). Uso e consumo só gera crédito se o bem for insumo da produção.`
      : "Nenhum crédito de PIS/COFINS em notas de uso e consumo.",
    tabela: indevido.length ? porFornecedor(indevido, (c) => c.pis + c.cofins) : undefined,
    detalhe: indevido.length ? det(Object.values(COLS), indevido.map((c) => linha(fiscal.get(c.chave)!, c, { credito: r2(c.pis + c.cofins) }))) : undefined,
    comoResolver: "Confirmar a essencialidade e relevância do bem (conceito de insumo). Sem enquadramento, estornar o crédito.",
    fontes: ["l10637", "l10833"],
    reforma: reformaDe(indevido.map((c) => fiscal.get(c.chave)!)),
  })

  // 5.7 Ativo imobilizado sem crédito
  const comF120 = new Set(leitura.f100.filter((f) => validos.has(f.arquivo) && (f.reg === "F120" || f.reg === "F130")).map((f) => f.periodo))
  const ativoSem = [...fiscal.values()].filter((d) => d.oper === "0" && d.cfops.some(ativo) && !(contrib.get(d.chave)?.pis ?? 0))
  const ativoSemNada = ativoSem.filter((d) => !comF120.has(d.periodo))
  achados.push({
    id: "5.7", etapa: "5", item: "5.7", titulo: "Compra de ativo imobilizado sem crédito de PIS/COFINS",
    criticidade: ativoSemNada.length ? "media" : ativoSem.length ? "baixa" : "ok", valor: soma(ativoSem),
    resumo: ativoSem.length
      ? `${ativoSem.length} compra(s) de ativo (CFOP x551/x406), ${moeda(soma(ativoSem))}, sem crédito no documento do Contribuições. ${ativoSemNada.length ? `${ativoSemNada.length} delas em meses sem F120/F130 (crédito por depreciação ou aquisição).` : "Nos meses delas há F120/F130: o crédito pode estar sendo tomado por depreciação."}`
      : "Toda compra de ativo tem crédito no documento.",
    tabela: ativoSem.length ? porFornecedor(ativoSem, credito) : undefined,
    detalhe: ativoSem.length ? det(Object.values(COLS), ativoSem.map((d) => linha(d, contrib.get(d.chave), { credito: r2(credito(d)) }))) : undefined,
    comoResolver: "Conferir se o bem é usado na produção ou na prestação de serviço: se sim, apropriar o crédito (aquisição ou depreciação, F120/F130).",
    fontes: ["l10637", "l10833"],
    reforma: reformaDe(ativoSem),
  })

  // 5.8 Devolução de venda sem crédito/dedução
  const devSem = [...fiscal.values()].filter((d) => d.oper === "0" && d.cfops.some(devolucaoVenda) && !(contrib.get(d.chave)?.pis ?? 0) && contribNoMes.has(`${raiz(d.estab)}|${d.periodo}`))
  achados.push({
    id: "5.8", etapa: "5", item: "5.8", titulo: "Devolução de venda sem crédito de PIS/COFINS",
    criticidade: devSem.length ? "media" : "ok", valor: soma(devSem),
    resumo: devSem.length
      ? `${devSem.length} devolução(ões) de venda (${moeda(soma(devSem))}) sem crédito no Contribuições. A devolução de venda tributada gera crédito (natureza 12) ou reduz a receita.${naoCumulativo ? ` Estimativa: ${moeda(soma(devSem, credito))}.` : ""}`
      : "Toda devolução de venda tem crédito no Contribuições.",
    detalhe: devSem.length ? det(Object.values(COLS), devSem.map((d) => linha(d, contrib.get(d.chave), { credito: r2(credito(d)) }))) : undefined,
    comoResolver: "Confirmar se a venda original foi tributada; se sim, escriturar a devolução com crédito (CST 50, natureza 12).",
    fontes: ["l10637", "l10833"],
    reforma: reformaDe(devSem),
  })

  // 5.9 ICMS creditado com CST sem tributação (dentro do Fiscal)
  const icmsCstErrado = [...fiscal.values()].filter((d) => d.oper === "0" && d.c190.some((a) => cstSemIcms(a.cst) && a.icms > 0.01))
  achados.push({
    id: "5.9", etapa: "5", item: "5.9", titulo: "ICMS creditado com CST de operação não tributada",
    criticidade: icmsCstErrado.length ? "media" : "ok", valor: icmsCstErrado.reduce((s, d) => s + d.c190.filter((a) => cstSemIcms(a.cst)).reduce((t, a) => t + a.icms, 0), 0),
    resumo: icmsCstErrado.length
      ? `${icmsCstErrado.length} entrada(s) com crédito de ICMS em CST de isenta, não tributada, suspensão ou ST já cobrada (x40, x41, x50, x60): o crédito pode ser indevido.`
      : "Nenhum crédito de ICMS com CST de operação não tributada.",
    detalhe: icmsCstErrado.length
      ? det([...Object.values(COLS).filter((c) => !["cstPis", "credito"].includes(c.id)), { id: "csts", nome: "CST ICMS (C190)", tipo: "texto" }],
          icmsCstErrado.map((d) => ({ ...linha(d), csts: d.c190.map((a) => `${a.cst} ${moeda(a.icms)}`).join(" · ") })))
      : undefined,
    comoResolver: "Conferir o CST no XML do fornecedor; sem destaque de ICMS na nota, estornar o crédito.",
    fontes: ["lc87"],
    reforma: reformaDe(icmsCstErrado),
  })

  // 5.10 Conciliação mensal do faturamento: vendas do Fiscal × receita escriturada no Contribuições
  const meses = [...new Set(docs.map((d) => d.periodo))].sort()
  const linhasConc = meses.map((m) => {
    const vf = docs.filter((d) => d.fonte === "fiscal" && d.periodo === m && d.oper === "1" && d.cfops.some(ehVenda)).reduce((s, d) => s + d.vlDoc, 0)
    const vc = docs.filter((d) => d.fonte === "contribuicoes" && d.periodo === m && d.oper === "1" && (d.cfops.some(ehVenda) || d.reg === "A100")).reduce((s, d) => s + d.vlDoc, 0)
    return { periodo: fmtMes(m), fiscal: r2(vf), contrib: r2(vc), dif: r2(vc - vf), difPct: vf ? (vc - vf) / vf : 0 }
  })
  const fora = linhasConc.filter((x) => Math.abs(x.difPct) > 0.01)
  achados.push({
    id: "5.10", etapa: "5", item: "5.10", titulo: "Conciliação mensal: vendas no EFD ICMS/IPI × no EFD Contribuições",
    criticidade: fora.length ? "media" : "ok",
    resumo: fora.length
      ? `${fora.length} mês(es) com diferença acima de 1% entre as vendas (CFOPs de venda) dos dois EFDs. O Contribuições inclui também serviços (A100); diferenças grandes indicam notas fora de um dos arquivos.`
      : "As vendas dos dois EFDs conferem mês a mês (diferença até 1%).",
    tabela: {
      colunas: [{ id: "periodo", nome: "Competência", tipo: "texto" }, { id: "fiscal", nome: "Vendas no Fiscal", tipo: "moeda" }, { id: "contrib", nome: "Vendas no Contribuições", tipo: "moeda" }, { id: "dif", nome: "Diferença", tipo: "moeda" }, { id: "difPct", nome: "Diferença %", tipo: "pct" }],
      linhas: linhasConc,
    },
    fontes: ["sped"],
  })

  return achados
}
