"use client"
import { useState } from "react"
import {
  DIMENSOES_RANKING,
  MEDIDAS,
  metricaAr,
  metricaDr,
  type DimensaoRanking,
  type Medida,
  type Selecao,
} from "@/lib/catalogo"
import { escalaBonita } from "./GraficoSerie"
import { Erro, rotuloValor } from "./comum"
import { api, fmtBRL, fmtBRLCurto, fmtInt, fmtPct, num, useBusca, useLargura, variacao } from "./util"

type Grupo = Record<string, string | number | boolean | null>
const LIMITE = 10

/** Maiores grupos de uma dimensão: barras antes × depois por grupo; clique filtra o painel. */
export function Ranking({
  calculoId,
  selecao,
  chave,
  filtro,
  onFiltrar,
}: {
  calculoId: string
  selecao: Selecao
  chave: string
  filtro: Selecao["filtro"]
  onFiltrar: (dimensao: DimensaoRanking, valor: string | null) => void
}) {
  const [dimensao, setDimensao] = useState<DimensaoRanking>("ncm")
  const [medida, setMedida] = useState<Medida>("valor_impostos")
  const { dados, erro, carregando } = useBusca(
    (s) =>
      api<{ grupos: Grupo[]; total_grupos: number }>(
        `/api/calculos/${calculoId}/ranking`,
        { ...selecao, dimensao, medida, limite: LIMITE },
        s,
      ),
    [calculoId, chave, dimensao, medida],
  )

  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Ranking por {DIMENSOES_RANKING[dimensao]}</h2>
          <p className="sub">
            {MEDIDAS[medida]} antes × depois, pelos {LIMITE} maiores no sistema atual.
            {dados ? ` ${fmtInt(dados.total_grupos)} no total.` : ""} Clique para filtrar.
          </p>
        </div>
        <div className="filtros">
          <select aria-label="Agrupar por" value={dimensao} onChange={(e) => setDimensao(e.target.value as DimensaoRanking)}>
            {(Object.keys(DIMENSOES_RANKING) as DimensaoRanking[]).map((d) => (
              <option key={d} value={d}>
                {DIMENSOES_RANKING[d]}
              </option>
            ))}
          </select>
          <select aria-label="Medida" value={medida} onChange={(e) => setMedida(e.target.value as Medida)}>
            {(Object.keys(MEDIDAS) as Medida[]).map((m) => (
              <option key={m} value={m}>
                {MEDIDAS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {erro != null && <Erro erro={erro} />}
      {!erro && !dados && <div className="vazio">Carregando…</div>}
      {dados && (
        <div className={carregando ? "carregando" : undefined}>
          {dados.grupos.length === 0 ? (
            <div className="vazio">Nenhum grupo neste recorte.</div>
          ) : (
            <Barras
              grupos={dados.grupos}
              dimensao={dimensao}
              medida={medida}
              filtro={filtro}
              onFiltrar={onFiltrar}
            />
          )}
        </div>
      )}
    </section>
  )
}

const ALTURA_LINHA = 30
const ESQ = 132

function Barras({
  grupos,
  dimensao,
  medida,
  filtro,
  onFiltrar,
}: {
  grupos: Grupo[]
  dimensao: DimensaoRanking
  medida: Medida
  filtro: Selecao["filtro"]
  onFiltrar: (dimensao: DimensaoRanking, valor: string | null) => void
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)
  const ar = metricaAr(medida)
  const dr = metricaDr(medida)

  const max = escalaBonita(Math.max(0, ...grupos.flatMap((g) => [num(g[ar]) ?? 0, num(g[dr]) ?? 0])))
  const w = Math.max(largura, 280)
  const iw = w - ESQ - 12
  const h = grupos.length * ALTURA_LINHA + 22
  const escala = (v: number | null) => (v === null || v <= 0 ? 0 : (v / max) * iw)
  const valorDe = (g: Grupo) => (g[dimensao] === null ? null : String(g[dimensao]))
  const ehFiltro = (g: Grupo) => filtro?.dimensao === dimensao && filtro.valor === valorDe(g)
  const g = foco !== null ? grupos[foco] : null

  return (
    <div className="grafico" ref={ref}>
      <div className="legenda" style={{ marginBottom: 6 }}>
        <span>
          <i style={{ background: "var(--series-antes)" }} /> Antes
        </span>
        <span>
          <i style={{ background: "var(--series-depois)" }} /> Depois
        </span>
      </div>
      <svg height={h} role="img" aria-label={`${MEDIDAS[medida]} por ${DIMENSOES_RANKING[dimensao]}`}>
        {[0, 0.5, 1].map((f) => (
          <g className="grid" key={f}>
            <line x1={ESQ + f * iw} x2={ESQ + f * iw} y1={0} y2={h - 22} />
            <text x={ESQ + f * iw} y={h - 6} textAnchor={f === 1 ? "end" : f === 0 ? "start" : "middle"}>
              {fmtBRLCurto(f * max)}
            </text>
          </g>
        ))}
        {grupos.map((grupo, i) => {
          const y0 = i * ALTURA_LINHA
          const rotulo = rotuloValor(dimensao, grupo[dimensao])
          return (
            <g
              key={`${String(grupo[dimensao])}-${i}`}
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onClick={() => onFiltrar(dimensao, valorDe(grupo))}
              style={{ cursor: "pointer" }}
            >
              <rect x={0} y={y0} width={w} height={ALTURA_LINHA} fill={foco === i || ehFiltro(grupo) ? "var(--surface-2)" : "transparent"} rx={6} />
              <text x={8} y={y0 + ALTURA_LINHA / 2} dy="0.32em" style={{ fill: "var(--text-secondary)", fontSize: 12 }}>
                {rotulo.length > 18 ? `${rotulo.slice(0, 17)}…` : rotulo}
              </text>
              <rect x={ESQ} y={y0 + 6} width={escala(num(grupo[ar]))} height={8} rx={2} fill="var(--series-antes)" />
              <rect x={ESQ} y={y0 + 16} width={escala(num(grupo[dr]))} height={8} rx={2} fill="var(--series-depois)" />
            </g>
          )
        })}
      </svg>
      {g && foco !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(ESQ + iw / 2, 100), w - 100), top: foco * ALTURA_LINHA + 26 }}>
          <div className="titulo">{rotuloValor(dimensao, g[dimensao])}</div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--series-antes)" }} />
              Antes
            </span>
            <span>{fmtBRL(g[ar])}</span>
          </div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--series-depois)" }} />
              Depois
            </span>
            <span>{fmtBRL(g[dr])}</span>
          </div>
          <div className="linha">
            <span>Variação</span>
            <span>{fmtPct(variacao(g[ar], g[dr]))}</span>
          </div>
          <div className="linha">
            <span>Carga efetiva</span>
            <span>
              {fmtPct(g.carga_efetiva_ar)} → {fmtPct(g.carga_efetiva_dr)}
            </span>
          </div>
          <div className="linha">
            <span>Itens</span>
            <span>{fmtInt(g.itens)}</span>
          </div>
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary className="sub" style={{ cursor: "pointer" }}>
          Ver como tabela
        </summary>
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>{DIMENSOES_RANKING[dimensao]}</th>
                <th className="num">Itens</th>
                <th className="num">Antes</th>
                <th className="num">Depois</th>
                <th className="num">Variação</th>
                <th className="num">Carga antes</th>
                <th className="num">Carga depois</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo, i) => (
                <tr
                  key={i}
                  className={`clicavel${ehFiltro(grupo) ? " selecionada" : ""}`}
                  onClick={() => onFiltrar(dimensao, valorDe(grupo))}
                >
                  <td className="texto">{rotuloValor(dimensao, grupo[dimensao])}</td>
                  <td className="num">{fmtInt(grupo.itens)}</td>
                  <td className="num">{fmtBRL(grupo[ar])}</td>
                  <td className="num">{fmtBRL(grupo[dr])}</td>
                  <td className="num">{fmtPct(variacao(grupo[ar], grupo[dr]))}</td>
                  <td className="num">{fmtPct(grupo.carga_efetiva_ar)}</td>
                  <td className="num">{fmtPct(grupo.carga_efetiva_dr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
