import "server-only"

/**
 * Lê o CSV do `exportar` (UTF-8 com BOM, `;`, aspas, decimal com vírgula) em stream, linha a
 * linha, sem carregar o arquivo inteiro na memória. Cada registro vem como objeto pelo cabeçalho.
 */
export async function* registrosCsv(stream: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, string>> {
  const decodificador = new TextDecoder("utf-8")
  const leitor = stream.getReader()
  let cabecalho: string[] | null = null
  let campo = ""
  let campos: string[] = []
  let emAspas = false
  let primeiro = true

  const fechar = () => {
    campos.push(campo)
    campo = ""
    const linha = campos
    campos = []
    if (!cabecalho) {
      cabecalho = linha
      return null
    }
    if (linha.length === 1 && linha[0] === "") return null
    const registro: Record<string, string> = {}
    for (let i = 0; i < cabecalho.length; i++) registro[cabecalho[i]] = linha[i] ?? ""
    return registro
  }

  for (;;) {
    const { done, value } = await leitor.read()
    let texto = done ? decodificador.decode() : decodificador.decode(value, { stream: true })
    if (primeiro && texto) {
      if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1)
      primeiro = false
    }
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i]
      if (emAspas) {
        if (c === '"') {
          if (texto[i + 1] === '"') {
            campo += '"'
            i++
          } else emAspas = false
        } else campo += c
      } else if (c === '"') emAspas = true
      else if (c === ";") {
        campos.push(campo)
        campo = ""
      } else if (c === "\n") {
        const r = fechar()
        if (r) yield r
      } else if (c !== "\r") campo += c
    }
    if (done) break
  }
  if (campo !== "" || campos.length > 0) {
    const r = fechar()
    if (r) yield r
  }
}

/** "1.234,56" → 1234.56; vazio → 0. */
export function numeroCsv(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
