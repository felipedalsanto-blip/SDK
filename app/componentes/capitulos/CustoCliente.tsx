"use client"
import { Fragment, useEffect, useMemo, useState } from "react"
import type { VendaPorRegime } from "@/lib/capitulos"
import { TRIBUTOS } from "@/lib/tributos"
import { fmtBRL, fmtPct } from "../util"
import { Diferenca } from "./ui"

/**
 * Quanto o cliente efetivamente paga, conforme o regime dele e os créditos que aproveita.
 * Hoje (AR) cada perfil credita só os tributos atuais que a lei permite; em 2027 (DR), os que
 * ainda restam e, menos o Simples padrão e a pessoa física, o IBS e a CBS.
 */
type Perfil = { id: string; grupo: string; nome: string; ar: string[]; dr: string[]; explica: [string, string] }

const PERFIS: Perfil[] = [
  { id: "sn-padrao", grupo: "Simples Nacional", nome: "Simples Nacional (regime padrão)", ar: [], dr: [], explica: ["Não toma crédito.", "Continua sem crédito: o IBS e a CBS viram custo."] },
  { id: "sn-hibrido", grupo: "Simples Nacional", nome: "Simples Nacional (regime híbrido)", ar: [], dr: ["ibs", "cbs"], explica: ["Não toma crédito.", "Recolhe IBS e CBS por fora e passa a creditar os dois."] },
  { id: "lr-ind", grupo: "Lucro Real", nome: "Lucro Real · Indústria (comprar para industrializar/revender)", ar: ["icms", "ipi", "pis_cofins"], dr: ["icms", "ipi", "pis_cofins", "ibs", "cbs"], explica: ["Credita ICMS, IPI, PIS e COFINS.", "Mantém o ICMS da transição e credita IBS e CBS (PIS, COFINS e IPI extintos)."] },
  { id: "lr-com", grupo: "Lucro Real", nome: "Lucro Real · Comércio (apenas revenda)", ar: ["icms", "pis_cofins"], dr: ["icms", "pis_cofins", "ibs", "cbs"], explica: ["Credita ICMS, PIS e COFINS.", "Mantém o ICMS da transição e credita IBS e CBS."] },
  { id: "lr-serv", grupo: "Lucro Real", nome: "Lucro Real · Serviços / uso e consumo", ar: ["pis_cofins"], dr: ["pis_cofins", "ibs", "cbs"], explica: ["Credita só PIS e COFINS.", "Credita IBS e CBS, inclusive no uso e consumo."] },
  { id: "lp-ind", grupo: "Lucro Presumido", nome: "Lucro Presumido · Indústria (comprar para industrializar/revender)", ar: ["icms", "ipi"], dr: ["icms", "ipi", "ibs", "cbs"], explica: ["Credita ICMS e IPI (PIS e COFINS cumulativos).", "Mantém o ICMS da transição e passa a creditar IBS e CBS."] },
  { id: "lp-com", grupo: "Lucro Presumido", nome: "Lucro Presumido · Comércio (apenas revenda)", ar: ["icms"], dr: ["icms", "ibs", "cbs"], explica: ["Credita só ICMS.", "Mantém o ICMS da transição e passa a creditar IBS e CBS."] },
  { id: "lp-serv", grupo: "Lucro Presumido", nome: "Lucro Presumido · Prestador de serviços / uso interno", ar: [], dr: ["ibs", "cbs"], explica: ["Não toma crédito.", "Passa a creditar IBS e CBS."] },
  { id: "pf", grupo: "Pessoa Física", nome: "Pessoa física / consumidor final", ar: [], dr: [], explica: ["Não toma crédito.", "Não toma crédito."] },
]

const NOME_TRIBUTO = Object.fromEntries(TRIBUTOS.map((t) => [t.id, t.nome]))

type Custo = { valor: number; creditos: { id: string; valor: number }[]; liquido: number }

function custo(base: Record<string, number>, lado: "ar" | "dr", creditaveis: string[]): Custo {
  const valor = base[`valor_${lado}`] ?? 0
  const creditos = creditaveis.map((id) => ({ id, valor: base[`valor_${id}_${lado}`] ?? 0 })).filter((c) => Math.abs(c.valor) > 0.005)
  return { valor, creditos, liquido: valor - creditos.reduce((s, c) => s + c.valor, 0) }
}

/** A carteira real por regime vira a mistura inicial (dentro de cada regime, o perfil mais comum). */
function misturaInicial(porRegime: VendaPorRegime[]): Record<string, number> {
  const total = porRegime.reduce((s, r) => s + r.valorAr, 0) || 1
  const fatia = (regime: string | null) => Math.round((porRegime.filter((r) => r.regime === regime).reduce((s, r) => s + r.valorAr, 0) / total) * 100)
  const m: Record<string, number> = Object.fromEntries(PERFIS.map((p) => [p.id, 0]))
  m["sn-padrao"] = fatia("simplesNacional")
  m["lr-com"] = fatia("lucroReal")
  m["lp-com"] = fatia("lucroPresumido")
  m["pf"] = Math.max(0, 100 - m["sn-padrao"] - m["lr-com"] - m["lp-com"])
  return m
}

export function CustoCliente({ base, porRegime, ano, calculoId }: { base: Record<string, number>; porRegime: VendaPorRegime[]; ano: number; calculoId: string }) {
  const chave = `pricetax-mistura-cliente:${calculoId}`
  const inicial = useMemo(() => misturaInicial(porRegime), [porRegime])
  const [mistura, setMistura] = useState<Record<string, number>>(inicial)
  const [aberto, setAberto] = useState<string | null>(null)
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave)
      if (salvo) setMistura({ ...inicial, ...JSON.parse(salvo) })
    } catch {}
  }, [chave, inicial])
  const mudar = (novo: Record<string, number>) => {
    setMistura(novo)
    try {
      localStorage.setItem(chave, JSON.stringify(novo))
    } catch {}
  }

  const linhas = PERFIS.map((p) => ({ p, ar: custo(base, "ar", p.ar), dr: custo(base, "dr", p.dr) }))
  const total = Object.values(mistura).reduce((s, v) => s + v, 0)
  const ponderado = (lado: "ar" | "dr") => (total ? linhas.reduce((s, l) => s + (mistura[l.p.id] ?? 0) * l[lado].liquido, 0) / total : 0)
  const mAr = ponderado("ar")
  const mDr = ponderado("dr")
  const normalizar = () => {
    if (!total) return
    const novo = Object.fromEntries(Object.entries(mistura).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]))
    mudar(novo)
  }

  return (
    <div className="cc">
      <div className="cc-resultado">
        <div>
          <span className="cap-kpi-rotulo">Custo médio do seu cliente, pela sua carteira</span>
          <span className="cc-valor">{fmtBRL(mDr)}</span>
          <span className="cap-kpi-contexto">
            hoje {fmtBRL(mAr)} · <Diferenca valor={mDr - mAr} /> {mAr ? `(${fmtPct((mDr - mAr) / mAr)})` : ""}
          </span>
        </div>
        <div className="cc-acoes">
          <span className={`cc-total${Math.abs(total - 100) > 0.5 ? " alerta" : ""}`}>Carteira: {total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
          {Math.abs(total - 100) > 0.5 && <button onClick={normalizar}>Ajustar para 100%</button>}
          <button onClick={() => mudar(inicial)}>Usar a carteira real (por regime)</button>
        </div>
      </div>

      <div className="tabela-rolagem">
        <table className="cap-tabela cc-tabela">
          <thead>
            <tr>
              <th>Perfil do cliente</th>
              <th className="cc-regua-th">% da carteira</th>
              <th className="num">Antes (AR)</th>
              <th className="num">Depois ({ano})</th>
              <th className="num">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ p, ar, dr }, i) => (
              <Fragment key={p.id}>
                {(i === 0 || PERFIS[i - 1].grupo !== p.grupo) && (
                  <tr className="cc-grupo">
                    <td colSpan={5}>{p.grupo}</td>
                  </tr>
                )}
                <tr>
                  <td>
                    <button className="cap-dem-abrir" aria-expanded={aberto === p.id} onClick={() => setAberto((a) => (a === p.id ? null : p.id))}>
                      <span aria-hidden="true">{aberto === p.id ? "▾" : "▸"}</span> {p.nome}
                    </button>
                  </td>
                  <td>
                    <span className="cc-regua">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={mistura[p.id] ?? 0}
                        aria-label={`% da carteira: ${p.nome}`}
                        onChange={(e) => mudar({ ...mistura, [p.id]: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={mistura[p.id] ?? 0}
                        aria-label={`% da carteira (número): ${p.nome}`}
                        onChange={(e) => mudar({ ...mistura, [p.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                      />
                      %
                    </span>
                  </td>
                  <td className="num">{fmtBRL(ar.liquido)}</td>
                  <td className="num">{fmtBRL(dr.liquido)}</td>
                  <td className="num">
                    <Diferenca valor={dr.liquido - ar.liquido} />
                  </td>
                </tr>
                {aberto === p.id && (
                  <tr className="cc-detalhe">
                    <td colSpan={5}>
                      <div className="cc-colunas">
                        <Resumo titulo="Antes (AR)" c={ar} explica={p.explica[0]} />
                        <Resumo titulo={`Depois (${ano})`} c={dr} explica={p.explica[1]} transicao />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        Cada perfil aplica, sobre as mesmas vendas, os créditos que aquele tipo de cliente aproveita. A carteira começa pela participação real de cada regime
        nas vendas (Simples no regime padrão, Real e Presumido no comércio, o restante como pessoa física); mova a régua para refletir a sua realidade. A
        mistura fica salva neste navegador.
      </p>
    </div>
  )
}

function Resumo({ titulo, c, explica, transicao = false }: { titulo: string; c: Custo; explica: string; transicao?: boolean }) {
  const creditos = c.valor - c.liquido
  return (
    <div className="memoria-coluna">
      <h4>{titulo}</h4>
      <div className="memoria-linha total">
        <span>Valor da nota (desembolso)</span>
        <span className="num">{fmtBRL(c.valor)}</span>
      </div>
      {c.creditos.map((x) => (
        <div key={x.id} className="memoria-linha">
          <span>
            (−) Crédito {NOME_TRIBUTO[x.id]}
            {transicao && !["ibs", "cbs"].includes(x.id) ? " (transição)" : ""}
          </span>
          <span className="num">{fmtBRL(-x.valor)}</span>
        </div>
      ))}
      <div className="memoria-linha resultado">
        <span>= Custo líquido</span>
        <span className="num">{fmtBRL(c.liquido)}</span>
      </div>
      <div className="memoria-linha ajuste">
        <span>Alíquota efetiva de crédito</span>
        <span className="num">{c.valor ? fmtPct(creditos / c.valor) : "n/d"}</span>
      </div>
      <div className="memoria-linha ajuste">
        <span>Custo efetivo (% do valor)</span>
        <span className="num">{c.valor ? fmtPct(c.liquido / c.valor) : "n/d"}</span>
      </div>
      <p className="cap-nota" style={{ marginTop: 6 }}>
        {explica}
      </p>
    </div>
  )
}
