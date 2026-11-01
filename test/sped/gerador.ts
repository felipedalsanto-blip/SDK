// Gera EFDs sintéticos (ICMS/IPI e Contribuições) com cada situação que a auditoria precisa achar.
// Os campos seguem os Guias Práticos; CNPJs, nomes e valores são fictícios.

const reg = (...c: (string | number)[]) => `|${c.map((x) => (typeof x === "number" ? x.toFixed(2).replace(".", ",") : x)).join("|")}|`
const dia = (p: string, d: string) => `${d}${p.slice(5, 7)}${p.slice(0, 4)}`
const fimMes = (p: string) => dia(p, String(new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).getDate()).padStart(2, "0"))

export const MATRIZ = "11222333000181"
export const FILIAL = "11222333000262"
const chave = (n: number) => `352601${MATRIZ}55001${String(n).padStart(9, "0")}1${String(n).padStart(8, "0")}`.slice(0, 44).padEnd(44, "0")

const participantes = [
  reg("0150", "F001", "FORNECEDOR A LTDA", "1058", "22333444000155", "", "123456", "3550308", "", "RUA A", "1", "", "CENTRO"),
  reg("0150", "SN01", "FORNECEDOR SIMPLES ME", "1058", "44555666000177", "", "654321", "4106902", "", "RUA B", "2", "", "CENTRO"),
  reg("0150", "PR01", "PRODUTOR RURAL JOAO", "1058", "", "12345678909", "", "4106902", "", "SITIO", "0", "", "RURAL"),
  reg("0150", "EX01", "EXPORTER INC", "0249", "", "", "", "9999999", "", "MAIN ST", "1", "", ""),
  reg("0150", "CF01", "CONSUMIDOR FINAL BA", "1058", "", "98765432100", "", "2927408", "", "RUA C", "3", "", "CENTRO"),
  reg("0150", "AM01", "CLIENTE MANAUS LTDA", "1058", "55666777000188", "", "999", "1302603", "112233445", "AV D", "4", "", "DISTRITO"),
  reg("0150", "C002", "CLIENTE ATACADO LTDA", "1058", "33444555000166", "", "777", "3550308", "", "RUA E", "5", "", "CENTRO"),
]
const produtos = [
  reg("0200", "P1", "PARAFUSO SEXTAVADO M8", "", "", "UN", "00", "73181500", "", "73", "", "18,00", ""),
  reg("0200", "P2", "MATERIAL DIVERSO", "", "", "UN", "07", "99999999", "", "99", "", "18,00", ""),
  reg("0200", "P3", "MEDICAMENTO GENERICO 500MG", "", "", "UN", "00", "30049099", "", "30", "", "18,00", ""),
  reg("0200", "P4", "MAQUINA INDUSTRIAL", "", "", "UN", "00", "84798999", "", "84", "", "18,00", ""),
]

export function efdFiscal(cnpj: string, periodo: string, opts: { retificadora?: boolean; ie?: string } = {}) {
  const ini = dia(periodo, "01")
  const fim = fimMes(periodo)
  const l = [
    reg("0000", "019", opts.retificadora ? "1" : "0", ini, fim, "EMPRESA EXEMPLO LTDA", cnpj, "", "SP", opts.ie ?? "111222333444", "3550308", "", "", "A", "0"),
    reg("0001", "0"),
    ...participantes,
    ...produtos,
    reg("C001", "0"),
    // Compra com itens: parafuso tributado (ICMS 18%, IPI 10%) e item genérico
    reg("C100", "0", "1", "F001", "55", "00", "1", "1001", chave(1001), dia(periodo, "05"), dia(periodo, "05"), 2200, "1", 0, 0, 2000, "0", 0, 0, 0, 2000, 360, 0, 0, 200, 0, 0, 0, 0),
    reg("C170", "1", "P1", "", "100", "UN", 1500, 0, "0", "000", "1102", "", 1500, 18, 270, 0, 0, 0, "0", "00", "", 1500, 10, 150, "50", 1500, 1.65, "", "", 24.75, "50", 1500, 7.6, "", "", 114, "", ""),
    reg("C170", "2", "P2", "", "10", "UN", 500, 0, "0", "000", "1102", "", 500, 18, 90, 0, 0, 0, "0", "00", "", 500, 10, 50, "50", 500, 1.65, "", "", 8.25, "50", 500, 7.6, "", "", 38, "", ""),
    reg("C190", "000", "1102", 18, 2200, 2000, 360, 0, 0, 0, 200, ""),
    // Compra de fornecedor do Simples com crédito de ICMS (CSOSN 101)
    reg("C100", "0", "1", "SN01", "55", "00", "1", "1002", chave(1002), dia(periodo, "06"), dia(periodo, "06"), 1000, "1", 0, 0, 1000, "0", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    reg("C170", "1", "P1", "", "50", "UN", 1000, 0, "0", "101", "1102", "", 0, 2.5, 25, 0, 0, 0, "0", "", "", 0, 0, 0, "50", 1000, 1.65, "", "", 16.5, "50", 1000, 7.6, "", "", 76, "", ""),
    reg("C190", "101", "1102", 2.5, 1000, 0, 25, 0, 0, 0, 0, ""),
    // Entrada com nota própria (produtor rural), sem itens
    reg("C100", "0", "0", "PR01", "55", "00", "2", "501", chave(501), dia(periodo, "08"), dia(periodo, "08"), 3000, "1", 0, 0, 3000, "9", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    reg("C190", "090", "1102", 0, 3000, 0, 0, 0, 0, 0, 0, ""),
    // Importação de máquina (CFOP 3102) com IPI de 12%
    reg("C100", "0", "0", "EX01", "55", "00", "2", "502", chave(502), dia(periodo, "10"), dia(periodo, "10"), 11200, "1", 0, 0, 10000, "9", 0, 0, 0, 10000, 1800, 0, 0, 1200, 0, 0, 0, 0),
    reg("C170", "1", "P4", "", "1", "UN", 10000, 0, "0", "100", "3102", "", 10000, 18, 1800, 0, 0, 0, "0", "00", "", 10000, 12, 1200, "50", 10000, 2.1, "", "", 210, "50", 10000, 9.65, "", "", 965, "", ""),
    reg("C190", "100", "3102", 18, 11200, 10000, 1800, 0, 0, 0, 1200, ""),
    // Venda própria a consumidor final em outra UF, com DIFAL (C101)
    reg("C100", "1", "0", "CF01", "55", "00", "1", "9001", chave(9001), dia(periodo, "12"), dia(periodo, "12"), 5000, "0", 0, 0, 5000, "0", 0, 0, 0, 5000, 350, 0, 0, 0, 0, 0, 0, 0),
    reg("C101", 50, 600, 0),
    reg("C190", "000", "6108", 7, 5000, 5000, 350, 0, 0, 0, 0, ""),
    // Venda para Manaus (ZFM)
    reg("C100", "1", "0", "AM01", "55", "00", "1", "9002", chave(9002), dia(periodo, "14"), dia(periodo, "14"), 8000, "0", 0, 0, 8000, "0", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    reg("C190", "040", "6109", 0, 8000, 0, 0, 0, 0, 0, 0, ""),
    // Venda comum
    reg("C100", "1", "0", "C002", "55", "00", "1", "9003", chave(9003), dia(periodo, "15"), dia(periodo, "15"), 40000, "0", 0, 0, 40000, "0", 0, 0, 0, 40000, 4800, 0, 0, 0, 0, 0, 0, 0),
    reg("C190", "000", "5102", 12, 40000, 40000, 4800, 0, 0, 0, 0, ""),
    reg("C990", "20"),
    reg("E001", "0"),
    reg("E100", ini, fim),
    reg("E110", 5150, 0, 0, 0, 2185, 300, 300, 0, 0, 2665, 0, 2665, 0, 0),
    reg("E111", "SP020099", "CREDITO PRESUMIDO ART. 11 ANEXO III RICMS", 300),
    reg("E300", "BA", ini, fim),
    reg("E310", "1", 0, 600, 0, 0, 0, 0, 0, 600, 0, 0),
    reg("E500", "0", ini, fim),
    reg("E520", 0, 0, 1400, 0, 0, 1400, 0),
    reg("E990", "9"),
    reg("9999", "40"),
  ]
  return l.join("\r\n")
}

export function efdContribuicoes(periodo: string, opts: { retificadora?: boolean; filialConsolidada?: boolean; regimeCaixa?: boolean } = {}) {
  const ini = dia(periodo, "01")
  const fim = fimMes(periodo)
  const l = [
    reg("0000", "006", opts.retificadora ? "1" : "0", "", "", ini, fim, "EMPRESA EXEMPLO LTDA", MATRIZ, "SP", "3550308", "", "00", "0"),
    reg("0001", "0"),
    reg("0110", "1", "1", "1", opts.regimeCaixa ? "1" : ""),
    reg("0140", "", "EMPRESA EXEMPLO LTDA", MATRIZ, "SP", "111222333444", "3550308", "", ""),
    ...participantes,
    ...produtos,
    reg("0140", "", "EMPRESA EXEMPLO FILIAL", FILIAL, "SP", "555666777888", "3550308", "", ""),
    reg("C001", "0"),
    reg("C010", MATRIZ, "2"),
    // Venda com itens: monofásico (CST 04), tributado 9,25% e tributado fora do padrão
    reg("C100", "1", "0", "C002", "55", "00", "1", "9003", chave(9003), dia(periodo, "15"), dia(periodo, "15"), 40000, "0", 0, 0, 40000, "0", 0, 0, 0, 40000, 4800, 0, 0, 0, 1650, 7600, 0, 0),
    reg("C170", "1", "P3", "", "100", "UN", 10000, 0, "0", "000", "5102", "", 10000, 12, 1200, 0, 0, 0, "0", "", "", 0, 0, 0, "04", 0, 0, "", "", 0, "04", 0, 0, "", "", 0, "", ""),
    reg("C170", "2", "P1", "", "1000", "UN", 25000, 0, "0", "000", "5102", "", 25000, 12, 3000, 0, 0, 0, "0", "", "", 0, 0, 0, "01", 25000, 1.65, "", "", 412.5, "01", 25000, 7.6, "", "", 1900, "", ""),
    reg("C170", "3", "P1", "", "200", "UN", 5000, 0, "0", "000", "5102", "", 5000, 12, 600, 0, 0, 0, "0", "", "", 0, 0, 0, "01", 5000, 0.65, "", "", 32.5, "01", 5000, 3, "", "", 150, "", ""),
    // Venda a consumidor com NFC-e (modelo 65) e analítico C175
    reg("C100", "1", "0", "", "65", "00", "1", "7001", chave(7001), dia(periodo, "20"), dia(periodo, "20"), 1200, "0", 0, 0, 1200, "9", 0, 0, 0, 0, 0, 0, 0, 0, 19.8, 91.2, 0, 0),
    reg("C175", "5102", 1200, 0, "01", 1200, 1.65, "", "", 19.8, "01", 1200, 7.6, "", "", 91.2, "", ""),
    ...(opts.filialConsolidada
      ? [reg("C010", FILIAL, "1"), reg("C180", "55", dia(periodo, "01"), fim, "P1", "73181500", "", 3000)]
      : [reg("C010", FILIAL, "2")]),
    reg("C990", "12"),
    reg("F001", "0"),
    reg("F010", MATRIZ),
    reg("F100", "1", "", "", dia(periodo, "28"), 2000, "06", 2000, 0, 0, "06", 2000, 0, 0, "", "", "", "", "JUROS RECEBIDOS DE APLICACAO FINANCEIRA"),
    reg("F100", "0", "F001", "", dia(periodo, "28"), 6000, "50", 6000, 1.65, 99, "50", 6000, 7.6, 456, "05", "0", "", "", "ALUGUEL DO GALPAO"),
    reg("F120", "09", "01", "0", "1", 4000, 0, "50", 4000, 1.65, 66, "50", 4000, 7.6, 304, "", "", "DEPRECIACAO MAQUINAS"),
    ...(opts.regimeCaixa ? [reg("F500", 3000, "01", 0, 3000, 0.65, 19.5, "01", 0, 3000, 3, 90, "55", "5102", "", "")] : []),
    reg("F990", "6"),
    reg("M001", "0"),
    reg("M100", "101", "0", 26500, 1.65, "", "", 437.25, 50, 30, 0, 457.25, "0", 457.25, 0),
    reg("M110", "1", 50, "01", "", "AJUSTE CREDITO EXTEMPORANEO", dia(periodo, "01")),
    reg("M110", "0", 30, "06", "", "ESTORNO CREDITO PERDA ESTOQUE", dia(periodo, "01")),
    reg("M200", 464.3, 457.25, 0, 7.05, 0, 0, 7.05, 0, 0, 0, 0, 7.05),
    reg("M210", "01", 31200, 31200, 0, 0, 31200, 1.65, "", "", 464.3, 10, 0, 0, 0, 474.3),
    reg("M220", "1", 10, "01", "", "AJUSTE DE DEBITO DIFERENCA", dia(periodo, "01")),
    reg("M500", "101", "0", 26500, 7.6, "", "", 2014, 0, 0, 0, 2014, "0", 2014, 0),
    reg("M600", 2141.2, 2014, 0, 127.2, 0, 0, 127.2, 0, 0, 0, 0, 127.2),
    reg("M610", "01", 31200, 31200, 0, 0, 31200, 7.6, "", "", 2141.2, 0, 0, 0, 0, 2141.2),
    reg("M990", "10"),
    reg("1001", "0"),
    reg("1100", periodo.replace("-", "").slice(4, 6) + periodo.slice(0, 4), "01", "", "101", 437.25, 0, 437.25, 0, 0, 0, 437.25, 437.25, 0, 0, 0, 0, 0),
    reg("1990", "3"),
    reg("9999", "60"),
  ]
  return l.join("\r\n")
}

/** O conjunto completo usado nos testes e na demonstração local. */
export function cenario() {
  return [
    { nome: "EFD_CONTRIB_2026-01.txt", texto: efdContribuicoes("2026-01") },
    { nome: "EFD_CONTRIB_2026-02.txt", texto: efdContribuicoes("2026-02", { filialConsolidada: true }) },
    { nome: "EFD_CONTRIB_2026-03.txt", texto: efdContribuicoes("2026-03", { regimeCaixa: true }) },
    { nome: "EFD_CONTRIB_2026-03_RETIF.txt", texto: efdContribuicoes("2026-03", { retificadora: true }) },
    { nome: "EFD_FISCAL_MATRIZ_2026-01.txt", texto: efdFiscal(MATRIZ, "2026-01") },
    { nome: "EFD_FISCAL_MATRIZ_2026-01_COPIA.txt", texto: efdFiscal(MATRIZ, "2026-01") },
    { nome: "EFD_FISCAL_MATRIZ_2026-02.txt", texto: efdFiscal(MATRIZ, "2026-02") },
    { nome: "EFD_FISCAL_MATRIZ_2026-03.txt", texto: efdFiscal(MATRIZ, "2026-03") },
    { nome: "EFD_FISCAL_FILIAL_2026-01.txt", texto: efdFiscal(FILIAL, "2026-01", { ie: "555666777888" }) },
    { nome: "EFD_FISCAL_FILIAL_2026-03.txt", texto: efdFiscal(FILIAL, "2026-03", { ie: "555666777888" }) },
  ]
}
