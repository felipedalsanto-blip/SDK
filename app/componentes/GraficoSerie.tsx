"use client"
import { useState } from "react"
import { fmtBRL, fmtBRLCurto, fmtPct, num, useLargura } from "./util"

export type PontoSerie = {
  ano: number
  valor_impostos_ar?: number | null
  valor_impostos_dr?: number | null
  carga_efetiva_ar?: number | null
  carga_efetiva_dr?: number | null
}

const ALTURA = 260
const M = { topo: 16, dir: 64, base: 28, esq: 64 }

/** Linhas antes × depois por ano, num eixo só; crosshair com tooltip; clique escolhe o ano. */
export function GraficoSerie({
  serie,
  medida,
  anoAtual,
  onAno,
}: {
  serie: PontoSerie[]
  medida: "carga" | "tributos"
  anoAtual: number
  onAno: (ano: number) => void
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)

  const ar = (p: PontoSerie) => num(medida === "carga" ? p.carga_efetiva_ar : p.valor_impostos_ar)
  const dr = (p: PontoSerie) => num(medida === "carga" ? p.carga_efetiva_dr : p.valor_impostos_dr)
  const fmtEixo = medida === "carga" ? fmtPct : fmtBRLCurto
  const fmtValor = medida === "carga" ? fmtPct : fmtBRL

  const valores = serie.flatMap((p) => [ar(p), dr(p)]).filter((v): v is number => v !== null)
  if (serie.length === 0 || valores.length === 0) return <div className="vazio">Sem dados para os anos deste recorte.</div>

  const max = escalaBonita(Math.max(...valores, 0))
  const w = Math.max(largura, 280)
  const iw = w - M.esq - M.dir
  const ih = ALTURA - M.topo - M.base
  const passo = serie.length > 1 ? iw / (serie.length - 1) : 0
  const x = (i: number) => M.esq + (serie.length > 1 ? i * passo : iw / 2)
  const y = (v: number) => M.topo + ih - (v / max) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)

  const caminho = (f: (p: PontoSerie) => number | null) => {
    let d = ""
    serie.forEach((p, i) => {
      const v = f(p)
      if (v === null) return
      d += `${d ? "L" : "M"}${x(i)},${y(v)}`
    })
    return d
  }

  const ultimo = serie.length - 1
  const rotuloFim = (f: (p: PontoSerie) => number | null) => f(serie[ultimo])
  let yAr = rotuloFim(ar) !== null ? y(rotuloFim(ar)!) : null
  let yDr = rotuloFim(dr) !== null ? y(rotuloFim(dr)!) : null
  // Afasta os rótulos diretos quando as linhas terminam muito perto.
  if (yAr !== null && yDr !== null && Math.abs(yAr - yDr) < 14) {
    const meio = (yAr + yDr) / 2
    ;[yAr, yDr] = yAr <= yDr ? [meio - 7, meio + 7] : [meio + 7, meio - 7]
  }

  const indice = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - M.esq
    return Math.min(ultimo, Math.max(0, Math.round(serie.length > 1 ? px / passo : 0)))
  }
  const p = foco !== null ? serie[foco] : null

  return (
    <div className="grafico" ref={ref}>
      <div className="legenda" style={{ marginBottom: 6 }}>
        <span>
          <i style={{ background: "var(--series-antes)" }} /> Sistema atual (antes)
        </span>
        <span>
          <i style={{ background: "var(--series-depois)" }} /> Com a reforma (depois)
        </span>
      </div>
      <svg
        height={ALTURA}
        role="img"
        aria-label="Evolução ano a ano, antes e depois da reforma"
        onMouseMove={(e) => setFoco(indice(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setFoco(null)}
        onClick={(e) => onAno(serie[indice(e.clientX, e.currentTarget.getBoundingClientRect())].ano)}
        style={{ cursor: "pointer" }}
      >
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.esq} x2={w - M.dir} y1={y(t)} y2={y(t)} />
              <text x={M.esq - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmtEixo(t)}
              </text>
            </g>
          ))}
        </g>
        {serie.map((s, i) =>
          passo < 36 && (i - Math.max(0, serie.findIndex((p) => p.ano === anoAtual))) % 2 !== 0 ? null : (
          <text
            key={s.ano}
            x={x(i)}
            y={ALTURA - 8}
            textAnchor="middle"
            style={s.ano === anoAtual ? { fill: "var(--text-primary)", fontWeight: 600 } : undefined}
          >
            {s.ano}
          </text>
          ),
        )}
        {serie.findIndex((s) => s.ano === anoAtual) >= 0 && (
          <line
            x1={x(serie.findIndex((s) => s.ano === anoAtual))}
            x2={x(serie.findIndex((s) => s.ano === anoAtual))}
            y1={M.topo}
            y2={M.topo + ih}
            stroke="var(--surface-2)"
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}
        {foco !== null && (
          <line x1={x(foco)} x2={x(foco)} y1={M.topo} y2={M.topo + ih} stroke="var(--text-muted)" strokeDasharray="3 3" />
        )}
        <path d={caminho(ar)} fill="none" stroke="var(--series-antes)" strokeWidth={2} strokeLinejoin="round" />
        <path d={caminho(dr)} fill="none" stroke="var(--series-depois)" strokeWidth={2} strokeLinejoin="round" />
        {serie.map((s, i) =>
          [
            [ar(s), "var(--series-antes)"],
            [dr(s), "var(--series-depois)"],
          ].map(([v, cor], k) =>
            v === null ? null : (
              <circle
                key={`${s.ano}-${k}`}
                cx={x(i)}
                cy={y(v as number)}
                r={foco === i ? 5 : 3.5}
                fill={cor as string}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            ),
          ),
        )}
        {yAr !== null && (
          <text x={w - M.dir + 8} y={yAr} dy="0.32em" style={{ fill: "var(--text-secondary)" }}>
            Antes
          </text>
        )}
        {yDr !== null && (
          <text x={w - M.dir + 8} y={yDr} dy="0.32em" style={{ fill: "var(--text-secondary)" }}>
            Depois
          </text>
        )}
      </svg>
      {p && foco !== null && (
        <div
          className="tooltip"
          style={{
            left: x(foco) + (x(foco) > w - 200 ? -12 : 12),
            top: M.topo + 34,
            transform: x(foco) > w - 200 ? "translateX(-100%)" : "none",
          }}
        >
          <div className="titulo">{p.ano}</div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--series-antes)" }} />
              Antes
            </span>
            <span>{fmtValor(ar(p))}</span>
          </div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--series-depois)" }} />
              Depois
            </span>
            <span>{fmtValor(dr(p))}</span>
          </div>
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="sub" style={{ cursor: "pointer" }}>
          Ver como tabela
        </summary>
        <div className="tabela-rolagem" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Tributos antes</th>
                <th className="num">Tributos depois</th>
                <th className="num">Carga antes</th>
                <th className="num">Carga depois</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((s) => (
                <tr key={s.ano}>
                  <td>{s.ano}</td>
                  <td className="num">{fmtBRL(s.valor_impostos_ar)}</td>
                  <td className="num">{fmtBRL(s.valor_impostos_dr)}</td>
                  <td className="num">{fmtPct(s.carga_efetiva_ar)}</td>
                  <td className="num">{fmtPct(s.carga_efetiva_dr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** Arredonda o topo do eixo para um número redondo (1, 2, 2.5, 5 × 10ⁿ). */
export function escalaBonita(v: number) {
  if (v <= 0) return 1
  const e = 10 ** Math.floor(Math.log10(v))
  const f = v / e
  const passo = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return passo * e
}
