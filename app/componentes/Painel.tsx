"use client"
import {
  Download,
  FileChartColumn,
  LayoutDashboard,
  Scale,
  Monitor,
  Moon,
  PackagePlus,
  ShieldCheck,
  ShoppingCart,
  Sun,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { Carregando } from "./capitulos/ui"
import dynamic from "next/dynamic"

// A auditoria (leitor de EFD, análises e dossiê) só é baixada quando a aba é aberta.
const Auditoria = dynamic(() => import("./auditoria/Auditoria").then((m) => m.Auditoria), {
  loading: () => <Carregando mensagem="Abrindo a auditoria…" indicadores={2} />,
})
import { cloneElement, useEffect, useMemo, useState } from "react"
import type { Calculo, CalculoDetalhe } from "@pricetax/sdk"
import {
  DIMENSOES_RANKING,
  REGIMES,
  SENTIDOS,
  type Selecao,
  type Sentido,
} from "@/lib/catalogo"
import { api, fmtBRL, fmtCnpj, fmtInt, fmtPct, pontos, useBusca, variacao } from "./util"
import { GraficoSerie, type PontoSerie } from "./GraficoSerie"
import { Ranking } from "./Ranking"
import { TabelaLinhas } from "./TabelaLinhas"
import { VisaoClassificacao } from "./VisaoClassificacao"
import { Compras } from "./capitulos/Compras"
import { Dre } from "./capitulos/Dre"
import { MelhorRegime } from "./capitulos/Regime"
import { Fluxo } from "./capitulos/Fluxo"
import { NovoProduto } from "./capitulos/NovoProduto"
import { Vendas } from "./capitulos/Vendas"
import { Erro, rotuloValor } from "./comum"

type Total = Record<string, number | string | boolean | null>

type Modo = "light" | "dark" | "sistema"

/** Claro, escuro ou o do sistema; a escolha fica salva neste navegador. */
function Tema() {
  const [modo, setModo] = useState<Modo>("sistema")
  useEffect(() => {
    try {
      const t = localStorage.getItem("pricetax-tema")
      if (t === "light" || t === "dark") setModo(t)
    } catch {}
  }, [])
  const mudar = (m: Modo) => {
    setModo(m)
    if (m === "sistema") delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = m
    try {
      if (m === "sistema") localStorage.removeItem("pricetax-tema")
      else localStorage.setItem("pricetax-tema", m)
    } catch {}
  }
  const opcoes: [Modo, string, LucideIcon][] = [["light", "Claro", Sun], ["dark", "Escuro", Moon], ["sistema", "Sistema", Monitor]]
  return (
    <div className="tema" role="group" aria-label="Tema">
      {opcoes.map(([m, nome, Icone]) => (
        <button key={m} aria-pressed={modo === m} onClick={() => mudar(m)}>
          <Icone aria-hidden="true" size={13} /> {nome}
        </button>
      ))}
    </div>
  )
}

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

  const lista = useBusca((s) => api<{ calculos: Calculo[]; contas?: { conta: number; calculos: number; erro?: string }[] }>("/api/calculos", undefined, s), [])
  const detalhe = useBusca(
    calculoId ? (s) => api<CalculoDetalhe>(`/api/calculos/${calculoId}`, undefined, s) : null,
    [calculoId],
  )

  return (
    <>
      <a className="pular-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="topo">
        <div className="marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pricetax.png" alt="PriceTax" className="logo" />
          <h1>Diagnóstico da Reforma Tributária</h1>
        </div>
        <div className="topo-acoes">
        <Tema />
        {calculoId && lista.dados && (
          <div className="campo" style={{ minWidth: 0 }}>
            <select
              aria-label="Cálculo"
              value={calculoId}
              onChange={(e) => escolher(e.target.value || null)}
              style={{ maxWidth: 420 }}
            >
              {!lista.dados.calculos.some((c) => c.id === calculoId) && <option value={calculoId}>{calculoId}</option>}
              {lista.dados.calculos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.empresa ? ` — ${c.empresa}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        </div>
      </header>
      <main id="conteudo">
        {!calculoId && <EscolherCalculo lista={lista} onEscolher={escolher} />}
        {calculoId &&
          lista.dados?.contas
            ?.filter((c) => c.erro)
            .map((c) => (
              <div key={c.conta} className="aviso" role="alert" style={{ marginBottom: 12 }}>
                A chave da conta {c.conta} ({c.conta === 1 ? "PRICETAX_API_KEY" : `PRICETAX_API_KEY_${c.conta}`}) não respondeu: {c.erro?.replace(/\.$/, "")}. Os cálculos
                dela não aparecem na lista.
              </div>
            ))}
        {calculoId && detalhe.erro != null && <Erro erro={detalhe.erro} />}
        {calculoId && detalhe.carregando && !detalhe.dados && <Carregando mensagem="Carregando o cálculo…" />}
        {calculoId && detalhe.dados && <Visao key={detalhe.dados.id} calculo={detalhe.dados} />}
      </main>
    </>
  )
}

function EscolherCalculo({
  lista,
  onEscolher,
}: {
  lista: { dados: { calculos: Calculo[]; contas?: { conta: number; calculos: number; erro?: string }[] } | null; erro: unknown; carregando: boolean }
  onEscolher: (id: string) => void
}) {
  return (
    <section className="cartao" style={{ maxWidth: 720 }}>
      <div className="cabeca">
        <div>
          <h2>Escolha um cálculo</h2>
          <p className="sub">
            Os cálculos {(lista.dados?.contas?.length ?? 1) > 1 ? `das ${lista.dados!.contas!.length} contas PriceTax configuradas` : "da conta PriceTax desta chave"}, do mais novo para o mais antigo.
          </p>
        </div>
      </div>
      {lista.erro != null && <Erro erro={lista.erro} />}
      {lista.carregando && <div className="vazio">Carregando…</div>}
      {lista.dados?.contas
        ?.filter((c) => c.erro)
        .map((c) => (
          <div key={c.conta} className="aviso" role="alert">
            A chave da conta {c.conta} ({c.conta === 1 ? "PRICETAX_API_KEY" : `PRICETAX_API_KEY_${c.conta}`}) não respondeu: {c.erro?.replace(/\.$/, "")}. Confira a chave na
            Vercel e faça um novo deploy.
          </div>
        ))}
      {lista.dados && lista.dados.calculos.length === 0 && <div className="vazio">Nenhum cálculo nesta conta.</div>}
      <div className="lista-calculos">
        {lista.dados?.calculos.map((c) => (
          <button key={c.id} onClick={() => onEscolher(c.id)}>
            <strong>{c.nome}</strong>
            <span className="meta">
              {[c.empresa, c.cnpj && fmtCnpj(c.cnpj), c.regime_tributario && REGIMES[c.regime_tributario]]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="meta">
              Criado em {new Date(c.criado_em).toLocaleDateString("pt-BR")}
              {c.processando ? " · sendo refeito agora" : ""}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Visao({ calculo }: { calculo: CalculoDetalhe }) {
  const anos = useMemo(() => [...calculo.anos].sort((a, b) => a - b), [calculo.anos])
  const regimeInicial =
    calculo.regime_tributario && calculo.regimes.includes(calculo.regime_tributario)
      ? calculo.regime_tributario
      : calculo.regimes[0]
  const cenarioInicial = calculo.cenarios.some((c) => c.id === "base") ? "base" : calculo.cenarios[0]?.id

  const [regime, setRegime] = useState(regimeInicial)
  const [ano, setAno] = useState(anos.includes(2027) ? 2027 : anos[0])
  const [cenarioVendas, setCenarioVendas] = useState(cenarioInicial)
  const [cenarioCompras, setCenarioCompras] = useState(cenarioInicial)
  const [sentido, setSentido] = useState<Sentido>("ambas")
  const [filtro, setFiltro] = useState<Selecao["filtro"]>(null)
  const [aba, setAba] = useState<Aba>("compras")
  // IPI e ICMS estimados na cadeia (não vieram no documento): dentro ou fora dos números.
  const [semEstimados, setSemEstimados] = useState(false)

  // A aba fica na URL (?visao=classificacao) para dar para compartilhar o link.
  useEffect(() => {
    const visao = new URL(window.location.href).searchParams.get("visao")
    if (visao && visao in ABAS) setAba(visao as Aba)
  }, [])
  function trocarAba(nova: Aba) {
    const url = new URL(window.location.href)
    if (nova === "compras") url.searchParams.delete("visao")
    else url.searchParams.set("visao", nova)
    window.history.replaceState(null, "", url)
    setAba(nova)
  }

  if (!regime || ano === undefined || !cenarioVendas) {
    return <div className="aviso">Este cálculo ainda não tem regimes, anos ou cenários disponíveis para leitura.</div>
  }

  const selecao: Selecao = {
    recorte: { regime, ano, cenario_vendas: cenarioVendas, cenario_compras: cenarioCompras ?? cenarioVendas },
    sentido,
    filtro,
  }
  const chave = JSON.stringify(selecao)
  const capitulo = aba === "compras" || aba === "vendas" || aba === "dre" || aba === "fluxo" || aba === "regime" || aba === "novo" || aba === "auditoria"
  const chaveSerie = JSON.stringify({ ...selecao, recorte: { ...selecao.recorte, ano: null } })

  return (
    <>
      {calculo.processando && (
        <div className="aviso">Este cálculo está sendo refeito no app. Os números podem mudar quando terminar.</div>
      )}

      <section className="cartao">
        <div className="cabeca">
          <div>
            <h2>{calculo.nome}</h2>
            <p className="sub">
              {[
                calculo.empresa,
                calculo.cnpj && fmtCnpj(calculo.cnpj),
                calculo.regime_tributario && `Regime atual: ${REGIMES[calculo.regime_tributario]}`,
                calculo.periodo_meses && `${calculo.periodo_meses} meses analisados`,
                `${fmtInt(calculo.total_linhas)} linhas`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <a className="botao" href={linkExportar(calculo.id, selecao)} download>
            <Download aria-hidden="true" size={15} /> Baixar CSV do recorte
          </a>
        </div>
        <div className="filtros">
          <Campo rotulo="Regime simulado">
            <select value={regime} onChange={(e) => setRegime(e.target.value)}>
              {calculo.regimes.map((r) => (
                <option key={r} value={r}>
                  {REGIMES[r] ?? r}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Ano">
            <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Campo>
          {capitulo && aba !== "novo" && aba !== "auditoria" && (
            <Campo rotulo="Tributos estimados (IPI e ICMS)">
              <div className="segmentos" role="group" aria-label="Tributos estimados">
                <button aria-pressed={!semEstimados} onClick={() => setSemEstimados(false)}>
                  Incluir
                </button>
                <button aria-pressed={semEstimados} onClick={() => setSemEstimados(true)}>
                  Excluir
                </button>
              </div>
            </Campo>
          )}
          {!capitulo && (
          <>
          <Campo rotulo="Cenário de vendas">
            <select value={cenarioVendas} onChange={(e) => setCenarioVendas(e.target.value)}>
              {calculo.cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Cenário de compras">
            <select value={cenarioCompras} onChange={(e) => setCenarioCompras(e.target.value)}>
              {calculo.cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Notas">
            <div className="segmentos" role="group" aria-label="Notas">
              {(Object.keys(SENTIDOS) as Sentido[]).map((s) => (
                <button key={s} aria-pressed={sentido === s} onClick={() => setSentido(s)}>
                  {s === "ambas" ? "Todas" : s === "saida" ? "Vendas" : "Compras"}
                </button>
              ))}
            </div>
          </Campo>
          </>
          )}
          {capitulo && (
            <p className="sub" style={{ alignSelf: "center", margin: 0 }}>
              {aba === "regime"
                ? `Compara todos os regimes simulados no cálculo; ${ano} fica em destaque. O seletor de regime não se aplica.`
                : aba === "dre" || aba === "fluxo"
                ? `DRE e fluxo de caixa mostram todos os anos da transição; ${ano} fica em destaque.`
                : aba === "auditoria"
                  ? "A auditoria usa os EFDs que você carregar; regime e ano não se aplicam."
                  : aba === "novo"
                  ? `A nota do novo produto é montada para ${ano}; dá para trocar o ano na simulação.`
                  : `Compras e vendas analisadas em ${ano}.`}
            </p>
          )}
          {!capitulo && filtro && (
            <span className="chip">
              {DIMENSOES_RANKING[filtro.dimensao]}: {rotuloValor(filtro.dimensao, filtro.valor)}
              <button aria-label="Remover filtro" onClick={() => setFiltro(null)}>
                <X aria-hidden="true" size={13} />
              </button>
            </span>
          )}
        </div>
      </section>

      <nav className="abas" aria-label="Visões">
        {(Object.keys(ABAS) as Aba[]).map((a) => (
          <button key={a} aria-current={aba === a ? "page" : undefined} onClick={() => trocarAba(a)}>
            {(() => {
              const Icone = ICONES_ABA[a]
              return <Icone aria-hidden="true" size={16} />
            })()}
            {ABAS[a]}
          </button>
        ))}
      </nav>

      {aba === "compras" ? (
        <Compras calculoId={calculo.id} regime={regime} ano={ano} semEstimados={semEstimados} />
      ) : aba === "vendas" ? (
        <Vendas calculoId={calculo.id} regime={regime} ano={ano} semEstimados={semEstimados} />
      ) : aba === "dre" ? (
        <Dre calculoId={calculo.id} regime={regime} periodoMeses={calculo.periodo_meses} ano={ano} semEstimados={semEstimados} />
      ) : aba === "fluxo" ? (
        <Fluxo calculoId={calculo.id} regime={regime} periodoMeses={calculo.periodo_meses} ano={ano} semEstimados={semEstimados} />
      ) : aba === "regime" ? (
        <MelhorRegime calculo={calculo} ano={ano} semEstimados={semEstimados} />
      ) : aba === "auditoria" ? (
        <Auditoria />
      ) : aba === "novo" ? (
        <NovoProduto calculoId={calculo.id} regime={regime} ano={ano} />
      ) : aba === "geral" ? (
        <>
          <Resumo calculoId={calculo.id} selecao={selecao} chave={chave} />

          <div className="grade-2">
            <Serie calculoId={calculo.id} selecao={selecao} chave={chaveSerie} anoAtual={ano} onAno={setAno} />
            <Ranking
              calculoId={calculo.id}
              selecao={selecao}
              chave={chave}
              filtro={filtro ?? null}
              onFiltrar={(dimensao, valor) => setFiltro({ dimensao, valor })}
            />
          </div>

          <TabelaLinhas key={chave} calculoId={calculo.id} selecao={selecao} chave={chave} />
        </>
      ) : (
        <VisaoClassificacao
          calculo={calculo}
          selecao={selecao}
          chave={chave}
          chaveProjecao={chaveSerie}
          onAno={setAno}
        />
      )}
    </>
  )
}

const ABAS = {
  compras: "Compras",
  vendas: "Vendas",
  dre: "DRE",
  fluxo: "Fluxo de caixa",
  regime: "Melhor regime",
  novo: "Novo produto",
  auditoria: "Auditoria EFD",
  geral: "Visão geral",
  classificacao: "Auditor IVA",
} as const
type Aba = keyof typeof ABAS
const ICONES_ABA: Record<Aba, LucideIcon> = {
  compras: ShoppingCart,
  vendas: TrendingUp,
  dre: FileChartColumn,
  fluxo: Wallet,
  regime: Trophy,
  novo: PackagePlus,
  auditoria: ShieldCheck,
  geral: LayoutDashboard,
  classificacao: Scale,
}

/** Rótulo visível e, nos seletores, o mesmo nome para leitores de tela. */
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactElement<{ "aria-label"?: string }> }) {
  const nomeado = children.type === "select" && !children.props["aria-label"] ? cloneElement(children, { "aria-label": rotulo }) : children
  return (
    <div className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {nomeado}
    </div>
  )
}

function linkExportar(id: string, s: Selecao) {
  const q = new URLSearchParams({
    regime: s.recorte.regime,
    ano: String(s.recorte.ano),
    cenario_vendas: s.recorte.cenario_vendas,
    cenario_compras: s.recorte.cenario_compras,
    sentido: s.sentido,
  })
  if (s.filtro) {
    q.set("filtro_dimensao", s.filtro.dimensao)
    if (s.filtro.valor !== null) q.set("filtro_valor", s.filtro.valor)
  }
  return `/api/calculos/${id}/exportar?${q}`
}

function Delta({ antes, depois, modo = "relativo" }: { antes: unknown; depois: unknown; modo?: "relativo" | "pontos" }) {
  const v = modo === "pontos" ? pontos(antes as number, depois as number) : variacao(antes as number, depois as number)
  if (v === null) return null
  const sobe = v > 0
  const texto =
    modo === "pontos"
      ? `${sobe ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`
      : `${sobe ? "+" : ""}${fmtPct(v)}`
  return (
    <span className={`delta ${v === 0 ? "" : sobe ? "sobe" : "desce"}`}>
      {v === 0 ? "" : sobe ? "▲ " : "▼ "}
      {texto}
    </span>
  )
}

function Resumo({ calculoId, selecao, chave }: { calculoId: string; selecao: Selecao; chave: string }) {
  const { dados, erro, carregando } = useBusca(
    (s) => api<{ total: Total | null }>(`/api/calculos/${calculoId}/resumo`, selecao, s),
    [calculoId, chave],
  )
  if (erro) return <Erro erro={erro} />
  const t = dados?.total
  const semDados = t && !t.itens

  const kpis: { rotulo: string; ar: string; dr: string; fmt: (v: never) => string; modo?: "pontos"; mostrar?: boolean }[] = [
    { rotulo: "Tributos", ar: "valor_impostos_ar", dr: "valor_impostos_dr", fmt: fmtBRL },
    { rotulo: "Carga efetiva", ar: "carga_efetiva_ar", dr: "carga_efetiva_dr", fmt: fmtPct, modo: "pontos" },
    { rotulo: "Valor dos itens", ar: "valor_ar", dr: "valor_dr", fmt: fmtBRL },
    { rotulo: "Débito nas vendas", ar: "debito_ar", dr: "debito_dr", fmt: fmtBRL, mostrar: selecao.sentido !== "entrada" },
    { rotulo: "Crédito nas compras", ar: "credito_ar", dr: "credito_dr", fmt: fmtBRL, mostrar: selecao.sentido !== "saida" },
  ]

  return (
    <section className={carregando ? "carregando" : undefined} aria-busy={carregando}>
      {semDados ? (
        <div className="aviso">Nenhuma linha neste recorte (regime, ano, cenários e filtros escolhidos).</div>
      ) : (
        <div className="kpis">
          {kpis
            .filter((k) => k.mostrar !== false)
            .map((k) => (
              <div className="cartao kpi" key={k.rotulo}>
                <div className="rotulo">
                  {k.rotulo} · depois ({selecao.recorte.ano})
                </div>
                <div className="valor">{t ? k.fmt(t[k.dr] as never) : "…"}</div>
                <div className="antes">
                  Antes: {t ? k.fmt(t[k.ar] as never) : "…"} {t && <Delta antes={t[k.ar]} depois={t[k.dr]} modo={k.modo} />}
                </div>
              </div>
            ))}
        </div>
      )}
      {t && !semDados && (
        <p className="sub" style={{ margin: "8px 2px 0" }}>
          {fmtInt(t.itens)} itens de nota · {fmtInt(t.parceiros_distintos)} parceiros · {fmtInt(t.produtos_distintos)} produtos
          no recorte.
        </p>
      )}
    </section>
  )
}

function Serie({
  calculoId,
  selecao,
  chave,
  anoAtual,
  onAno,
}: {
  calculoId: string
  selecao: Selecao
  chave: string
  anoAtual: number
  onAno: (ano: number) => void
}) {
  const [medida, setMedida] = useState<"carga" | "tributos">("carga")
  const { dados, erro, carregando } = useBusca(
    (s) => api<{ serie: PontoSerie[] }>(`/api/calculos/${calculoId}/serie`, selecao, s),
    [calculoId, chave],
  )
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Ano a ano da transição</h2>
          <p className="sub">
            {medida === "carga" ? "Carga efetiva (tributos ÷ valor)" : "Total de tributos"}, sistema atual × reforma.
            Clique num ano para abrir o recorte.
          </p>
        </div>
        <div className="segmentos" role="group" aria-label="Medida">
          <button aria-pressed={medida === "carga"} onClick={() => setMedida("carga")}>
            Carga %
          </button>
          <button aria-pressed={medida === "tributos"} onClick={() => setMedida("tributos")}>
            R$
          </button>
        </div>
      </div>
      {erro != null && <Erro erro={erro} />}
      {!erro && (
        <div className={carregando ? "carregando" : undefined} aria-busy={carregando}>
          {dados ? (
            <GraficoSerie serie={dados.serie} medida={medida} anoAtual={anoAtual} onAno={onAno} />
          ) : (
            <div className="vazio">Carregando os anos…</div>
          )}
        </div>
      )}
    </section>
  )
}
