"use client"
/*
 * Auditor IVA: perda e oportunidade de IBS/CBS por tipo de erro, até a nota. Tudo é derivado da análise
 * de classificação (cClassTrib/CST da nota × calculado) e da tabela oficial da SVRS: nada inventado.
 * Cores: vermelho = perda/risco, verde = oportunidade, cinza = sem estimativa.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Database, Download, ExternalLink, FileSearch, Info, Lightbulb, Target, X } from "lucide-react"
import {
  ORDEM_TIPOS,
  TIPOS_ERRO,
  cfopNaoOneroso,
  type AnaliseClassificacao,
  type DetalheNotas,
  type LadoClass,
  type NotaDivergente,
  type ParDivergente,
  type PorTipo,
  type TipoErro,
} from "@/lib/classificacao"
import type { Selecao } from "@/lib/catalogo"
import { Erro } from "./comum"
import { api, fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, fmtPct, useBusca, useLargura } from "./util"

export const SENTIDO = { entrada: "Compra", saida: "Venda" } as const

/** Glossário curto dos termos da tela (tooltip). */
export const TERMOS = {
  cclass: "cClassTrib: código de classificação tributária do IBS/CBS no item da nota (tabela oficial da SVRS).",
  cst: "CST do IBS/CBS: situação tributária (tributada, redução, isenção, imunidade, diferimento…).",
  redutor: "Redutor: percentual de redução da alíquota previsto na LC 214/2025 (ex.: 30%, 60%, 100%).",
  glosa: "Glosa: o Fisco recusa um crédito tomado a maior; vira tributo a pagar com multa e juros.",
  perda: "Perda (imposto): tributo a recolher nas vendas ou crédito em risco de glosa nas compras.",
  oportunidade: "Oportunidade (imposto): tributo destacado a mais nas vendas ou crédito a recuperar nas compras.",
  afetado: "Valor de notas afetado: soma do valor dos itens com classificação divergente. Não é imposto.",
} as const

/** Rótulo com ícone e explicação no tooltip (também acessível por teclado). */
export function Termo({ texto, dica }: { texto: string; dica: string }) {
  return (
    <span className="iva-termo" tabIndex={0} title={dica} aria-label={`${texto}. ${dica}`}>
      {texto} <Info size={12} aria-hidden />
    </span>
  )
}

/** Valor abreviado com o exato no tooltip. */
export function Valor({ v, classe }: { v: number; classe?: string }) {
  return (
    <span className={classe} title={fmtBRL(v)}>
      {Math.abs(v) >= 100_000 ? fmtBRLCurto(v) : fmtBRL(v)}
    </span>
  )
}

export function Impacto({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined) return <span className="iva-sem">sem estimativa</span>
  if (Math.abs(valor) < 0.005) return <span className="iva-sem">sem impacto</span>
  return (
    <span className={valor < 0 ? "perda" : "oport"} title={fmtBRL(valor)}>
      {valor < 0 ? "▼ " : "▲ "}
      {fmtBRL(Math.abs(valor))}
    </span>
  )
}

export function ChipTipo({ tipo }: { tipo: TipoErro }) {
  return <span className={`iva-chip iva-chip-${tipo}`}>{TIPOS_ERRO[tipo].curto}</span>
}

export function Cfops({ cfops }: { cfops: string[] }) {
  if (!cfops.length) return <span className="iva-sem">—</span>
  const suspeito = cfops.some(cfopNaoOneroso)
  return (
    <span className="iva-cfops">
      {cfops.slice(0, 3).map((c) => (
        <span key={c} className={`codigo${cfopNaoOneroso(c) ? " iva-cfop-alerta" : ""}`}>
          {c}
        </span>
      ))}
      {cfops.length > 3 && <span className="nome-codigo">+{cfops.length - 3}</span>}
      {suspeito && (
        <span className="iva-fp" title="CFOP de remessa, bonificação, amostra, transferência ou outras: pode ser falso positivo.">
          <AlertTriangle size={12} aria-hidden /> possível falso positivo
        </span>
      )}
    </span>
  )
}

/** A análise restrita a um tipo de erro: pares filtrados, itens e fornecedores com os valores daquele tipo. */
export function filtrarPorTipo(a: AnaliseClassificacao, tipo: TipoErro | null): AnaliseClassificacao {
  if (!tipo) return a
  const doTipo = <T extends { porTipo: Partial<Record<TipoErro, PorTipo>>; itens: number; valor: number; perda: number; ganho: number }>(xs: T[]) =>
    xs.filter((x) => x.porTipo[tipo]).map((x) => ({ ...x, ...pick(x.porTipo[tipo]!) }))
  const pt = a.resumo.porTipo[tipo]
  return {
    ...a,
    pares: a.pares.filter((p) => p.tipo === tipo),
    itens: doTipo(a.itens),
    fornecedores: a.fornecedores && doTipo(a.fornecedores),
    resumo: { ...a.resumo, perda: pt.perda, ganho: pt.ganho, porSituacao: { ...a.resumo.porSituacao, divergente: { itens: pt.itens, valor: pt.valor } } },
  }
}
const pick = (p: PorTipo) => ({ itens: p.itens, valor: p.valor, perda: p.perda, ganho: p.ganho })

export type Quadrantes = { ganhoVenda: number; ganhoCompra: number; perdaVenda: number; perdaCompra: number }

export function quadrantes(pares: ParDivergente[]): Quadrantes {
  const q: Quadrantes = { ganhoVenda: 0, ganhoCompra: 0, perdaVenda: 0, perdaCompra: 0 }
  for (const p of pares) {
    const v = p.estimativa?.impacto ?? 0
    if (v > 0) p.sentido === "saida" ? (q.ganhoVenda += v) : (q.ganhoCompra += v)
    else if (v < 0) p.sentido === "saida" ? (q.perdaVenda -= v) : (q.perdaCompra -= v)
  }
  return q
}

export const rotuloPar = (p: ParDivergente) => `${p.nota.codigo ?? "sem código"} → ${p.calculado.codigo ?? "sem código"}`

/* ───────────────────────── Topo: resumo executivo ───────────────────────── */

export function Resumo({
  a,
  completo,
  tipo,
  onTipo,
}: {
  a: AnaliseClassificacao
  completo: AnaliseClassificacao
  tipo: TipoErro | null
  onTipo: (t: TipoErro | null) => void
}) {
  const r = a.resumo
  const saldo = r.ganho - r.perda
  return (
    <section className="cartao iva-resumo" aria-labelledby="iva-resumo-titulo">
      <div className="cabeca">
        <div>
          <h2 id="iva-resumo-titulo">
            Resumo {a.ano}
            {tipo && <> · {TIPOS_ERRO[tipo].nome}</>}
          </h2>
          <p className="sub">IBS + CBS pela classificação da nota × pela classificação correta, no recorte escolhido.</p>
        </div>
        <span className="iva-selo" title="Estimativa para priorizar a revisão, não um parecer.">
          <Info size={14} aria-hidden /> estimativa, não parecer
        </span>
      </div>

      <div className="iva-tres">
        <div className="iva-numero iva-perda">
          <Termo texto="Perda (imposto)" dica={TERMOS.perda} />
          <strong className={r.perda ? "perda" : "iva-sem"}>
            <Valor v={r.perda} />
          </strong>
          <Quebra a={a} lado="perda" />
        </div>
        <div className="iva-numero iva-oport">
          <Termo texto="Oportunidade (imposto)" dica={TERMOS.oportunidade} />
          <strong className={r.ganho ? "oport" : "iva-sem"}>
            <Valor v={r.ganho} />
          </strong>
          <Quebra a={a} lado="ganho" />
        </div>
        <div className="iva-numero iva-neutro">
          <Termo texto="Valor de notas afetado" dica={TERMOS.afetado} />
          <strong>
            <Valor v={r.porSituacao.divergente.valor} />
          </strong>
          <span className="sub">{fmtInt(r.porSituacao.divergente.itens)} itens divergentes · valor de nota, não imposto</span>
        </div>
      </div>

      <div className="iva-saldo-linha">
        Saldo:{" "}
        <strong className={saldo < 0 ? "perda" : saldo > 0 ? "oport" : "iva-sem"}>
          {saldo < 0 ? "▼ " : saldo > 0 ? "▲ " : ""}
          <Valor v={Math.abs(saldo)} />
        </strong>
        <span className="sub">
          {saldo < 0 ? " a classificação das notas custa mais do que devolve." : saldo > 0 ? " há mais a recuperar do que a corrigir." : ""}
        </span>
      </div>

      <BarraTipos a={completo} tipo={tipo} onTipo={onTipo} />
      <Qualidade a={completo} />
    </section>
  )
}

function Quebra({ a, lado }: { a: AnaliseClassificacao; lado: "perda" | "ganho" }) {
  const q = quadrantes(a.pares)
  const [v, c] = lado === "perda" ? [q.perdaVenda, q.perdaCompra] : [q.ganhoVenda, q.ganhoCompra]
  if (!v && !c) return <span className="sub">nada estimado</span>
  return (
    <span className="sub">
      vendas <Valor v={v} /> · compras <Valor v={c} />
    </span>
  )
}

/** Barra empilhada "Perda por tipo de erro": clicar filtra a página. */
function BarraTipos({ a, tipo, onTipo }: { a: AnaliseClassificacao; tipo: TipoErro | null; onTipo: (t: TipoErro | null) => void }) {
  const tipos = ORDEM_TIPOS.filter((t) => TIPOS_ERRO[t].deteccao !== "sem_dados")
  const total = tipos.reduce((s, t) => s + a.resumo.porTipo[t].perda, 0)
  const semDados = ORDEM_TIPOS.filter((t) => TIPOS_ERRO[t].deteccao === "sem_dados")
  return (
    <div className="iva-barra-tipos">
      <div className="iva-barra-tipos-cabeca">
        <h3>Perda por tipo de erro</h3>
        {tipo && (
          <button className="botao" onClick={() => onTipo(null)}>
            <X size={14} aria-hidden /> Limpar filtro
          </button>
        )}
      </div>
      {total > 0 ? (
        <div className="iva-pilha" role="group" aria-label="Perda por tipo de erro; clique para filtrar">
          {tipos
            .filter((t) => a.resumo.porTipo[t].perda > 0)
            .map((t) => {
              const v = a.resumo.porTipo[t].perda
              const pct = (v / total) * 100
              return (
                <button
                  key={t}
                  className={`iva-pilha-seg iva-seg-${t}`}
                  style={{ flex: `${pct} 1 0` }}
                  aria-pressed={tipo === t}
                  onClick={() => onTipo(tipo === t ? null : t)}
                  title={`${TIPOS_ERRO[t].nome}: ${fmtBRL(v)} (${pct.toFixed(0)}%)`}
                >
                  {pct >= 12 && (
                    <span>
                      {TIPOS_ERRO[t].curto} · {fmtBRLCurto(v)}
                    </span>
                  )}
                </button>
              )
            })}
        </div>
      ) : (
        <p className="sub">Nenhuma perda estimada neste recorte.</p>
      )}
      <div className="iva-legenda-tipos">
        {tipos.map((t) => (
          <button key={t} className="iva-leg" aria-pressed={tipo === t} onClick={() => onTipo(tipo === t ? null : t)}>
            <i className={`iva-seg-${t}`} aria-hidden /> {TIPOS_ERRO[t].curto}
            <span className="nome-codigo"> {fmtBRLCurto(a.resumo.porTipo[t].perda)}</span>
          </button>
        ))}
        <span className="iva-sem" title={semDados.map((t) => `${TIPOS_ERRO[t].nome}: falta ${TIPOS_ERRO[t].falta}`).join("\n")}>
          ░ sem dados: {semDados.map((t) => TIPOS_ERRO[t].curto).join(" · ")}
        </span>
      </div>
    </div>
  )
}

function Qualidade({ a }: { a: AnaliseClassificacao }) {
  const r = a.resumo
  const totalItens = r.itens - r.porSituacao.sem_calculo.itens
  const comCclass = totalItens > 0 ? (totalItens - r.porSituacao.sem_nota.itens) / totalItens : null
  const itensCst = a.cst.reduce((s, c) => s + c.itens, 0)
  const comCst = itensCst > 0 ? a.cst.filter((c) => c.nota).reduce((s, c) => s + c.itens, 0) / itensCst : null
  const ruim = (comCclass ?? 1) < 0.95
  return (
    <div className={`iva-qualidade${ruim ? " iva-qualidade-alerta" : ""}`}>
      <Database size={18} aria-hidden />
      <div className="iva-qualidade-titulo">
        <strong>Qualidade dos dados</strong>
        <span className="sub">Sem classificação na nota não há como comparar: o ganho ou a perda desses itens fica de fora.</span>
      </div>
      <div className="iva-qualidade-num">
        <strong>{comCclass === null ? "—" : fmtPct(comCclass)}</strong>
        <span className="sub">itens com cClassTrib</span>
      </div>
      <div className="iva-qualidade-num">
        <strong>{comCst === null ? "—" : fmtPct(comCst)}</strong>
        <span className="sub">itens com CST</span>
      </div>
      <div className="iva-qualidade-num">
        <strong className={r.porSituacao.sem_nota.valor ? "perda" : undefined}>
          <Valor v={r.porSituacao.sem_nota.valor} />
        </strong>
        <span className="sub">sem classificação ({fmtInt(r.porSituacao.sem_nota.itens)} itens)</span>
      </div>
    </div>
  )
}

/* ───────────────────────── Tipos de erro ───────────────────────── */

export function TiposErro({
  a,
  tipo,
  onTipo,
  onVerNotas,
}: {
  a: AnaliseClassificacao
  tipo: TipoErro | null
  onTipo: (t: TipoErro | null) => void
  onVerNotas: (t: TipoErro) => void
}) {
  const ativos = ORDEM_TIPOS.filter((t) => TIPOS_ERRO[t].deteccao !== "sem_dados" && a.resumo.porTipo[t].itens > 0)
  const vazios = ORDEM_TIPOS.filter((t) => TIPOS_ERRO[t].deteccao !== "sem_dados" && a.resumo.porTipo[t].itens === 0)
  const semDados = ORDEM_TIPOS.filter((t) => TIPOS_ERRO[t].deteccao === "sem_dados")
  return (
    <section className="cartao" aria-labelledby="iva-tipos-titulo">
      <div className="cabeca">
        <div>
          <h2 id="iva-tipos-titulo">Por tipo de erro</h2>
          <p className="sub">Clique num tipo para filtrar a página inteira. “Inferido”: deduzido do código da nota na tabela oficial.</p>
        </div>
      </div>
      <div className="iva-tipos">
        {ativos.map((t) => {
          const p = a.resumo.porTipo[t]
          const info = TIPOS_ERRO[t]
          return (
            <article key={t} className={`iva-tipo iva-borda-${t}${tipo === t ? " ativo" : ""}`}>
              <button className="iva-tipo-corpo" aria-pressed={tipo === t} onClick={() => onTipo(tipo === t ? null : t)}>
                <span className="iva-tipo-nome">
                  {info.nome}
                  {info.deteccao === "inferido" && <span className="etiqueta">inferido</span>}
                </span>
                <span className="iva-tipo-valores">
                  {p.perda > 0 && (
                    <span>
                      <span className="sub">Perda</span> <Valor v={p.perda} classe="perda" />
                    </span>
                  )}
                  {p.ganho > 0 && (
                    <span>
                      <span className="sub">Oportunidade</span> <Valor v={p.ganho} classe="oport" />
                    </span>
                  )}
                  {!p.perda && !p.ganho && <span className="iva-sem">sem impacto em R$</span>}
                </span>
                <span className="sub">
                  {fmtInt(p.itens)} itens · {fmtInt(p.pares)} pares · <Valor v={p.valor} /> em notas
                </span>
                <span className="sub iva-tipo-desc">{info.descricao}</span>
              </button>
              <button className="botao iva-ver" onClick={() => onVerNotas(t)}>
                <FileSearch size={14} aria-hidden /> Ver notas
              </button>
            </article>
          )
        })}
      </div>
      <p className="iva-linha-discreta">
        {vazios.length > 0 && <>Sem ocorrência: {vazios.map((t) => TIPOS_ERRO[t].curto).join(" · ")}. </>}
        <span>
          Sem dados ainda:{" "}
          {semDados.map((t, i) => (
            <span key={t}>
              {i > 0 && " · "}
              <span className="iva-termo" tabIndex={0} title={`Falta na API: ${TIPOS_ERRO[t].falta}`}>
                {TIPOS_ERRO[t].nome} <Info size={12} aria-hidden />
              </span>
            </span>
          ))}
          .
        </span>
      </p>
    </section>
  )
}

/* ───────────────────────── Cascata ───────────────────────── */

const ALTURA = 250
const M = { topo: 24, dir: 12, base: 52, esq: 12 }

export function Cascata({ a }: { a: AnaliseClassificacao }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const q = quadrantes(a.pares)
  const passos = [
    { rotulo: ["Oportunidade", "vendas"], delta: q.ganhoVenda },
    { rotulo: ["Oportunidade", "compras"], delta: q.ganhoCompra },
    { rotulo: ["Perda", "vendas"], delta: -q.perdaVenda },
    { rotulo: ["Perda", "compras"], delta: -q.perdaCompra },
  ].filter((p) => Math.abs(p.delta) >= 0.005)
  if (!passos.length) return null
  let corrente = 0
  const barras = passos.map((p) => {
    const de = corrente
    corrente += p.delta
    return { ...p, de, ate: corrente }
  })
  const liquido = corrente
  const valores = [0, ...barras.flatMap((b) => [b.de, b.ate])]
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const span = max - min || 1
  const w = Math.max(largura, 280)
  const iw = w - M.esq - M.dir
  const ih = ALTURA - M.topo - M.base
  const y = (v: number) => M.topo + ((max - v) / span) * ih
  const n = barras.length + 1
  const banda = iw / n
  const bw = Math.min(56, banda * 0.56)
  const xc = (i: number) => M.esq + banda * (i + 0.5)
  const cor = (v: number) => (v >= 0 ? "var(--iva-oport)" : "var(--iva-perda)")
  const Rotulo = ({ i, linhas, forte }: { i: number; linhas: string[]; forte?: boolean }) => (
    <text x={xc(i)} y={ALTURA - M.base + 16} textAnchor="middle" className="iva-eixo" style={forte ? { fontWeight: 600 } : undefined}>
      {linhas.map((l, k) => (
        <tspan key={k} x={xc(i)} dy={k ? 13 : 0}>
          {l}
        </tspan>
      ))}
    </text>
  )
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Do saldo de oportunidades às perdas</h2>
          <p className="sub">Quanto cada lado soma ou tira do resultado de IBS + CBS em {a.ano}.</p>
        </div>
      </div>
      <div className="grafico" ref={ref}>
        <svg height={ALTURA} role="img" aria-label={`Cascata: saldo ${fmtBRL(liquido)}`}>
          <line x1={M.esq} x2={w - M.dir} y1={y(0)} y2={y(0)} stroke="var(--text-muted)" />
          {barras.map((b, i) => {
            const topo = y(Math.max(b.de, b.ate))
            return (
              <g key={i}>
                {i > 0 && <line x1={xc(i - 1) + bw / 2} x2={xc(i) - bw / 2} y1={y(b.de)} y2={y(b.de)} stroke="var(--border)" strokeDasharray="3 3" />}
                <rect x={xc(i) - bw / 2} y={topo} width={bw} height={Math.max(1, Math.abs(y(b.de) - y(b.ate)))} rx={3} fill={cor(b.delta)}>
                  <title>{`${b.rotulo.join(" ")}: ${fmtBRL(b.delta)}`}</title>
                </rect>
                <text x={xc(i)} y={topo - 6} textAnchor="middle" className="iva-valor-barra">
                  {b.delta >= 0 ? "+" : "−"}
                  {fmtBRLCurto(Math.abs(b.delta))}
                </text>
                <Rotulo i={i} linhas={b.rotulo} />
              </g>
            )
          })}
          <line x1={xc(n - 2) + bw / 2} x2={xc(n - 1) - bw / 2} y1={y(liquido)} y2={y(liquido)} stroke="var(--border)" strokeDasharray="3 3" />
          <rect
            x={xc(n - 1) - bw / 2}
            y={y(Math.max(0, liquido))}
            width={bw}
            height={Math.max(1, Math.abs(y(0) - y(liquido)))}
            rx={3}
            fill={cor(liquido)}
            stroke="var(--text-primary)"
            strokeWidth={1.5}
          >
            <title>{`Saldo: ${fmtBRL(liquido)}`}</title>
          </rect>
          <text x={xc(n - 1)} y={y(Math.max(0, liquido)) - 6} textAnchor="middle" className="iva-valor-barra" style={{ fontWeight: 700 }}>
            {liquido < 0 ? "−" : ""}
            {fmtBRLCurto(Math.abs(liquido))}
          </text>
          <Rotulo i={n - 1} linhas={["Saldo"]} forte />
        </svg>
      </div>
    </section>
  )
}

/* ───────────────────────── Plano de ação ───────────────────────── */

type AcaoCard = {
  id: string
  tipo: TipoErro
  titulo: string
  responsavel: string
  perda: number
  ganho: number
  itens: number
  alvo: Alvo
}

export function PlanoAcao({ a, onVerNotas }: { a: AnaliseClassificacao; onVerNotas: (alvo: Alvo, titulo: string) => void }) {
  const cards: AcaoCard[] = []
  for (const t of ORDEM_TIPOS) {
    for (const s of ["saida", "entrada"] as const) {
      const ps = a.pares.filter((p) => p.tipo === t && p.sentido === s)
      if (!ps.length) continue
      const perda = ps.reduce((x, p) => x + Math.max(0, -(p.estimativa?.impacto ?? 0)), 0)
      const ganho = ps.reduce((x, p) => x + Math.max(0, p.estimativa?.impacto ?? 0), 0)
      if (perda < 0.005 && ganho < 0.005) continue
      cards.push({
        id: `${t}-${s}`,
        tipo: t,
        titulo: `${TIPOS_ERRO[t].nome} em ${s === "saida" ? "vendas" : "compras"}`,
        responsavel: s === "entrada" ? "Fornecedor + Fiscal interno" : TIPOS_ERRO[t].responsavel,
        perda,
        ganho,
        itens: ps.reduce((x, p) => x + p.itens, 0),
        alvo: { tipo: t, sentido: s },
      })
    }
  }
  for (const f of (a.fornecedores ?? []).filter((f) => f.perda > 0).slice(0, 2)) {
    cards.push({
      id: `forn-${f.cnpj}`,
      tipo: (Object.entries(f.porTipo).sort((x, y) => (y[1]?.perda ?? 0) - (x[1]?.perda ?? 0))[0]?.[0] as TipoErro) ?? "classificacao",
      titulo: `Cobrar ${f.razaoSocial ?? (f.cnpj ? fmtCnpj(f.cnpj) : "fornecedor")}`,
      responsavel: "Fornecedor",
      perda: f.perda,
      ganho: f.ganho,
      itens: f.itens,
      alvo: { cnpj: f.cnpj, sentido: "entrada" },
    })
  }
  cards.sort((x, y) => y.perda + y.ganho - (x.perda + x.ganho))
  const semNota = a.resumo.porSituacao.sem_nota
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2 className="iva-titulo-icone">
            <Target size={18} aria-hidden /> Plano de ação
          </h2>
          <p className="sub">Ordenado pelo dinheiro em jogo em {a.ano}.</p>
        </div>
      </div>
      <div className="iva-acoes">
        {cards.slice(0, 6).map((c) => (
          <article key={c.id} className={`iva-acao iva-borda-${c.tipo}`}>
            <div className="iva-acao-topo">
              <ChipTipo tipo={c.tipo} />
              <span className="iva-resp">Responsável: {c.responsavel}</span>
            </div>
            <h3>{c.titulo}</h3>
            <div className="iva-acao-num">
              {c.perda > 0 && <Valor v={c.perda} classe="perda" />}
              {c.perda > 0 && c.ganho > 0 && <span className="sub"> · </span>}
              {c.ganho > 0 && <Valor v={c.ganho} classe="oport" />}
              <span className="sub"> · {fmtInt(c.itens)} itens</span>
            </div>
            <div className="iva-acao-botoes">
              <button className="botao" onClick={() => onVerNotas(c.alvo, c.titulo)}>
                <FileSearch size={14} aria-hidden /> Ver notas
              </button>
            </div>
          </article>
        ))}
        {semNota.itens > 0 && (
          <article className="iva-acao iva-borda-dados">
            <div className="iva-acao-topo">
              <span className="iva-chip">Dados</span>
              <span className="iva-resp">Responsável: Cadastro de produto / ERP</span>
            </div>
            <h3>Completar o cClassTrib nas notas</h3>
            <div className="iva-acao-num">
              <Valor v={semNota.valor} /> <span className="sub">em notas sem código · {fmtInt(semNota.itens)} itens fora da comparação</span>
            </div>
          </article>
        )}
      </div>
      <p className="sub iva-dica">
        <Lightbulb size={14} aria-hidden /> Exportação e notificação ao fornecedor chegam na próxima etapa. Na gaveta de notas já dá para baixar o CSV.
      </p>
    </section>
  )
}

/* ───────────────────────── Maiores perdas × oportunidades ───────────────────────── */

export function Movimentos({ a, onPar }: { a: AnaliseClassificacao; onPar: (p: ParDivergente) => void }) {
  const est = a.pares.filter((p) => p.estimativa && Math.abs(p.estimativa.impacto) >= 0.005)
  const perdas = est.filter((p) => p.estimativa!.impacto < 0).sort((x, y) => x.estimativa!.impacto - y.estimativa!.impacto).slice(0, 6)
  const ganhos = est.filter((p) => p.estimativa!.impacto > 0).sort((x, y) => y.estimativa!.impacto - x.estimativa!.impacto).slice(0, 6)
  const max = Math.max(1, ...[...ganhos, ...perdas].map((p) => Math.abs(p.estimativa!.impacto)))
  if (!perdas.length && !ganhos.length) return null
  const Lista = ({ titulo, lado, ps }: { titulo: string; lado: "perda" | "oport"; ps: ParDivergente[] }) => (
    <section className="cartao">
      <div className="cabeca">
        <h2 className="iva-titulo-icone">
          {lado === "perda" ? <ArrowDownRight size={18} aria-hidden className="perda" /> : <ArrowUpRight size={18} aria-hidden className="oport" />} {titulo}
        </h2>
      </div>
      {ps.length === 0 ? (
        <p className="iva-linha-discreta">Nada neste recorte.</p>
      ) : (
        <ol className="iva-movimentos">
          {ps.map((p, i) => {
            const v = Math.abs(p.estimativa!.impacto)
            return (
              <li key={i}>
                <button className="iva-mov" onClick={() => onPar(p)} title={`${p.nota.nome ?? ""}\n→ ${p.calculado.nome ?? ""}\nClique para ver as notas`}>
                  <span className="iva-mov-linha">
                    <span className="etiqueta">{SENTIDO[p.sentido]}</span>
                    <ChipTipo tipo={p.tipo} />
                    <span className="codigo">{rotuloPar(p)}</span>
                    <span className={`iva-mov-valor ${lado}`}>{fmtBRL(v)}</span>
                  </span>
                  <span className="iva-trilho">
                    <span className={`iva-barra iva-barra-${lado}`} style={{ width: `${(v / max) * 100}%` }} />
                  </span>
                  <span className="sub">
                    {fmtInt(p.itens)} itens · <Valor v={p.valor} /> em notas · CFOP <Cfops cfops={p.cfops} />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
  return (
    <div className="grade-2">
      <Lista titulo="Maiores perdas" lado="perda" ps={perdas} />
      <Lista titulo="Maiores oportunidades" lado="oport" ps={ganhos} />
    </div>
  )
}

/* ───────────────────────── Ordenação e saldo nas tabelas ───────────────────────── */

export type Ordem = "perda" | "ganho" | "saldo"

export function SeletorOrdem({ ordem, onOrdem }: { ordem: Ordem; onOrdem: (o: Ordem) => void }) {
  return (
    <div className="segmentos" role="group" aria-label="Ordenar por">
      {(["perda", "ganho", "saldo"] as const).map((o) => (
        <button key={o} aria-pressed={ordem === o} onClick={() => onOrdem(o)}>
          {o === "perda" ? "Perdas" : o === "ganho" ? "Oportunidades" : "Saldo"}
        </button>
      ))}
    </div>
  )
}

export function ordenar<T extends { perda: number; ganho: number }>(lista: T[], ordem: Ordem): T[] {
  const chave = (x: T) => (ordem === "perda" ? x.perda : ordem === "ganho" ? x.ganho : Math.abs(x.ganho - x.perda))
  return [...lista].sort((x, y) => chave(y) - chave(x))
}

export function BarraSaldo({ perda, ganho, max }: { perda: number; ganho: number; max: number }) {
  const s = ganho - perda
  const pct = max > 0 ? Math.min(50, (Math.abs(s) / max) * 50) : 0
  return (
    <span className="iva-saldo-celula">
      <span className="iva-saldo-trilho" aria-hidden>
        <span className={`iva-barra iva-barra-${s < 0 ? "perda" : "oport"}`} style={s < 0 ? { right: "50%", width: `${pct}%` } : { left: "50%", width: `${pct}%` }} />
      </span>
      <Impacto valor={s} />
    </span>
  )
}

/* ───────────────────────── Gaveta: até a nota ───────────────────────── */

export type Alvo = {
  sentido?: "entrada" | "saida"
  nota?: string | null
  calculado?: string | null
  descricao?: string | null
  cnpj?: string | null
  tipo?: TipoErro
}

export function Gaveta({
  calculoId,
  selecao,
  alvo,
  titulo,
  onFechar,
}: {
  calculoId: string
  selecao: Selecao
  alvo: Alvo
  titulo: string
  onFechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chave = JSON.stringify(alvo)
  const busca = useBusca((s) => api<DetalheNotas>(`/api/calculos/${calculoId}/classificacao/notas`, { ...selecao, alvo }, s), [calculoId, chave, JSON.stringify(selecao)])
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar()
    document.addEventListener("keydown", tecla)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", tecla)
      document.body.style.overflow = ""
      anterior?.focus()
    }
  }, [onFechar])
  const d = busca.dados
  return (
    <div className="iva-gaveta-fundo" onClick={onFechar}>
      <div className="iva-gaveta" role="dialog" aria-modal="true" aria-labelledby="iva-gaveta-titulo" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="iva-gaveta-cabeca">
          <div>
            <h2 id="iva-gaveta-titulo">{titulo}</h2>
            <p className="sub">
              {d ? `${fmtInt(d.total)} nota(s)${d.parcial ? " · mostrando as de maior impacto" : ""}` : "Buscando as notas…"} · {selecao.recorte.ano}
            </p>
          </div>
          <div className="iva-gaveta-acoes">
            {d && d.notas.length > 0 && (
              <button className="botao" onClick={() => baixarCsv(d.notas, titulo)}>
                <Download size={14} aria-hidden /> CSV
              </button>
            )}
            <button className="botao" onClick={onFechar} aria-label="Fechar">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        {busca.erro != null && <Erro erro={busca.erro} />}
        {!d && !busca.erro && <div className="esqueleto" style={{ height: 160 }} />}
        {d && d.notas.length === 0 && <p className="iva-linha-discreta">Nenhuma nota encontrada para este recorte.</p>}
        {d && (
          <div className={`iva-notas${busca.carregando ? " carregando" : ""}`}>
            {d.notas.map((nt, i) => (
              <CartaoNota key={`${nt.chave}-${nt.nota.codigo}-${nt.correto.codigo}-${i}`} nt={nt} aberta={i === 0} />
            ))}
          </div>
        )}
        <p className="sub iva-dica">
          <Info size={14} aria-hidden /> “Nota (estimado)” é o IBS/CBS que o código informado na nota geraria. A API ainda não traz a base, a alíquota e o
          valor destacados no XML. Estimativa, não parecer.
        </p>
      </div>
    </div>
  )
}

const pctRed = (l: LadoClass, t: "Ibs" | "Cbs") => {
  if (l.tributa === false) return "sem tributo"
  const v = t === "Ibs" ? l.reducaoIbs : l.reducaoCbs
  return v === null ? "—" : `${v.toLocaleString("pt-BR")}%`
}
const fmtAliq = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`)
const fmtData = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—")

function CartaoNota({ nt, aberta }: { nt: NotaDivergente; aberta: boolean }) {
  const linhas: [string, React.ReactNode, React.ReactNode, string?][] = [
    ["cClassTrib", <span className="codigo">{nt.nota.codigo}</span>, <span className="codigo">{nt.correto.codigo}</span>, TERMOS.cclass],
    ["CST", nt.nota.cst ?? "—", nt.correto.cst ?? "—", TERMOS.cst],
    [
      "Redutor IBS / CBS",
      `${pctRed(nt.nota, "Ibs")} / ${pctRed(nt.nota, "Cbs")}`,
      `${pctRed(nt.correto, "Ibs")} / ${pctRed(nt.correto, "Cbs")}`,
      TERMOS.redutor,
    ],
    ["Base IBS/CBS", <span className="iva-sem">sem dados</span>, fmtBRL(nt.base)],
    ["Alíquota efetiva IBS / CBS", <span className="iva-sem">sem dados</span>, `${fmtAliq(nt.aliqIbs)} / ${fmtAliq(nt.aliqCbs)}`],
    ["IBS", nt.ibs.nota === null ? "—" : fmtBRL(nt.ibs.nota), fmtBRL(nt.ibs.correto)],
    ["CBS", nt.cbs.nota === null ? "—" : fmtBRL(nt.cbs.nota), fmtBRL(nt.cbs.correto)],
  ]
  return (
    <details className={`iva-nota${nt.possivelFalsoPositivo ? " iva-nota-fp" : ""}`} open={aberta}>
      <summary>
        <span className="iva-nota-id">
          <strong>NF {nt.numero ?? "s/ nº"}</strong>
          <span className="sub">
            {fmtData(nt.data)} · {SENTIDO[nt.sentido]}
            {nt.parceiro ? ` · ${fmtCnpj(nt.parceiro)}` : ""}
          </span>
        </span>
        <ChipTipo tipo={nt.tipo} />
        <Cfops cfops={nt.cfops} />
        <span className="iva-nota-impacto">
          <Impacto valor={nt.impacto} />
        </span>
      </summary>
      <div className="iva-nota-corpo">
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="iva-comparar">
            <thead>
              <tr>
                <th scope="col">Campo</th>
                <th scope="col" className="num">
                  Nota (estimado)
                </th>
                <th scope="col" className="num">
                  Correto
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(([rot, a, b, dica]) => (
                <tr key={rot}>
                  <th scope="row">{dica ? <Termo texto={rot} dica={dica} /> : rot}</th>
                  <td className="num">{a}</td>
                  <td className="num">{b}</td>
                </tr>
              ))}
              <tr className="iva-dif">
                <th scope="row">Diferença</th>
                <td className="num" colSpan={2}>
                  <Impacto valor={nt.impacto} /> <span className="sub">{nt.impacto === null ? "" : nt.impacto < 0 ? "perda" : "oportunidade"}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sub">
          <strong>Nota:</strong> {nt.nota.nome ?? "—"}
          <br />
          <strong>Correto:</strong> {nt.correto.nome ?? "—"}
        </p>
        {nt.fundamento ? (
          <p className="iva-fundamento">
            Fundamento da classificação correta:{" "}
            <a href={nt.fundamento.url} target="_blank" rel="noreferrer">
              {nt.fundamento.rotulo} <ExternalLink size={12} aria-hidden />
            </a>{" "}
            <span className="sub">(link da tabela oficial de cClassTrib, SVRS)</span>
          </p>
        ) : (
          <p className="iva-linha-discreta">A tabela oficial não traz o dispositivo legal deste código.</p>
        )}
        {nt.itens.length > 0 && (
          <ul className="iva-nota-itens">
            {nt.itens.map((it, k) => (
              <li key={k}>
                <span className="texto">{it.descricao ?? "—"}</span>
                <span className="codigo">NCM {it.ncm ?? "—"}</span>
                <span className="num">{fmtBRL(it.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        {nt.chave && (
          <p className="sub iva-chave">
            Chave: <span className="codigo">{nt.chave}</span>{" "}
            <button className="botao-link" onClick={() => navigator.clipboard?.writeText(nt.chave!)}>
              copiar
            </button>
          </p>
        )}
        {nt.possivelFalsoPositivo && (
          <p className="aviso">
            <AlertTriangle size={14} aria-hidden /> CFOP de operação não onerosa (remessa, bonificação, amostra, transferência ou outras). Confira se o
            cálculo tratou a operação corretamente antes de corrigir a nota.
          </p>
        )}
      </div>
    </details>
  )
}

function baixarCsv(notas: NotaDivergente[], titulo: string) {
  const cab = [
    "numero", "chave", "data", "operacao", "cfop", "parceiro", "tipo_erro", "cclass_nota", "cst_nota", "cclass_correto", "cst_correto",
    "base_correta", "ibs_nota_estimado", "ibs_correto", "cbs_nota_estimado", "cbs_correto", "impacto", "possivel_falso_positivo", "fundamento",
  ]
  const num = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","))
  const cel = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const linhas = notas.map((n) =>
    [
      n.numero, n.chave, n.data, SENTIDO[n.sentido], n.cfops.join(" "), n.parceiro, TIPOS_ERRO[n.tipo].nome, n.nota.codigo, n.nota.cst, n.correto.codigo,
      n.correto.cst, num(n.base), num(n.ibs.nota), num(n.ibs.correto), num(n.cbs.nota), num(n.cbs.correto), num(n.impacto),
      n.possivelFalsoPositivo ? "sim" : "", n.fundamento?.url ?? "",
    ].map(cel).join(";"),
  )
  const blob = new Blob(["﻿" + [cab.join(";"), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const el = document.createElement("a")
  el.href = url
  el.download = `auditor-iva-${titulo.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 60)}.csv`
  el.click()
  URL.revokeObjectURL(url)
}

/** Atalho: a gaveta precisa da análise memorizada para não refazer quando o pai renderiza. */
export function useFiltrada(a: AnaliseClassificacao | null, tipo: TipoErro | null) {
  return useMemo(() => (a ? filtrarPorTipo(a, tipo) : null), [a, tipo])
}
