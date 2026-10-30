"use client"
import { useEffect, useMemo, useState } from "react"
import type { Calculo, CalculoDetalhe } from "@pricetax/sdk"
import type { RamoId } from "@/lib/auditoria"
import { REGIMES } from "@/lib/catalogo"
import { Auditoria } from "./Auditoria"
import { Erro, Esqueleto } from "./comum"
import { Historia } from "./Historia"
import { api, fmtCnpj, fmtMes, useBusca } from "./util"

export type Detalhe = CalculoDetalhe & { raiz: { inicio: string | null; fim: string | null } }

/** Os parâmetros de leitura que valem para as duas abas. */
export type Escolha = {
  regime: string
  anoTransicao: number
  anoPleno: number
  cenarioVendas: string
  cenarioCompras: string
}

const ABAS = { reforma: "A Reforma na empresa", auditoria: "Auditoria de IBS e CBS" } as const
type Aba = keyof typeof ABAS

export function Painel({ calculoPadrao }: { calculoPadrao: string | null }) {
  const [calculoId, setCalculoId] = useState<string | null>(null)

  // O cálculo vem da URL (?calculo=) ou do .env do servidor; nunca o "mais recente" às cegas.
  useEffect(() => {
    setCalculoId(new URL(window.location.href).searchParams.get("calculo") || calculoPadrao)
  }, [calculoPadrao])

  function escolher(id: string | null) {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("calculo", id)
    else url.searchParams.delete("calculo")
    window.history.replaceState(null, "", url)
    setCalculoId(id)
  }

  const lista = useBusca((s) => api<{ calculos: Calculo[] }>("/api/calculos", undefined, s), [])
  const detalhe = useBusca(calculoId ? (s) => api<Detalhe>(`/api/calculos/${calculoId}`, undefined, s) : null, [calculoId])
  const empresa = detalhe.dados?.empresa ?? detalhe.dados?.nome ?? null

  return (
    <>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topo">
        <span className="produto">
          <strong>Pricetax</strong> · Reforma Tributária
        </span>
        <span className="topo-direita">
          {empresa && <span className="assinatura">{empresa}</span>}
          <Tema />
        </span>
      </header>
      <main id="conteudo">
        {!calculoId && <EscolherCalculo lista={lista} onEscolher={escolher} />}
        {calculoId && detalhe.erro != null && <Erro erro={detalhe.erro} />}
        {calculoId && !detalhe.dados && !detalhe.erro && <Esqueleto alturas={[260, 48, 380, 320]} />}
        {calculoId && detalhe.dados && (
          <Relatorio key={detalhe.dados.id} calculo={detalhe.dados} calculos={lista.dados?.calculos ?? []} onCalculo={escolher} />
        )}
      </main>
      {detalhe.dados && <Rodape calculo={detalhe.dados} />}
    </>
  )
}

function EscolherCalculo({
  lista,
  onEscolher,
}: {
  lista: { dados: { calculos: Calculo[] } | null; erro: unknown; carregando: boolean }
  onEscolher: (id: string) => void
}) {
  return (
    <section className="secao" style={{ maxWidth: 760 }}>
      <div>
        <h1 className="titulo-relatorio">Escolha o cálculo</h1>
        <span className="risca" />
      </div>
      <p className="leitura">Os cálculos da conta Pricetax ligada a este painel, do mais novo para o mais antigo.</p>
      {lista.erro != null && <Erro erro={lista.erro} />}
      {lista.carregando && <div className="vazio">Carregando…</div>}
      {lista.dados?.calculos.length === 0 && <div className="vazio">Nenhum cálculo nesta conta.</div>}
      <div className="grade">
        {lista.dados?.calculos.map((c) => (
          <button key={c.id} className="cartao" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onEscolher(c.id)}>
            <strong style={{ display: "block", fontSize: 15 }}>{c.nome}</strong>
            <span className="nota">
              {[c.empresa, c.cnpj && fmtCnpj(c.cnpj), c.regime_tributario && REGIMES[c.regime_tributario]].filter(Boolean).join(" · ")}
            </span>
            <span className="nota" style={{ display: "block" }}>
              Criado em {new Date(c.criado_em).toLocaleDateString("pt-BR")}
              {c.processando ? " · sendo refeito agora" : ""}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/** "cálculo X, jan/2024 a dez/2024, 12 meses": de onde os números saíram. */
export function textoRaiz(c: Detalhe) {
  const inicio = fmtMes(c.raiz.inicio)
  const fim = fmtMes(c.raiz.fim)
  return [
    `cálculo ${c.nome}`,
    inicio && fim ? (inicio === fim ? inicio : `${inicio} a ${fim}`) : null,
    c.periodo_meses ? `${c.periodo_meses} ${c.periodo_meses === 1 ? "mês" : "meses"}` : null,
  ]
    .filter(Boolean)
    .join(", ")
}

/** "nos 6 meses analisados (jan/2025 a jun/2025)": o período dos números, em uma expressão. */
function textoPeriodo(c: Detalhe) {
  const inicio = fmtMes(c.raiz.inicio)
  const fim = fmtMes(c.raiz.fim)
  const meses = c.periodo_meses ? `nos ${c.periodo_meses} meses analisados` : "no período analisado"
  return inicio && fim ? `${meses} (${inicio === fim ? inicio : `${inicio} a ${fim}`})` : meses
}

function Relatorio({ calculo, calculos, onCalculo }: { calculo: Detalhe; calculos: Calculo[]; onCalculo: (id: string) => void }) {
  const anos = useMemo(() => [...calculo.anos].sort((a, b) => a - b), [calculo.anos])
  const anoPleno = anos[anos.length - 1]
  const anoTransicao = anos.includes(2027) && anoPleno !== 2027 ? 2027 : anos[0]
  const regimeInicial =
    calculo.regime_tributario && calculo.regimes.includes(calculo.regime_tributario) ? calculo.regime_tributario : calculo.regimes[0]
  const cenarioInicial = calculo.cenarios.some((c) => c.id === "base") ? "base" : calculo.cenarios[0]?.id

  const [regime, setRegime] = useState(regimeInicial)
  const [ano, setAno] = useState(anoPleno)
  const [cenarioVendas, setCenarioVendas] = useState(cenarioInicial)
  const [cenarioCompras, setCenarioCompras] = useState(cenarioInicial)
  const [aba, setAba] = useState<Aba>("reforma")
  const [ramo, setRamo] = useState<RamoId | null>(null)
  const [geradoEm] = useState(() => new Date())

  // A aba fica na URL (?visao=auditoria) para dar para compartilhar o link.
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("visao") === "auditoria") setAba("auditoria")
  }, [])
  function trocarAba(nova: Aba, ramoEscolhido: RamoId | null = null) {
    const url = new URL(window.location.href)
    if (nova === "reforma") url.searchParams.delete("visao")
    else url.searchParams.set("visao", nova)
    window.history.replaceState(null, "", url)
    setRamo(ramoEscolhido)
    setAba(nova)
    window.scrollTo({ top: 0 })
  }

  if (!regime || anoPleno === undefined || !cenarioVendas || !cenarioCompras) {
    return <div className="alerta">Este cálculo ainda não tem regimes, anos ou cenários disponíveis para leitura.</div>
  }
  const escolha: Escolha = { regime, anoTransicao, anoPleno, cenarioVendas, cenarioCompras }
  const periodo = textoPeriodo(calculo)
  const opcoesAno = anoTransicao === anoPleno ? [anoPleno] : [anoTransicao, anoPleno]

  return (
    <>
      {calculo.processando && <div className="alerta">Este cálculo está sendo refeito no app. Os números podem mudar quando terminar.</div>}

      <section className="heroi">
        <span className="heroi-forma" aria-hidden="true" />
        <span className="heroi-forma dois" aria-hidden="true" />
        <div>
          <h1 className="titulo-relatorio">A Reforma Tributária{calculo.empresa ? ` na ${calculo.empresa}` : ""}</h1>
          <span className="risca" />
        </div>
        <p className="origem-linha">
          <b>Raiz da informação:</b> {textoRaiz(calculo)} · <b>Relatório gerado em:</b> {geradoEm.toLocaleDateString("pt-BR")}
        </p>
        <div className="controles">
          <div className="segmentos" role="group" aria-label="Ano">
            {opcoesAno.map((a) => (
              <button key={a} aria-pressed={ano === a} onClick={() => setAno(a)}>
                {a} · {a === anoPleno ? "reforma completa" : "transição"}
              </button>
            ))}
          </div>
          <Campo rotulo="Regime">
            <select value={regime} onChange={(e) => setRegime(e.target.value)}>
              {calculo.regimes.map((r) => (
                <option key={r} value={r}>
                  {REGIMES[r] ?? r}
                  {r === calculo.regime_tributario ? " (atual)" : ""}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </section>

      <nav className="abas" aria-label="Visões">
        {(Object.keys(ABAS) as Aba[]).map((a) => (
          <button key={a} aria-current={aba === a ? "page" : undefined} onClick={() => trocarAba(a)}>
            {ABAS[a]}
          </button>
        ))}
      </nav>

      {aba === "reforma" ? (
        <Historia calculo={calculo} escolha={escolha} ano={ano} periodo={periodo} onAbrirAuditoria={(r) => trocarAba("auditoria", r)} />
      ) : (
        <Auditoria key={`${ramo}`} calculo={calculo} escolha={escolha} ano={ano} periodo={periodo} ramoInicial={ramo} />
      )}

      <details className="ver-detalhes premissas">
        <summary>Premissas e origem dos dados</summary>
        <div className="origens">
          <span>
            <b>Raiz da informação:</b> {textoRaiz(calculo)}
          </span>
          <span>
            <b>Relatório gerado em:</b> {geradoEm.toLocaleDateString("pt-BR")} às{" "}
            {geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="controles">
          {calculos.length > 1 && (
            <Campo rotulo="Cálculo">
              <select value={calculo.id} onChange={(e) => onCalculo(e.target.value)} style={{ maxWidth: 320 }}>
                {calculos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.empresa ? `, ${c.empresa}` : ""}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo rotulo="Preço de venda">
            <select value={cenarioVendas} onChange={(e) => setCenarioVendas(e.target.value)}>
              {calculo.cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Preço dos fornecedores">
            <select value={cenarioCompras} onChange={(e) => setCenarioCompras(e.target.value)}>
              {calculo.cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === "sem_reajuste" ? `${c.nome} (pior cenário)` : c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <a className="botao" href={linkExportar(calculo.id, { ...escolha, anoTransicao: ano })} download>
            Baixar dados (CSV)
          </a>
        </div>
        <p className="nota">
          Ajustado: o preço é recalculado para manter a margem de hoje. Sem Reajuste: o preço de venda não muda; nas compras, o fornecedor repassa o
          novo imposto sobre o valor cheio. Os valores são do período analisado. A Auditoria usa sempre o Ajustado como referência. Esta visão não
          traz DRE nem fluxo de caixa, porque a API de cálculos não informa despesas, IR e CSLL.
        </p>
      </details>
    </>
  )
}

type Tema = "auto" | "light" | "dark"
const TEMAS: Record<Tema, string> = { auto: "Auto", light: "Claro", dark: "Escuro" }

/** Claro, escuro ou o do sistema; a escolha fica neste navegador. */
function Tema() {
  const [tema, setTema] = useState<Tema>("auto")
  useEffect(() => {
    try {
      const salvo = localStorage.getItem("tema")
      if (salvo === "light" || salvo === "dark") setTema(salvo)
    } catch {}
  }, [])
  function escolher(t: Tema) {
    setTema(t)
    try {
      if (t === "auto") localStorage.removeItem("tema")
      else localStorage.setItem("tema", t)
    } catch {}
    if (t === "auto") delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
  }
  return (
    <span className="tema" role="group" aria-label="Tema">
      {(Object.keys(TEMAS) as Tema[]).map((t) => (
        <button key={t} aria-pressed={tema === t} onClick={() => escolher(t)}>
          {TEMAS[t]}
        </button>
      ))}
    </span>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      {children}
    </div>
  )
}

function Rodape({ calculo }: { calculo: Detalhe }) {
  const inicio = fmtMes(calculo.raiz.inicio)
  const fim = fmtMes(calculo.raiz.fim)
  return (
    <footer className="rodape">
      <span className="assinatura">{calculo.empresa ?? calculo.nome}</span>
      <span className="fonte">
        Dados baseados no cálculo {calculo.nome}
        {inicio && fim ? `, base ${inicio === fim ? inicio : `${inicio} a ${fim}`}` : ""}
      </span>
      <span className="marca">PRICETAX</span>
    </footer>
  )
}

function linkExportar(id: string, e: Escolha) {
  const q = new URLSearchParams({
    regime: e.regime,
    ano: String(e.anoTransicao),
    cenario_vendas: e.cenarioVendas,
    cenario_compras: e.cenarioCompras,
    sentido: "ambas",
  })
  return `/api/calculos/${id}/exportar?${q}`
}
