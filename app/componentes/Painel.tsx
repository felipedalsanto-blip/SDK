"use client"
import { useEffect, useMemo, useState } from "react"
import type { Calculo, CalculoDetalhe } from "@pricetax/sdk"
import { REGIMES } from "@/lib/catalogo"
import { Auditoria } from "./Auditoria"
import { Erro } from "./comum"
import { Executivo } from "./Executivo"
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

const ABAS = { reforma: "Reforma na empresa", auditoria: "Auditoria de IBS e CBS" } as const
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
      <header className="topo">
        <span className="produto">
          <strong>Pricetax</strong> · Reforma Tributária
        </span>
        {empresa && <span className="assinatura">{empresa}</span>}
      </header>
      <main>
        {!calculoId && <EscolherCalculo lista={lista} onEscolher={escolher} />}
        {calculoId && detalhe.erro != null && <Erro erro={detalhe.erro} />}
        {calculoId && !detalhe.dados && !detalhe.erro && <div className="vazio">Carregando o cálculo…</div>}
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

function Relatorio({ calculo, calculos, onCalculo }: { calculo: Detalhe; calculos: Calculo[]; onCalculo: (id: string) => void }) {
  const anos = useMemo(() => [...calculo.anos].sort((a, b) => a - b), [calculo.anos])
  const anoPleno = anos[anos.length - 1]
  const anosTransicao = anos.length > 1 ? anos.slice(0, -1) : anos
  const regimeInicial =
    calculo.regime_tributario && calculo.regimes.includes(calculo.regime_tributario) ? calculo.regime_tributario : calculo.regimes[0]
  const cenarioInicial = calculo.cenarios.some((c) => c.id === "base") ? "base" : calculo.cenarios[0]?.id

  const [regime, setRegime] = useState(regimeInicial)
  const [anoTransicao, setAnoTransicao] = useState(anosTransicao.includes(2027) ? 2027 : anosTransicao[0])
  const [cenarioVendas, setCenarioVendas] = useState(cenarioInicial)
  const [cenarioCompras, setCenarioCompras] = useState(cenarioInicial)
  const [aba, setAba] = useState<Aba>("reforma")
  const [geradoEm] = useState(() => new Date())

  // A aba fica na URL (?visao=auditoria) para dar para compartilhar o link.
  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("visao") === "auditoria") setAba("auditoria")
  }, [])
  function trocarAba(nova: Aba) {
    const url = new URL(window.location.href)
    if (nova === "reforma") url.searchParams.delete("visao")
    else url.searchParams.set("visao", nova)
    window.history.replaceState(null, "", url)
    setAba(nova)
  }

  if (!regime || anoTransicao === undefined || !cenarioVendas || !cenarioCompras) {
    return <div className="alerta">Este cálculo ainda não tem regimes, anos ou cenários disponíveis para leitura.</div>
  }
  const escolha: Escolha = { regime, anoTransicao, anoPleno, cenarioVendas, cenarioCompras }
  const nomeCenario = (id: string, compras: boolean) => {
    const nome = calculo.cenarios.find((c) => c.id === id)?.nome ?? id
    return compras && id === "sem_reajuste" ? `${nome} (pior cenário)` : nome
  }

  return (
    <>
      {calculo.processando && <div className="alerta">Este cálculo está sendo refeito no app. Os números podem mudar quando terminar.</div>}

      <section className="cabecalho">
        <div>
          <h1 className="titulo-relatorio">Os efeitos da Reforma Tributária{calculo.empresa ? ` na ${calculo.empresa}` : ""}</h1>
          <span className="risca" />
        </div>
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
          <Campo rotulo="Ano de transição">
            <select value={anoTransicao} onChange={(e) => setAnoTransicao(Number(e.target.value))}>
              {anosTransicao.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Campo>
          {aba === "reforma" && (
            <>
              <Campo rotulo="Vendas">
                <select value={cenarioVendas} onChange={(e) => setCenarioVendas(e.target.value)}>
                  {calculo.cenarios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeCenario(c.id, false)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Compras">
                <select value={cenarioCompras} onChange={(e) => setCenarioCompras(e.target.value)}>
                  {calculo.cenarios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeCenario(c.id, true)}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}
          <a className="botao" href={linkExportar(calculo.id, escolha)} download>
            Baixar dados (CSV)
          </a>
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
        <Executivo calculo={calculo} escolha={escolha} onAnoTransicao={setAnoTransicao} />
      ) : (
        <Auditoria calculo={calculo} escolha={escolha} />
      )}

      <div className="origens">
        <span>
          <b>Raiz da informação:</b> {textoRaiz(calculo)}
        </span>
        <span>
          <b>Relatório gerado em:</b> {geradoEm.toLocaleDateString("pt-BR")}
        </span>
      </div>
    </>
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
