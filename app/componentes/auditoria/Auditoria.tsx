"use client"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import {
  CircleCheck,
  CircleX,
  ClipboardCopy,
  FileDown,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react"
import { analisar, fmtCnpj, fmtMes, moeda, pctTexto, rotuloCrit, type Achado, type Criticidade, type Resultado, type Tabela } from "@/lib/sped/analise"
import { REGRA_VAZIA, type RegraCfop } from "@/lib/sped/cfop"
import { conciliar } from "@/lib/sped/conciliacao"
import { aplicarMapeamento, CAMPOS, cruzar, lerCsv, sugerirMapeamento, type LinhaPricetax } from "@/lib/sped/cruzamento"
import { gerarDossie, nomeDossie } from "@/lib/sped/dossie"
import { FONTES } from "@/lib/sped/fontes"
import type { Leitura } from "@/lib/sped/tipos"
import { Bloco, Capitulo, Indicador } from "../capitulos/ui"

const CHAVE_REGRA = "pricetax-auditoria-regra-cfop"
const NOME_CRIT: Record<Criticidade, string> = { alta: "Alta", media: "Média", baixa: "Baixa", info: "Informativo", ok: "OK" }

type Progresso = { lidos: number; total: number; arquivo: string }

/** Auditoria de entrada: EFD ICMS/IPI e EFD Contribuições lidos no navegador, etapas 1 a 4 e o dossiê. */
export function Auditoria() {
  const [arquivos, setArquivos] = useState<File[]>([])
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [regra, setRegra] = useState<RegraCfop>(REGRA_VAZIA)
  const [planilha, setPlanilha] = useState<{ nome: string; linhas: Record<string, unknown>[]; cabecalho: string[] } | null>(null)
  const [mapa, setMapa] = useState<Partial<Record<keyof LinhaPricetax, string>>>({})
  const [etapa, setEtapa] = useState<"1" | "2" | "3" | "4" | "5">("1")
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_REGRA)
      if (salvo) setRegra({ ...REGRA_VAZIA, ...JSON.parse(salvo) })
    } catch {}
    return () => worker.current?.terminate()
  }, [])
  const mudarRegra = (r: RegraCfop) => {
    setRegra(r)
    try {
      localStorage.setItem(CHAVE_REGRA, JSON.stringify(r))
    } catch {}
  }

  const ler = (lista: File[]) => {
    if (!lista.length) return
    worker.current?.terminate()
    setErro(null)
    setLeitura(null)
    setProgresso({ lidos: 0, total: lista.reduce((s, a) => s + a.size, 0), arquivo: lista[0].name })
    const w = new Worker(new URL("./leitor.worker.ts", import.meta.url))
    worker.current = w
    w.onmessage = (ev) => {
      if (ev.data.tipo === "progresso") setProgresso(ev.data)
      if (ev.data.tipo === "pronto") {
        setLeitura(ev.data.leitura)
        setProgresso(null)
        w.terminate()
      }
    }
    w.onerror = (e) => {
      setErro(`Não foi possível ler os arquivos: ${e.message}`)
      setProgresso(null)
    }
    w.postMessage({ arquivos: lista })
  }
  const adicionar = (novos: FileList | null) => {
    if (!novos?.length) return
    const lista = [...arquivos, ...[...novos].filter((n) => !arquivos.some((a) => a.name === n.name && a.size === n.size))]
    setArquivos(lista)
    ler(lista)
  }

  const resultado = useMemo(() => (leitura ? analisar(leitura, regra) : null), [leitura, regra])
  const linhasPricetax = useMemo(() => (planilha ? aplicarMapeamento(planilha.linhas, mapa) : []), [planilha, mapa])
  const conciliacao = useMemo(() => (leitura ? conciliar(leitura, regra) : []), [leitura, regra])
  const cruzamento = useMemo(() => (leitura && linhasPricetax.length ? cruzar(leitura, linhasPricetax, regra) : null), [leitura, linhasPricetax, regra])

  const carregarPlanilha = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setErro(null)
    try {
      let linhas: Record<string, unknown>[]
      if (/\.xlsx?$/i.test(arquivo.name)) {
        const { readSheet } = await import("read-excel-file/browser")
        const dados = await readSheet(arquivo)
        const cab = (dados[0] ?? []).map((c) => String(c ?? "").trim())
        linhas = dados.slice(1).map((ln) => Object.fromEntries(cab.map((c, i) => [c, ln[i]])))
      } else {
        linhas = lerCsv(await arquivo.text())
      }
      const cabecalho = Object.keys(linhas[0] ?? {})
      setPlanilha({ nome: arquivo.name, linhas, cabecalho })
      setMapa(sugerirMapeamento(cabecalho))
    } catch (e) {
      setErro(`Não foi possível ler a planilha: ${(e as Error).message}`)
    }
  }

  const baixarDossie = async () => {
    if (!resultado) return
    let logo: string | undefined
    try {
      const b = await (await fetch("/logo-pricetax.png")).blob()
      logo = await new Promise<string>((ok) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.readAsDataURL(b)
      })
    } catch {}
    const html = gerarDossie({ resultado, cruzamento: cruzamento ?? undefined, conciliacao, logo, geradoEm: new Date().toLocaleString("pt-BR") })
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = nomeDossie(resultado)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const todos = useMemo(() => [...(resultado?.achados ?? []), ...conciliacao, ...(cruzamento?.achados ?? [])], [resultado, conciliacao, cruzamento])
  const conta = (c: Criticidade) => todos.filter((a) => a.criticidade === c).length

  return (
    <Capitulo
      numero="08"
      icone={ShieldCheck}
      titulo="Auditoria de entrada · EFD"
      sub="Conhecer a empresa, validar os arquivos recebidos e saber o que ainda falta pedir. Os EFDs são lidos neste navegador: nada é enviado a servidor."
    >
      <Bloco
        titulo="Arquivos do cliente"
        leitura="Arraste os EFD ICMS/IPI e EFD Contribuições (.txt) de todos os estabelecimentos e meses. O tipo, o CNPJ, a competência e a versão saem do próprio arquivo."
      >
        <label
          className="aud-solta"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            adicionar(e.dataTransfer.files)
          }}
        >
          <Upload aria-hidden="true" size={26} />
          <b>Solte os arquivos EFD aqui ou clique para escolher</b>
          <span className="cap-sub">Arquivos .txt do SPED, de qualquer tamanho</span>
          <input type="file" multiple accept=".txt,text/plain" className="sr-only" onChange={(e) => adicionar(e.target.files)} />
        </label>
        {progresso && (
          <div className="aud-progresso" role="status" aria-live="polite">
            <span>
              Lendo {progresso.arquivo}… {pctTexto(progresso.total ? progresso.lidos / progresso.total : 0)}
            </span>
            <div className="aud-barra">
              <i style={{ width: `${progresso.total ? (progresso.lidos / progresso.total) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        {erro && <p className="aud-erro">{erro}</p>}
        {resultado && (
          <div className="aud-arquivos">
            <TabelaDados
              tabela={{
                colunas: [
                  { id: "nome", nome: "Arquivo", tipo: "texto" },
                  { id: "tipo", nome: "Tipo", tipo: "texto" },
                  { id: "cnpj", nome: "CNPJ", tipo: "texto" },
                  { id: "empresa", nome: "Empresa", tipo: "texto" },
                  { id: "periodo", nome: "Competência", tipo: "texto" },
                  { id: "finalidade", nome: "Versão", tipo: "texto" },
                  { id: "linhas", nome: "Linhas", tipo: "num" },
                  { id: "erros", nome: "Linhas com erro", tipo: "num" },
                ],
                linhas: resultado.arquivos.map((a) => ({
                  ...a,
                  tipo: a.tipo === "fiscal" ? "EFD ICMS/IPI" : a.tipo === "contribuicoes" ? "EFD Contribuições" : "não reconhecido",
                  cnpj: fmtCnpj(a.cnpj),
                  periodo: fmtMes(a.periodo),
                })),
              }}
              porPagina={10}
            />
            <div className="np-acoes">
              <button
                onClick={() => {
                  setArquivos([])
                  setLeitura(null)
                }}
              >
                <Trash2 aria-hidden="true" size={14} /> Limpar arquivos
              </button>
            </div>
          </div>
        )}
      </Bloco>

      {resultado && (
        <>
          <div className="cap-kpis">
            <Indicador icone={FileText} rotulo="Empresa" valor={resultado.empresa.nome || "—"} contexto={`${fmtCnpj(resultado.empresa.cnpj)} · ${resultado.empresa.regime}`} />
            <Indicador icone={FileText} rotulo="Período" valor={`${fmtMes(resultado.periodo.inicio)} a ${fmtMes(resultado.periodo.fim)}`} contexto={`${resultado.arquivos.length} arquivos · ${resultado.estabelecimentos.length} estabelecimentos`} />
            <Indicador icone={CircleX} rotulo="Críticos" valor={String(conta("alta"))} contexto={`${conta("media")} de atenção · ${resultado.pendencias.length} pendências de arquivo`} />
            <Indicador icone={FileSpreadsheet} rotulo="Compras e vendas" valor={moeda(resultado.base.compras + resultado.base.vendas)} contexto={`compras ${moeda(resultado.base.compras)} · vendas ${moeda(resultado.base.vendas)}`} />
          </div>

          <div className="aud-barra-acoes">
            <nav className="cap-alternar" aria-label="Etapas da auditoria">
              {(["1", "2", "3", "4", "5"] as const).map((e) => (
                <button key={e} aria-pressed={etapa === e} onClick={() => setEtapa(e)}>
                  {e} · {({ "1": "Documentos enviados", "2": "Acurácia", "3": "Consolidação", "4": "Divergências com a Pricetax", "5": "Fiscal × Contribuições" } as const)[e]}
                </button>
              ))}
            </nav>
            <button className="botao" onClick={baixarDossie}>
              <FileDown aria-hidden="true" size={15} /> Gerar dossiê HTML
            </button>
          </div>

          {etapa === "1" && <Etapa1 r={resultado} />}
          {(etapa === "2" || etapa === "3") && (
            <>
              {etapa === "3" && <GraficoApuracao r={resultado} />}
              {resultado.achados.filter((a) => a.etapa === etapa).map((a) => <CartaoAchado key={a.id} a={a} />)}
            </>
          )}
          {etapa === "4" && (
            <Bloco
              titulo="Relatório padrão da Pricetax"
              leitura="Carregue o Excel (ou CSV) da Pricetax. As colunas são reconhecidas por analogia (valor bruto = valor total, impostos pelo nome); ajuste o que estiver diferente."
            >
              <label className="aud-solta aud-solta-p">
                <FileSpreadsheet aria-hidden="true" size={22} />
                <b>{planilha ? planilha.nome : "Escolher a planilha (.xlsx ou .csv)"}</b>
                <span className="cap-sub">{planilha ? `${planilha.linhas.length} linhas` : "A planilha também é lida só neste navegador"}</span>
                <input type="file" accept=".xlsx,.xls,.csv,text/csv" className="sr-only" onChange={(e) => carregarPlanilha(e.target.files?.[0])} />
              </label>
              {planilha && (
                <details className="aud-mapa" open={!cruzamento}>
                  <summary>Mapeamento das colunas</summary>
                  <div className="np-campos">
                    {CAMPOS.map((c) => (
                      <label key={c.id}>
                        {c.nome}
                        <select value={mapa[c.id] ?? ""} onChange={(e) => setMapa({ ...mapa, [c.id]: e.target.value || undefined })}>
                          <option value="">(não usar)</option>
                          {planilha.cabecalho.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </Bloco>
          )}
          {etapa === "5" && (
            <>
              <p className="cap-nota">
                Cruzamento nota a nota pela chave de acesso entre o EFD ICMS/IPI e o EFD Contribuições (C100, C500 e D100). Os créditos estimados são
                indicativos (9,25% sobre mercadorias − desconto − ICMS), para priorizar a revisão.
              </p>
              {conciliacao.map((a) => <CartaoAchado key={a.id} a={a} />)}
            </>
          )}
          {etapa === "4" && cruzamento && (
            <>
              <div className="cap-kpis">
                <Indicador rotulo="Documentos no EFD" valor={String(cruzamento.resumo.documentosEfd)} contexto={`${cruzamento.resumo.duplicadosRemovidos} em duplicidade Fiscal × Contribuições, unificados`} />
                <Indicador rotulo="Documentos na planilha" valor={String(cruzamento.resumo.documentosPricetax)} />
                <Indicador rotulo="Conferem" valor={String(cruzamento.resumo.conferem)} />
                <Indicador rotulo="Diferença total" valor={moeda(cruzamento.resumo.totalPricetax - cruzamento.resumo.totalEfd)} contexto={`EFD ${moeda(cruzamento.resumo.totalEfd)} · Pricetax ${moeda(cruzamento.resumo.totalPricetax)}`} />
              </div>
              {cruzamento.achados.map((a) => <CartaoAchado key={a.id} a={a} />)}
            </>
          )}

          <RegraCfops regra={regra} mudar={mudarRegra} />
        </>
      )}
    </Capitulo>
  )
}

function Etapa1({ r }: { r: Resultado }) {
  const [copiado, setCopiado] = useState(false)
  const mensagem = [
    `Olá! Para concluirmos a análise da ${r.empresa.nome || "empresa"}, precisamos dos itens abaixo:`,
    "",
    ...r.pendencias.map((p, i) => `${i + 1}. ${p.tipo} · CNPJ ${p.cnpj} · ${p.competencia}: ${p.acao}`),
  ].join("\n")
  return (
    <>
      <Bloco titulo="1.1 Checklist dos documentos enviados" leitura="Os pontos validados. Quando algo não está ok, a pendência aparece logo abaixo, pronta para enviar ao cliente.">
        <ul className="aud-check">
          {r.checklist.map((c, i) => (
            <li key={i} className={c.ok ? "ok" : "nok"}>
              {c.ok ? <CircleCheck aria-label="ok" size={18} /> : <CircleX aria-label="pendente" size={18} />}
              <span>
                <b>{c.item}</b> {c.descricao}
                <span className="cap-sub">{c.detalhe}</span>
              </span>
            </li>
          ))}
        </ul>
      </Bloco>
      <Bloco
        titulo="Mapa de entregas por estabelecimento"
        leitura="F = EFD ICMS/IPI do estabelecimento · C = EFD Contribuições da empresa (um arquivo para todos). Verde: recebido. Cinza: arquivo recebido, mas o estabelecimento não consta no 0140 do mês (sem operações de PIS/COFINS). Vermelho: faltando."
      >
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="cap-tabela aud-mapa-entregas">
            <thead>
              <tr>
                <th>Estabelecimento</th>
                <th>IE</th>
                {r.periodo.meses.map((m) => (
                  <th key={m} className="num">
                    {fmtMes(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.estabelecimentos.map((e) => {
                const precisaF = !!e.ie || Object.keys(e.fiscal).length > 0
                return (
                  <tr key={e.cnpj}>
                    <td>
                      <b>{e.nome}</b>
                      <span className="cap-sub">{fmtCnpj(e.cnpj)}</span>
                    </td>
                    <td>{e.ie || "—"}</td>
                    {r.periodo.meses.map((m) => (
                      <td key={m} className="num">
                        {precisaF && <span className={e.fiscal[m] ? "aud-s" : "aud-n"}>F{(e.fiscal[m] ?? 0) > 1 ? `×${e.fiscal[m]}` : ""}</span>}{" "}
                        {e.contribuicoes[m] ? (
                          <span className="aud-s">C</span>
                        ) : r.mesesContribuicoes.includes(m) ? (
                          <span className="aud-cinza" title="EFD Contribuições recebido; o estabelecimento não consta no 0140 deste mês">
                            C
                          </span>
                        ) : (
                          <span className="aud-n">C</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Bloco>
      <Bloco titulo="1.1.3 Pendências para o cliente" leitura={r.pendencias.length ? "O que falta ou precisa de confirmação, em uma tabela objetiva." : undefined}>
        {r.pendencias.length ? (
          <>
            <TabelaDados
              tabela={{
                colunas: [
                  { id: "tipo", nome: "EFD", tipo: "texto" },
                  { id: "cnpj", nome: "CNPJ", tipo: "texto" },
                  { id: "estabelecimento", nome: "Estabelecimento", tipo: "texto" },
                  { id: "competencia", nome: "Competência", tipo: "texto" },
                  { id: "problema", nome: "O que encontramos", tipo: "texto" },
                  { id: "acao", nome: "O que pedir", tipo: "texto" },
                ],
                linhas: r.pendencias,
              }}
            />
            <div className="np-acoes">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(mensagem)
                  setCopiado(true)
                  setTimeout(() => setCopiado(false), 2000)
                }}
              >
                <ClipboardCopy aria-hidden="true" size={14} /> {copiado ? "Mensagem copiada" : "Copiar mensagem para o cliente"}
              </button>
            </div>
          </>
        ) : (
          <p className="aud-tudo-ok">
            <CircleCheck aria-hidden="true" size={18} /> Todos os arquivos estão completos: nada a pedir ao cliente.
          </p>
        )}
      </Bloco>
    </>
  )
}

function CartaoAchado({ a }: { a: Achado }) {
  const [aberto, setAberto] = useState<"tabela" | "detalhe" | null>(null)
  return (
    <article className={`aud-achado c-${a.criticidade}`}>
      <header>
        <span className="aud-item">{a.item}</span>
        <span className={`aud-selo ${a.criticidade}`}>{NOME_CRIT[a.criticidade]}</span>
        <h3>{a.titulo}</h3>
      </header>
      <p>{a.resumo}</p>
      {a.representatividade !== undefined && a.representatividade > 0 && (
        <div className="aud-rep">
          <span className="cap-sub">Representatividade: {pctTexto(a.representatividade)}</span>
          <div className="aud-barra">
            <i style={{ width: `${Math.min(100, a.representatividade * 100)}%` }} />
          </div>
        </div>
      )}
      {a.reforma && (a.reforma.dentro > 0 || a.reforma.fora > 0) && (
        <p className="cap-sub">
          CFOPs da reforma: <b>{moeda(a.reforma.dentro)}</b> · fora da reforma: <b>{moeda(a.reforma.fora)}</b>
        </p>
      )}
      {a.comoResolver && a.criticidade !== "ok" && (
        <p className="aud-resolver">
          <b>Como resolver:</b> {a.comoResolver}
        </p>
      )}
      <div className="np-acoes">
        {a.tabela && a.tabela.linhas.length > 0 && (
          <button aria-pressed={aberto === "tabela"} onClick={() => setAberto((x) => (x === "tabela" ? null : "tabela"))}>
            Totalização ({a.tabela.linhas.length})
          </button>
        )}
        {a.detalhe && a.detalhe.linhas.length > 0 && (
          <button aria-pressed={aberto === "detalhe"} onClick={() => setAberto((x) => (x === "detalhe" ? null : "detalhe"))}>
            <Search aria-hidden="true" size={14} /> Micro: documentos ({a.detalhe.linhas.length})
          </button>
        )}
        {(a.fontes ?? []).map((f) => (
          <a key={f} className="aud-fonte" href={FONTES[f]?.url} target="_blank" rel="noopener noreferrer" title={FONTES[f]?.titulo}>
            {FONTES[f]?.titulo.split(" (")[0]}
          </a>
        ))}
      </div>
      {aberto === "tabela" && a.tabela && <TabelaDados tabela={a.tabela} />}
      {aberto === "detalhe" && a.detalhe && <TabelaDados tabela={a.detalhe} />}
    </article>
  )
}

/** Tabela com busca, filtro de CFOPs da reforma e paginação. */
function TabelaDados({ tabela, porPagina = 25 }: { tabela: Tabela; porPagina?: number }) {
  const [busca, setBusca] = useState("")
  const [reforma, setReforma] = useState("")
  const [pagina, setPagina] = useState(0)
  const temReforma = tabela.colunas.some((c) => c.id === "reforma")
  const linhas = useMemo(
    () =>
      tabela.linhas.filter(
        (l) => (!reforma || l.reforma === reforma) && (!busca || Object.values(l).some((v) => String(v).toLowerCase().includes(busca.toLowerCase()))),
      ),
    [tabela, busca, reforma],
  )
  const paginas = Math.max(1, Math.ceil(linhas.length / porPagina))
  const visiveis = linhas.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const fmt = (v: string | number | undefined, tipo: string) =>
    v === undefined || v === "" ? "" : tipo === "moeda" ? moeda(Number(v)) : tipo === "pct" ? pctTexto(Number(v)) : tipo === "num" ? Number(v).toLocaleString("pt-BR") : String(v)
  return (
    <div className="aud-tabela">
      {tabela.linhas.length > porPagina || temReforma ? (
        <div className="aud-filtros">
          <input
            type="search"
            placeholder="Buscar chave, CNPJ, CFOP, NCM, nome…"
            aria-label="Buscar na tabela"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(0)
            }}
          />
          {temReforma && (
            <select aria-label="CFOPs da reforma" value={reforma} onChange={(e) => setReforma(e.target.value)}>
              <option value="">Reforma: todos</option>
              <option value="sim">Só CFOPs da reforma</option>
              <option value="não">Só fora da reforma</option>
            </select>
          )}
        </div>
      ) : null}
      <div className="tabela-rolagem" tabIndex={0}>
        <table className="cap-tabela">
          <thead>
            <tr>
              {tabela.colunas.map((c) => (
                <th key={c.id} className={c.tipo === "texto" ? undefined : "num"}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => (
              <tr key={i}>
                {tabela.colunas.map((c) => (
                  <td key={c.id} className={c.tipo === "texto" ? (String(l[c.id] ?? "").length > 60 ? "aud-longo" : undefined) : "num"}>
                    {fmt(l[c.id], c.tipo)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="aud-paginas">
        <span className="cap-sub">{linhas.length.toLocaleString("pt-BR")} linha(s)</span>
        {paginas > 1 && (
          <span className="np-acoes">
            <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </button>
            <span className="cap-sub">
              {pagina + 1} de {paginas}
            </span>
            <button disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/** 3.1 em gráfico: a recolher (barras) e saldo credor (linha) por mês, para cada imposto. */
function GraficoApuracao({ r }: { r: Resultado }) {
  const impostos = [...new Set(r.consolidacao.linhas.map((l) => l.imposto))]
  const [imp, setImp] = useState(impostos[0])
  const xs = r.consolidacao.linhas.filter((l) => l.imposto === imp)
  if (!impostos.length) return null
  const max = Math.max(1, ...xs.map((l) => Math.max(l.aRecolher, l.saldoCredor)))
  const W = 720
  const H = 180
  const p = 40
  const bw = (W - p * 2) / Math.max(1, xs.length)
  return (
    <Bloco titulo="3.1 Apuração mês a mês" leitura="Barras: imposto a recolher. Linha: saldo credor que passa para o mês seguinte. Credora acumula; devedora paga todo mês.">
      <div className="cap-alternar">
        {impostos.map((i) => (
          <button key={i} aria-pressed={imp === i} onClick={() => setImp(i)}>
            {i}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" role="img" aria-label={`Apuração mensal de ${imp}`} className="aud-grafico">
        {xs.map((l, i) => {
          const h = (l.aRecolher / max) * H
          return (
            <Fragment key={l.periodo}>
              <rect x={p + i * bw + bw * 0.2} y={H - h + 5} width={bw * 0.6} height={h} rx={5} fill="var(--pt-amarelo)">
                <title>{`${fmtMes(l.periodo)}: a recolher ${moeda(l.aRecolher)}`}</title>
              </rect>
              <text x={p + i * bw + bw / 2} y={H + 24} textAnchor="middle">
                {fmtMes(l.periodo)}
              </text>
            </Fragment>
          )
        })}
        <polyline points={xs.map((l, i) => `${p + i * bw + bw / 2},${H - (l.saldoCredor / max) * H + 5}`).join(" ")} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
        {xs.map((l, i) => (
          <circle key={l.periodo} cx={p + i * bw + bw / 2} cy={H - (l.saldoCredor / max) * H + 5} r={4} fill="var(--text-primary)">
            <title>{`${fmtMes(l.periodo)}: saldo credor ${moeda(l.saldoCredor)}`}</title>
          </circle>
        ))}
      </svg>
    </Bloco>
  )
}

function RegraCfops({ regra, mudar }: { regra: RegraCfop; mudar: (r: RegraCfop) => void }) {
  const lista = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length === 4))]
  return (
    <details className="aud-regra">
      <summary>Regra de CFOPs da reforma (editável)</summary>
      <p className="cap-sub">
        Padrão: dentro da reforma as operações onerosas (compras, vendas, serviços, ativo, uso e consumo, importação, exportação, devoluções). Fora: transferências
        (x15x, x408, x409, x552, x557) e remessas e retornos do grupo x9xx, exceto serviço (x933). Inclua ou exclua CFOPs: todas as análises seguem a regra em uso, e ela fica salva neste
        navegador.
      </p>
      <div className="np-campos">
        <label className="np-largo">
          Incluir na reforma (CFOPs separados por vírgula)
          <input defaultValue={regra.incluir.join(", ")} onBlur={(e) => mudar({ ...regra, incluir: lista(e.target.value) })} />
        </label>
        <label className="np-largo">
          Tirar da reforma
          <input defaultValue={regra.excluir.join(", ")} onBlur={(e) => mudar({ ...regra, excluir: lista(e.target.value) })} />
        </label>
      </div>
    </details>
  )
}

export { rotuloCrit }
