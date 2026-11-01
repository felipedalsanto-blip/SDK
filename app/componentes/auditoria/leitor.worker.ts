/// <reference lib="webworker" />
// Lê os EFDs fora da tela (Web Worker), em pedaços: arquivos de centenas de MB não travam o navegador.
// SPED é ISO-8859-1 (windows-1252 no TextDecoder). Nada sai do computador de quem usa o painel.
import { LeitorEfd, novaLeitura } from "@/lib/sped/leitor"
import type { GrupoItem, Leitura } from "@/lib/sped/tipos"

type Pedido = { arquivos: File[] }

self.onmessage = async (ev: MessageEvent<Pedido>) => {
  const { arquivos } = ev.data
  const leitura = novaLeitura()
  const grupos = new Map<string, GrupoItem>()
  const cfops = new Map<string, Leitura["porCfop"][number]>()
  const total = arquivos.reduce((s, a) => s + a.size, 0)
  let lidos = 0
  for (const [i, arquivo] of arquivos.entries()) {
    const leitor = new LeitorEfd(leitura, i, arquivo.name, arquivo.size, grupos, cfops)
    const decodificador = new TextDecoder("windows-1252")
    const leitorStream = arquivo.stream().getReader()
    let resto = ""
    let ultimoAviso = 0
    for (;;) {
      const { done, value } = await leitorStream.read()
      if (done) break
      lidos += value.byteLength
      const texto = resto + decodificador.decode(value, { stream: true })
      const linhas = texto.split(/\r?\n/)
      resto = linhas.pop() ?? ""
      for (const l of linhas) leitor.linha(l)
      if (lidos - ultimoAviso > 2_000_000) {
        ultimoAviso = lidos
        self.postMessage({ tipo: "progresso", lidos, total, arquivo: arquivo.name })
      }
    }
    if (resto) leitor.linha(resto)
    leitor.fim()
    self.postMessage({ tipo: "progresso", lidos, total, arquivo: arquivo.name })
  }
  leitura.itens = [...grupos.values()]
  leitura.porCfop = [...cfops.values()]
  self.postMessage({ tipo: "pronto", leitura })
}
