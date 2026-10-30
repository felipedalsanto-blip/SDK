"use client"
import { useState } from "react"
import type { Pareto as DadosPareto, Parceiro, Item } from "@/lib/capitulos"
import { fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, fmtPct, useLargura, variacao } from "../util"

/** Cores fixas: AR (hoje) em cinza; os três cenários de venda em preto, amarelo e cinza médio. */
export const COR_AR = "var(--pt-cinza)"
export const COR_CENARIO: Record<string, string> = {
  "Sem Ajuste": "var(--pt-preto)",
  "Com Reajuste": "var(--pt-amarelo)",
  "Preço Alvo": "var(--pt-cinza-medio)",
}

export function Capitulo({ numero, titulo, sub, children }: { numero: string; titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="cap">
      <header className="cap-cabeca">
        <span className="cap-numero">{numero}</span>
        <div>
          <h2>{titulo}</h2>
          <p>{sub}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

export function Bloco({ titulo, leitura, children }: { titulo: string; leitura?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="cap-bloco">
      <h3>{titulo}</h3>
      {leitura && <p className="cap-leitura">{leitura}</p>}
      {children}
    </div>
  )
}

export function Indicador({ rotulo, valor, contexto }: { rotulo: string; valor: string; contexto?: React.ReactNode }) {
  return (
    <div className="cap-kpi">
      <span className="cap-kpi-rotulo">{rotulo}</span>
      <span className="cap-kpi-valor">{valor}</span>
      {contexto && <span className="cap-kpi-contexto">{contexto}</span>}
    </div>
  )
}

/** Variação com seta: ▲ sobe, ▼ cai. A cor fica no texto de apoio; a seta carrega o sentido. */
export function Seta({ antes, depois }: { antes: number; depois: number }) {
  const v = variacao(antes, depois)
  if (v === null || Math.abs(depois - antes) < 0.005) return <span className="cap-seta">sem mudança</span>
  return (
    <span className={`cap-seta ${v > 0 ? "sobe" : "cai"}`}>
      {v > 0 ? "▲" : "▼"} {fmtPct(Math.abs(v))}
    </span>
  )
}

/** Diferença com sinal. Por padrão subir é ruim (preço, custo); em lucro e caixa, passe `subirEhBom`. */
export function Diferenca({ valor, subirEhBom = false }: { valor: number; subirEhBom?: boolean }) {
  if (Math.abs(valor) < 0.005) return <span>{fmtBRL(0)}</span>
  const ruim = subirEhBom ? valor < 0 : valor > 0
  return <span className={ruim ? "cap-sobe" : "cap-cai"}>{`${valor > 0 ? "+" : "−"}${fmtBRL(Math.abs(valor))}`}</span>
}

/** Lista de parceiros (fornecedores ou clientes) com valor e custo antes e depois. */
export function TabelaParceiros({ lista, mostrarCusto = true, vazio }: { lista: Parceiro[]; mostrarCusto?: boolean; vazio: string }) {
  if (lista.length === 0) return <p className="cap-vazio">{vazio}</p>
  return (
    <div className="tabela-rolagem">
      <table className="cap-tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>Nome</th>
            <th className="num">Valor AR</th>
            <th className="num">Valor DR</th>
            <th className="num">Diferença</th>
            {mostrarCusto && <th className="num">Custo AR</th>}
            {mostrarCusto && <th className="num">Custo DR</th>}
            {mostrarCusto && <th className="num">Dif. custo</th>}
          </tr>
        </thead>
        <tbody>
          {lista.map((p, i) => (
            <tr key={`${p.cnpj}-${i}`}>
              <td className="cap-pos">{i + 1}</td>
              <td className="texto" title={p.nome ?? undefined}>
                <b>{p.nome ?? "Sem identificação"}</b>
                <span className="cap-sub">{p.cnpj ? fmtCnpj(p.cnpj) : "sem CNPJ"}</span>
              </td>
              <td className="num">{fmtBRL(p.valorAr)}</td>
              <td className="num">{fmtBRL(p.valorDr)}</td>
              <td className="num">
                <Diferenca valor={p.valorDr - p.valorAr} /> <Seta antes={p.valorAr} depois={p.valorDr} />
              </td>
              {mostrarCusto && <td className="num">{fmtBRL(p.custoAr)}</td>}
              {mostrarCusto && <td className="num">{fmtBRL(p.custoDr)}</td>}
              {mostrarCusto && (
                <td className="num">
                  <Diferenca valor={p.custoDr - p.custoAr} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Itens ligados ao parceiro (fornecedor nas compras, cliente nas vendas). */
export function TabelaItens({ lista, parceiro, mostrarCusto = true, vazio }: { lista: Item[]; parceiro: string; mostrarCusto?: boolean; vazio: string }) {
  if (lista.length === 0) return <p className="cap-vazio">{vazio}</p>
  return (
    <div className="tabela-rolagem">
      <table className="cap-tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>{parceiro}</th>
            <th className="num">Valor AR</th>
            <th className="num">Valor DR</th>
            <th className="num">Diferença</th>
            {mostrarCusto && <th className="num">Dif. custo</th>}
          </tr>
        </thead>
        <tbody>
          {lista.map((x, i) => (
            <tr key={i}>
              <td className="cap-pos">{i + 1}</td>
              <td className="texto" title={x.descricao ?? undefined}>
                <b>{x.descricao ?? "Sem descrição"}</b>
                <span className="cap-sub">NCM {x.ncm ?? "n/d"}</span>
              </td>
              <td className="texto" title={x.nome ?? undefined}>
                {x.nome ?? (x.cnpj ? fmtCnpj(x.cnpj) : "Sem identificação")}
              </td>
              <td className="num">{fmtBRL(x.valorAr)}</td>
              <td className="num">{fmtBRL(x.valorDr)}</td>
              <td className="num">
                <Diferenca valor={x.valorDr - x.valorAr} /> <Seta antes={x.valorAr} depois={x.valorDr} />
              </td>
              {mostrarCusto && (
                <td className="num">
                  <Diferenca valor={x.custoDr - x.custoAr} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Pareto em barras: cada grupo, sua parte do total e o acumulado; a faixa amarela marca os 80%. */
export function Pareto({ dados, medida }: { dados: DadosPareto; medida: string }) {
  if (dados.universo === 0) return <p className="cap-vazio">Nenhum caso nesta medida.</p>
  const maior = dados.fatias[0]?.valor ?? 1
  return (
    <div className="cap-pareto">
      <p className="cap-destaque">
        <b>{fmtInt(dados.para80)}</b> de {fmtInt(dados.universo)} concentram 80% de {medida} ({fmtBRL(dados.total)} no total).
      </p>
      {dados.fatias.map((f, i) => (
        <div key={`${f.chave}-${i}`} className={`cap-pareto-linha${i < dados.para80 ? " dentro" : ""}`}>
          <span className="cap-pareto-nome" title={f.rotulo}>
            {f.rotulo}
          </span>
          <span className="cap-pareto-trilho">
            <span style={{ width: `${(f.valor / maior) * 100}%` }} />
          </span>
          <span className="cap-pareto-valor">{fmtBRLCurto(f.valor)}</span>
          <span className="cap-pareto-acum">{fmtPct(f.acumulado)}</span>
        </div>
      ))}
    </div>
  )
}

/** Abas internas pequenas para alternar entre visões de um bloco. */
export function Alternar<T extends string>({ opcoes, valor, onChange }: { opcoes: Record<T, string>; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="cap-alternar" role="group">
      {(Object.keys(opcoes) as T[]).map((k) => (
        <button key={k} aria-pressed={valor === k} onClick={() => onChange(k)}>
          {opcoes[k]}
        </button>
      ))}
    </div>
  )
}

export type Serie = { nome: string; cor: string; valores: (number | null)[] }

/**
 * Colunas agrupadas por ano, com a coluna AR (hoje) à esquerda como referência. Aceita valores
 * negativos (linha do zero marcada). Passe o mouse para ver o valor; a tabela fica embaixo.
 */
export function ColunasAno({ anos, ar, series, rotuloAr = "Hoje (AR)" }: { anos: number[]; ar: number | null; series: Serie[]; rotuloAr?: string }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<string | null>(null)
  const todos = [ar ?? 0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0))]
  const max = Math.max(0, ...todos)
  const min = Math.min(0, ...todos)
  const altura = 240
  const topo = 16
  const base = 26
  const esq = 70
  const w = Math.max(largura, 320)
  const grupos = anos.length + (ar !== null ? 1 : 0)
  const banda = (w - esq - 8) / grupos
  const ih = altura - topo - base
  const y = (v: number) => topo + ((max - v) / (max - min || 1)) * ih
  const barra = Math.min(22, (banda * 0.8) / Math.max(1, series.length))
  const ticks = [min, 0, max].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <div className="cap-grafico" ref={ref}>
      <div className="cap-legenda">
        {ar !== null && (
          <span>
            <i style={{ background: COR_AR }} /> {rotuloAr}
          </span>
        )}
        {series.map((s) => (
          <span key={s.nome}>
            <i style={{ background: s.cor }} /> {s.nome}
          </span>
        ))}
      </div>
      <svg height={altura} width="100%" role="img" aria-label="Gráfico por ano" onMouseLeave={() => setFoco(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={esq} x2={w - 8} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--pt-eixo)" : "var(--grid)"} />
            <text x={esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="cap-eixo">
              {fmtBRLCurto(t)}
            </text>
          </g>
        ))}
        {ar !== null && (
          <g onMouseEnter={() => setFoco(`${rotuloAr}: ${fmtBRL(ar)}`)}>
            <rect x={esq + banda / 2 - barra / 2} y={Math.min(y(ar), y(0))} width={barra} height={Math.max(1, Math.abs(y(ar) - y(0)))} rx={3} fill={COR_AR} />
            <text x={esq + banda / 2} y={altura - 8} textAnchor="middle" className="cap-eixo forte">
              Hoje
            </text>
          </g>
        )}
        {anos.map((ano, i) => {
          const x0 = esq + banda * (i + (ar !== null ? 1 : 0))
          const larguraGrupo = barra * series.length + 2 * (series.length - 1)
          return (
            <g key={ano}>
              {series.map((s, k) => {
                const v = s.valores[i]
                if (v === null || v === undefined) return null
                return (
                  <rect
                    key={s.nome}
                    x={x0 + banda / 2 - larguraGrupo / 2 + k * (barra + 2)}
                    y={Math.min(y(v), y(0))}
                    width={barra}
                    height={Math.max(1, Math.abs(y(v) - y(0)))}
                    rx={3}
                    fill={s.cor}
                    stroke={s.cor === "var(--pt-amarelo)" ? "var(--pt-borda-amarelo)" : "none"}
                    onMouseEnter={() => setFoco(`${s.nome}, ${ano}: ${fmtBRL(v)}`)}
                  />
                )
              })}
              <text x={x0 + banda / 2} y={altura - 8} textAnchor="middle" className="cap-eixo">
                {ano}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="cap-foco" aria-live="polite">
        {foco ?? "Passe o mouse nas colunas para ver o valor."}
      </p>
    </div>
  )
}

/** Tabela ano a ano das mesmas séries do gráfico (a trilha de auditoria dos números). */
export function TabelaAnos({ anos, linhas }: { anos: number[]; linhas: { nome: string; ar: number | null; valores: (number | null)[]; destaque?: boolean }[] }) {
  return (
    <div className="tabela-rolagem">
      <table className="cap-tabela">
        <thead>
          <tr>
            <th />
            <th className="num cap-th-ar">AR</th>
            {anos.map((a) => (
              <th key={a} className="num">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className={l.destaque ? "cap-linha-destaque" : undefined}>
              <td>{l.nome}</td>
              <td className="num">{l.ar === null ? "" : fmtBRL(l.ar)}</td>
              {l.valores.map((v, i) => (
                <td key={i} className="num">
                  {v === null ? "" : fmtBRL(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Plano de negociação: passos numerados, cada um com o porquê. */
export function Plano({ titulo, passos }: { titulo: string; passos: { acao: string; porque: React.ReactNode }[] }) {
  return (
    <div className="cap-plano">
      <h4>{titulo}</h4>
      <ol>
        {passos.map((p) => (
          <li key={p.acao}>
            <b>{p.acao}</b>
            <span>{p.porque}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Premissa({ children }: { children: React.ReactNode }) {
  return <div className="cap-premissa">{children}</div>
}
