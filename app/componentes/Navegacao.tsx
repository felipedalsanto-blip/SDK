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

/** Uma pílula de filtro: rótulo discreto + valor em destaque. Desabilitada com o motivo quando não vale para a aba. */
function Pilula<T extends string | number>({
  rotulo,
  aplica,
  valor,
  opcoes,
  onChange,
  dica,
}: {
  rotulo: string
  aplica: Aplica
  valor: T
  opcoes: [T, string][]
  onChange: (v: T) => void
  dica?: string
}) {
  const motivo = aplica === true ? null : aplica
  const id = `pilula-${rotulo.replace(/\W+/g, "-").toLowerCase()}`
  return (
    <span className={`pilula${motivo ? " desabilitada" : ""}`} title={motivo ? `Não se aplica a esta aba: ${motivo}` : dica}>
      <label htmlFor={id} className="pilula-rotulo">
        {rotulo}
        {motivo && <span aria-hidden> ⊘</span>}
      </label>
      <select id={id} value={String(valor)} disabled={!!motivo} onChange={(e) => onChange(opcoes.find(([v]) => String(v) === e.target.value)![0])}>
        {opcoes.map(([v, nome]) => (
          <option key={String(v)} value={String(v)}>
            {nome}
          </option>
        ))}
      </select>
      {motivo && <span className="sr-only">Não se aplica: {motivo}</span>}
    </span>
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
  onMenu: () => void
}

export function BarraContexto(c: Contexto) {
  const ap = APLICA[c.aba]
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {}
  }
  const cenarios = c.calculo.cenarios.map((x) => [x.id, x.nome] as [string, string])
  const empresa = c.calculo.empresa ?? c.calculo.nome
  return (
    <header className="ctx" aria-label="Contexto do cálculo">
      <div className="ctx-topo">
        <button className="ctx-menu" onClick={c.onMenu} aria-label="Abrir menu">
          <Menu size={20} aria-hidden />
        </button>
        <div className="ctx-id">
          <span className="ctx-empresa" title={empresa}>
            {empresa}
          </span>
          <span className="ctx-meta">
            {c.calculo.cnpj && <span>{fmtCnpj(c.calculo.cnpj)}</span>}
            {c.calculo.regime_tributario && <span className="ctx-selo">Regime atual: {REGIMES[c.calculo.regime_tributario]}</span>}
            <label className="ctx-trocar">
              <span className="sr-only">Cálculo</span>
              <select aria-label="Cálculo" value={c.calculo.id} onChange={(e) => c.onCalculo(e.target.value || null)}>
                {!c.calculos?.some((x) => x.id === c.calculo.id) && <option value={c.calculo.id}>{c.calculo.nome}</option>}
                {c.calculos?.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                    {x.empresa && x.empresa !== x.nome ? ` — ${x.empresa}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </span>
        </div>
        <button className="ctx-link botao" onClick={copiar} title="Copia o endereço desta visão, com a aba e os filtros">
          {copiado ? <Check size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
          <span className="ctx-link-texto">{copiado ? "Link copiado" : "Copiar link"}</span>
        </button>
      </div>
      <div className="ctx-pilulas" role="group" aria-label="Filtros do cálculo" tabIndex={0}>
        <Pilula rotulo="Ano" aplica={ap.ano} valor={c.ano} opcoes={c.anos.map((a) => [a, String(a)])} onChange={c.onAno} />
        <Pilula rotulo="Regime" aplica={ap.regime} valor={c.regime} opcoes={c.calculo.regimes.map((r) => [r, REGIMES[r] ?? r])} onChange={c.onRegime} />
        <Pilula rotulo="Cenário venda" aplica={ap.cenario} valor={c.cenarioVendas} opcoes={cenarios} onChange={c.onCenarioVendas} />
        <Pilula rotulo="Cenário compra" aplica={ap.cenario} valor={c.cenarioCompras} opcoes={cenarios} onChange={c.onCenarioCompras} />
        <Pilula
          rotulo="Estimados"
          aplica={ap.estimados}
          dica="IPI e ICMS estimados na cadeia pela PriceTax (não vieram no documento)."
          valor={c.semEstimados ? "fora" : "dentro"}
          opcoes={[
            ["dentro", "Incluídos"],
            ["fora", "Excluídos"],
          ]}
          onChange={(v) => c.onEstimados(v === "fora")}
        />
        {ap.notas && (
          <Pilula
            rotulo="Operação"
            aplica
            valor={c.sentido}
            opcoes={[
              ["ambas", "Todas"],
              ["saida", "Vendas"],
              ["entrada", "Compras"],
            ]}
            onChange={c.onSentido}
          />
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? "Link desta visão copiado." : ""}
      </span>
    </header>
  )
}
