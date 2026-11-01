"use client"
/*
 * Navegação do painel: menu lateral por objetivo (Resumo → Impacto → Resultado → Conformidade → Simuladores)
 * e a barra de contexto fixa (cálculo, ano, regime, cenário, estimados, operação, copiar link).
 * Filtro que não vale para a aba aparece desabilitado, com o motivo no tooltip, em vez de sumir.
 */
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  FileChartColumn,
  LayoutDashboard,
  Link2,
  Menu,
  PackagePlus,
  Scale,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { Calculo, CalculoDetalhe } from "@pricetax/sdk"
import { REGIMES, type Sentido } from "@/lib/catalogo"
import { fmtCnpj } from "./util"

export const ABAS = {
  geral: "Resumo",
  compras: "Compras",
  vendas: "Vendas",
  dre: "DRE",
  fluxo: "Fluxo de caixa",
  regime: "Melhor regime",
  classificacao: "Auditor IVA",
  auditoria: "Auditoria EFD",
  novo: "Novo produto",
} as const
export type Aba = keyof typeof ABAS

export const ICONES_ABA: Record<Aba, LucideIcon> = {
  geral: LayoutDashboard,
  compras: ShoppingCart,
  vendas: TrendingUp,
  dre: FileChartColumn,
  fluxo: Wallet,
  regime: Trophy,
  classificacao: Scale,
  auditoria: ShieldCheck,
  novo: PackagePlus,
}

export const GRUPOS: { nome: string | null; abas: Aba[] }[] = [
  { nome: null, abas: ["geral"] },
  { nome: "Impacto", abas: ["compras", "vendas"] },
  { nome: "Resultado", abas: ["dre", "fluxo", "regime"] },
  { nome: "Conformidade", abas: ["classificacao", "auditoria"] },
  { nome: "Simuladores", abas: ["novo"] },
]

/** Número da seção, na ordem do menu (01 Resumo, 02 Compras…). */
export const NUMERO_ABA = Object.fromEntries(GRUPOS.flatMap((g) => g.abas).map((a, i) => [a, String(i + 1).padStart(2, "0")])) as Record<Aba, string>

type Aplica = true | string
/** Quais filtros valem em cada aba; o texto é o motivo mostrado quando não vale. */
const NAO_AUDITORIA = "A auditoria usa os EFDs que você carregar; ano, regime e cenário do cálculo não se aplicam."
export const APLICA: Record<Aba, { ano: Aplica; regime: Aplica; cenario: Aplica; estimados: Aplica; notas: boolean }> = {
  geral: { ano: true, regime: true, cenario: true, estimados: "A visão de resumo mostra os valores da API, sem retirar os estimados.", notas: true },
  compras: { ano: true, regime: true, cenario: "Compras usam o cenário Ajustado (o cenário de venda não muda as compras).", estimados: true, notas: false },
  vendas: { ano: true, regime: true, cenario: "Em Vendas, o cenário é escolhido dentro da aba e aparece fixo no topo da seção.", estimados: true, notas: false },
  dre: { ano: true, regime: true, cenario: "A DRE mostra todos os cenários de preço; escolha o cenário dentro da aba.", estimados: true, notas: false },
  fluxo: { ano: true, regime: true, cenario: "O fluxo de caixa mostra todos os cenários de preço; escolha o cenário dentro da aba.", estimados: true, notas: false },
  regime: { ano: true, regime: "Esta aba compara todos os regimes simulados no cálculo.", cenario: "Escolha o cenário dentro da aba.", estimados: true, notas: false },
  classificacao: { ano: true, regime: true, cenario: true, estimados: "O Auditor IVA compara classificações (cClassTrib/CST); os estimados de IPI e ICMS não entram.", notas: true },
  auditoria: { ano: NAO_AUDITORIA, regime: NAO_AUDITORIA, cenario: NAO_AUDITORIA, estimados: NAO_AUDITORIA, notas: false },
  novo: { ano: true, regime: true, cenario: "O simulador monta a nota de um produto novo; não usa os cenários do cálculo.", estimados: "O simulador parte do preço líquido informado; não usa os estimados.", notas: false },
}

/* ───────────────────────── Menu lateral ───────────────────────── */

export function MenuLateral({
  aba,
  onAba,
  aberto,
  onFechar,
  recolhido,
  onRecolher,
  rodape,
}: {
  aba: Aba
  onAba: (a: Aba) => void
  aberto: boolean
  onFechar: () => void
  recolhido: boolean
  onRecolher: () => void
  rodape?: React.ReactNode
}) {
  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar()
    document.addEventListener("keydown", tecla)
    return () => document.removeEventListener("keydown", tecla)
  }, [aberto, onFechar])
  return (
    <>
      {aberto && <div className="lateral-fundo" onClick={onFechar} aria-hidden />}
      <aside className={`lateral${aberto ? " aberto" : ""}${recolhido ? " recolhido" : ""}`} aria-label="Menu do painel">
        <div className="lateral-marca">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-pricetax.png" alt="PriceTax" className="logo" />
          <button className="lateral-fechar" onClick={onFechar} aria-label="Fechar menu">
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav aria-label="Visões" className="lateral-nav">
          {GRUPOS.map((g, i) => (
            <div key={i} className="lateral-grupo">
              {g.nome && <span className="lateral-grupo-nome">{g.nome}</span>}
              {g.abas.map((a) => {
                const Icone = ICONES_ABA[a]
                return (
                  <button
                    key={a}
                    aria-current={aba === a ? "page" : undefined}
                    onClick={() => {
                      onAba(a)
                      onFechar()
                    }}
                    title={recolhido ? ABAS[a] : undefined}
                  >
                    <Icone size={17} aria-hidden />
                    <span className="lateral-rotulo">{ABAS[a]}</span>
                    <span className="lateral-num" aria-hidden>
                      {NUMERO_ABA[a]}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="lateral-rodape">
          {rodape}
          <button className="lateral-recolher" onClick={onRecolher} aria-label={recolhido ? "Expandir menu" : "Recolher menu"}>
            {recolhido ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
            <span className="lateral-rotulo">Recolher menu</span>
          </button>
        </div>
      </aside>
    </>
  )
}

/* ───────────────────────── Barra de contexto ───────────────────────── */

/** Um filtro da barra: rótulo + controle; desabilitado com o motivo quando não vale para a aba. */
function Filtro({ rotulo, aplica, children }: { rotulo: string; aplica: Aplica; children: React.ReactNode }) {
  const motivo = aplica === true ? null : aplica
  return (
    <div className={`ctx-filtro${motivo ? " desabilitado" : ""}`} title={motivo ?? undefined}>
      <span className="ctx-rotulo">{rotulo}</span>
      <fieldset disabled={!!motivo} aria-describedby={motivo ? undefined : undefined}>
        <legend className="sr-only">{rotulo}</legend>
        {children}
      </fieldset>
      {motivo && <span className="sr-only">Não se aplica: {motivo}</span>}
    </div>
  )
}

export type Contexto = {
  calculo: CalculoDetalhe
  calculos: Calculo[] | null
  onCalculo: (id: string | null) => void
  aba: Aba
  anos: number[]
  ano: number
  onAno: (a: number) => void
  regime: string
  onRegime: (r: string) => void
  cenarioVendas: string
  onCenarioVendas: (c: string) => void
  cenarioCompras: string
  onCenarioCompras: (c: string) => void
  semEstimados: boolean
  onEstimados: (sem: boolean) => void
  sentido: Sentido
  onSentido: (s: Sentido) => void
  extra?: React.ReactNode
  onMenu: () => void
}

export function BarraContexto(c: Contexto) {
  const ap = APLICA[c.aba]
  const [copiado, setCopiado] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {}
  }
  const nomeCen = (id: string) => c.calculo.cenarios.find((x) => x.id === id)?.nome ?? id
  const resumo = [String(c.ano), REGIMES[c.regime] ?? c.regime, ap.cenario === true ? nomeCen(c.cenarioVendas) : null].filter(Boolean).join(" · ")
  return (
    <header className="ctx" aria-label="Contexto do cálculo">
      <div className="ctx-linha">
        <button className="ctx-menu" onClick={c.onMenu} aria-label="Abrir menu">
          <Menu size={20} aria-hidden />
        </button>
        <div className="ctx-calculo">
          <select aria-label="Cálculo" value={c.calculo.id} onChange={(e) => c.onCalculo(e.target.value || null)}>
            {!c.calculos?.some((x) => x.id === c.calculo.id) && <option value={c.calculo.id}>{c.calculo.nome}</option>}
            {c.calculos?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
                {x.empresa ? ` — ${x.empresa}` : ""}
              </option>
            ))}
          </select>
          <span className="ctx-empresa">
            {[c.calculo.empresa, c.calculo.cnpj && fmtCnpj(c.calculo.cnpj), c.calculo.regime_tributario && `atual: ${REGIMES[c.calculo.regime_tributario]}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <button className="ctx-resumo" onClick={() => setFiltrosAbertos(!filtrosAbertos)} aria-expanded={filtrosAbertos} aria-controls="ctx-filtros">
          <SlidersHorizontal size={15} aria-hidden /> {resumo}
        </button>
        <div id="ctx-filtros" className={`ctx-filtros${filtrosAbertos ? " aberto" : ""}`}>
          <Filtro rotulo="Ano" aplica={ap.ano}>
            <select aria-label="Ano" value={c.ano} onChange={(e) => c.onAno(Number(e.target.value))}>
              {c.anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Filtro>
          <Filtro rotulo="Regime" aplica={ap.regime}>
            <select aria-label="Regime simulado" value={c.regime} onChange={(e) => c.onRegime(e.target.value)}>
              {c.calculo.regimes.map((r) => (
                <option key={r} value={r}>
                  {REGIMES[r] ?? r}
                </option>
              ))}
            </select>
          </Filtro>
          <Filtro rotulo="Cenário (vendas · compras)" aplica={ap.cenario}>
            <span className="ctx-par">
              <select aria-label="Cenário de vendas" value={c.cenarioVendas} onChange={(e) => c.onCenarioVendas(e.target.value)}>
                {c.calculo.cenarios.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
              <select aria-label="Cenário de compras" value={c.cenarioCompras} onChange={(e) => c.onCenarioCompras(e.target.value)}>
                {c.calculo.cenarios.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
              </select>
            </span>
          </Filtro>
          <Filtro rotulo="Estimados (IPI e ICMS)" aplica={ap.estimados}>
            <span className="segmentos" role="group" aria-label="Tributos estimados">
              <button aria-pressed={!c.semEstimados} onClick={() => c.onEstimados(false)}>
                Incluir
              </button>
              <button aria-pressed={c.semEstimados} onClick={() => c.onEstimados(true)}>
                Excluir
              </button>
            </span>
          </Filtro>
          {ap.notas && (
            <Filtro rotulo="Operação" aplica>
              <span className="segmentos" role="group" aria-label="Operação">
                {(["ambas", "saida", "entrada"] as Sentido[]).map((s) => (
                  <button key={s} aria-pressed={c.sentido === s} onClick={() => c.onSentido(s)}>
                    {s === "ambas" ? "Todas" : s === "saida" ? "Vendas" : "Compras"}
                  </button>
                ))}
              </span>
            </Filtro>
          )}
          {c.extra}
        </div>
        <button className="ctx-link botao" onClick={copiar} title="Copia o endereço desta visão, com a aba e os filtros">
          {copiado ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
          <span className="ctx-link-texto">{copiado ? "Link copiado" : "Copiar link"}</span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Link desta visão copiado." : ""}
      </span>
    </header>
  )
}
