"use client"
import { createContext, Fragment, useContext, useEffect, useState } from "react"
import type { Item, Pareto as DadosPareto, Parceiro } from "@/lib/capitulos"
import type { Linha } from "@/lib/demonstrativos"
import { TRIBUTOS } from "@/lib/tributos"
import { fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, fmtPct, useLargura, variacao } from "../util"
import { useAbrirFicha } from "./ficha-contexto"

/** Cores fixas: AR (hoje) em cinza; os cenários de venda em preto, amarelo, cinza médio e azul (Custo Neutro). */
export const COR_AR = "var(--pt-cinza)"
export const COR_CENARIO: Record<string, string> = {
  "Sem Ajuste": "var(--pt-preto)",
  "Com Reajuste": "var(--pt-amarelo)",
  "Preço Alvo": "var(--pt-cinza-medio)",
  "Custo Neutro": "var(--accent)",
}

/* ───────── Expandir e recolher: comando do capítulo que todas as tabelas obedecem ───────── */

type Comando = { nivel: 0 | 2; seq: number }
const ExpandirCtx = createContext<{ comando: Comando; enviar: (nivel: 0 | 2) => void }>({
  comando: { nivel: 0, seq: 0 },
  enviar: () => {},
})

/** Recebe o "Expandir tudo"/"Recolher tudo" do capítulo e aplica no estado local. */
function useComando(aplicar: (nivel: 0 | 2) => void) {
  const { comando } = useContext(ExpandirCtx)
  useEffect(() => {
    if (comando.seq > 0) aplicar(comando.nivel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comando.seq])
}

export function BotoesExpandir({ onExpandir, onRecolher }: { onExpandir: () => void; onRecolher: () => void }) {
  return (
    <span className="cap-expandir">
      <button onClick={onExpandir}>⊞ Expandir tudo</button>
      <button onClick={onRecolher}>⊟ Recolher tudo</button>
    </span>
  )
}

export function Capitulo({ numero, titulo, sub, children }: { numero: string; titulo: string; sub: string; children: React.ReactNode }) {
  const [comando, setComando] = useState<Comando>({ nivel: 0, seq: 0 })
  const enviar = (nivel: 0 | 2) => setComando((c) => ({ nivel, seq: c.seq + 1 }))
  return (
    <ExpandirCtx.Provider value={{ comando, enviar }}>
      <section className="cap">
        <header className="cap-cabeca">
          <span className="cap-numero">{numero}</span>
          <div style={{ flex: 1 }}>
            <h2>{titulo}</h2>
            <p>{sub}</p>
          </div>
          <span className="cap-cabeca-acoes">
            <BotoesExpandir onExpandir={() => enviar(2)} onRecolher={() => enviar(0)} />
          </span>
        </header>
        {children}
      </section>
    </ExpandirCtx.Provider>
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

/** Variação com seta: ▲ sobe, ▼ cai. */
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

/* ───────── Colunas que expandem: impostos e créditos, totais e por tributo ───────── */

type Nivel = 0 | 1 | 2
type GrupoColuna = "impostos" | "creditos"
const NOME_GRUPO: Record<GrupoColuna, { nome: string; total: string; prefixo: string }> = {
  impostos: { nome: "Impostos", total: "valor_impostos", prefixo: "valor" },
  creditos: { nome: "Créditos", total: "credito", prefixo: "credito" },
}

type ColunaExtra = { id: string; nome: string; valor: (e: Record<string, number>) => number; grupo: GrupoColuna; dif?: boolean }

/** As colunas extras visíveis, conforme o nível de cada grupo e os tributos que aparecem nas linhas. */
function colunasExtras(niveis: Record<GrupoColuna, Nivel>, grupos: GrupoColuna[], linhas: { extras: Record<string, number> }[]): ColunaExtra[] {
  const cols: ColunaExtra[] = []
  for (const g of grupos) {
    const { nome, total, prefixo } = NOME_GRUPO[g]
    if (niveis[g] >= 1) {
      cols.push({ id: `${g}-ar`, nome: `${nome} AR`, valor: (e) => e[`${total}_ar`] ?? 0, grupo: g })
      cols.push({ id: `${g}-dr`, nome: `${nome} DR`, valor: (e) => e[`${total}_dr`] ?? 0, grupo: g })
      cols.push({ id: `${g}-dif`, nome: `Dif. ${nome.toLowerCase()}`, valor: (e) => (e[`${total}_dr`] ?? 0) - (e[`${total}_ar`] ?? 0), grupo: g, dif: true })
    }
    if (niveis[g] >= 2) {
      for (const t of TRIBUTOS) {
        for (const l of ["ar", "dr"] as const) {
          const chave = `${prefixo}_${t.id}_${l}`
          if (linhas.some((x) => Math.abs(x.extras[chave] ?? 0) > 0.005)) {
            cols.push({ id: `${g}-${t.id}-${l}`, nome: `${g === "creditos" ? "Créd. " : ""}${t.nome} ${l.toUpperCase()}`, valor: (e) => e[chave] ?? 0, grupo: g })
          }
        }
      }
    }
  }
  return cols
}

function SeletorGrupos({ grupos, niveis, setNiveis }: { grupos: GrupoColuna[]; niveis: Record<GrupoColuna, Nivel>; setNiveis: (n: Record<GrupoColuna, Nivel>) => void }) {
  return (
    <div className="cap-grupos">
      {grupos.map((g) => (
        <span key={g} className="cap-grupo">
          <b>{NOME_GRUPO[g].nome}</b>
          {(["Recolher", "Totais", "Por tributo"] as const).map((rotulo, i) => (
            <button key={rotulo} aria-pressed={niveis[g] === i} onClick={() => setNiveis({ ...niveis, [g]: i as Nivel })}>
              {rotulo}
            </button>
          ))}
        </span>
      ))}
      <BotoesExpandir
        onExpandir={() => setNiveis(Object.fromEntries(grupos.map((g) => [g, 2])) as Record<GrupoColuna, Nivel>)}
        onRecolher={() => setNiveis(Object.fromEntries(grupos.map((g) => [g, 0])) as Record<GrupoColuna, Nivel>)}
      />
    </div>
  )
}

function useNiveis(grupos: GrupoColuna[]) {
  const [niveis, setNiveis] = useState<Record<GrupoColuna, Nivel>>({ impostos: 0, creditos: 0 })
  useComando((n) => setNiveis(Object.fromEntries(grupos.map((g) => [g, n])) as Record<GrupoColuna, Nivel>))
  return [niveis, setNiveis] as const
}

function CelulasExtras({ cols, extras }: { cols: ColunaExtra[]; extras: Record<string, number> }) {
  return (
    <>
      {cols.map((c) => (
        <td key={c.id} className={`num cap-col-${c.grupo}`}>
          {c.dif ? <Diferenca valor={c.valor(extras)} subirEhBom={c.grupo === "creditos"} /> : fmtBRL(c.valor(extras))}
        </td>
      ))}
    </>
  )
}

/** Lista de parceiros (fornecedores ou clientes) com valor e custo antes e depois, e colunas que expandem. */
export function TabelaParceiros({
  lista,
  mostrarCusto = true,
  grupos = ["impostos", "creditos"],
  vazio,
}: {
  lista: Parceiro[]
  mostrarCusto?: boolean
  grupos?: GrupoColuna[]
  vazio: string
}) {
  const [niveis, setNiveis] = useNiveis(grupos)
  const abrir = useAbrirFicha()
  if (lista.length === 0) return <p className="cap-vazio">{vazio}</p>
  const extras = colunasExtras(niveis, grupos, lista)
  return (
    <>
      <SeletorGrupos grupos={grupos} niveis={niveis} setNiveis={setNiveis} />
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
              {extras.map((c) => (
                <th key={c.id} className={`num cap-col-${c.grupo}`}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={`${p.cnpj}-${i}`}>
                <td className="cap-pos">{i + 1}</td>
                <td className="texto" title={p.nome ?? undefined}>
                  <Abrivel ativo={!!(abrir && p.cnpj)} onAbrir={() => abrir?.({ tipo: "parceiro", valor: p.cnpj!, rotulo: p.nome ?? fmtCnpj(p.cnpj!) })}>
                    <b>{p.nome ?? "Sem identificação"}</b>
                  </Abrivel>
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
                <CelulasExtras cols={extras} extras={p.extras} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Itens ligados ao parceiro (fornecedor nas compras, cliente nas vendas), com colunas que expandem. */
export function TabelaItens({
  lista,
  parceiro,
  mostrarCusto = true,
  grupos = ["impostos", "creditos"],
  vazio,
}: {
  lista: Item[]
  parceiro: string
  mostrarCusto?: boolean
  grupos?: GrupoColuna[]
  vazio: string
}) {
  const [niveis, setNiveis] = useNiveis(grupos)
  const abrir = useAbrirFicha()
  if (lista.length === 0) return <p className="cap-vazio">{vazio}</p>
  const extras = colunasExtras(niveis, grupos, lista)
  return (
    <>
      <SeletorGrupos grupos={grupos} niveis={niveis} setNiveis={setNiveis} />
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
              {extras.map((c) => (
                <th key={c.id} className={`num cap-col-${c.grupo}`}>
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((x, i) => (
              <tr key={i}>
                <td className="cap-pos">{i + 1}</td>
                <td className="texto" title={x.descricao ?? undefined}>
                  <Abrivel ativo={!!(abrir && x.descricao)} onAbrir={() => abrir?.({ tipo: "item", valor: x.descricao!, rotulo: x.descricao! })}>
                    <b>{x.descricao ?? "Sem descrição"}</b>
                  </Abrivel>
                  <span className="cap-sub">NCM {x.ncm ?? "n/d"}</span>
                </td>
                <td className="texto" title={x.nome ?? undefined}>
                  <Abrivel ativo={!!(abrir && x.cnpj)} onAbrir={() => abrir?.({ tipo: "parceiro", valor: x.cnpj!, rotulo: x.nome ?? fmtCnpj(x.cnpj!) })}>
                    {x.nome ?? (x.cnpj ? fmtCnpj(x.cnpj) : "Sem identificação")}
                  </Abrivel>
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
                <CelulasExtras cols={extras} extras={x.extras} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** Pareto em barras: cada grupo, sua parte do total e o acumulado; amarelo até os 80%. */
export function Pareto({ dados, medida, parceiros = false }: { dados: DadosPareto; medida: string; parceiros?: boolean }) {
  const abrir = useAbrirFicha()
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
            <Abrivel ativo={!!(parceiros && abrir && f.chave !== "null")} onAbrir={() => abrir?.({ tipo: "parceiro", valor: f.chave, rotulo: f.rotulo })}>
              {f.rotulo}
            </Abrivel>
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

/** Alternância pequena entre visões de um bloco. */
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
 * Linhas ano a ano, uma por cenário, com o valor de hoje (AR) como linha tracejada de referência.
 * Passe o mouse: uma régua vertical mostra os valores de todos os cenários naquele ano.
 */
export function LinhasAno({
  anos,
  ar,
  series,
  formatar = fmtBRL,
  rotuloAr = "Hoje (AR)",
}: {
  anos: number[]
  ar: number | null
  series: Serie[]
  formatar?: (v: number) => string
  rotuloAr?: string
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)
  const valores = [...(ar !== null ? [ar] : []), ...series.flatMap((s) => s.valores.filter((v): v is number => v !== null))]
  if (valores.length === 0) return <p className="cap-vazio">Sem dados.</p>
  let max = Math.max(...valores)
  let min = Math.min(...valores)
  const folga = (max - min || Math.abs(max) || 1) * 0.12
  max += folga
  min -= folga
  const altura = 260
  const topo = 14
  const base = 26
  const esq = 78
  const dir = 16
  const w = Math.max(largura, 320)
  const iw = w - esq - dir
  const ih = altura - topo - base
  const x = (i: number) => esq + (anos.length > 1 ? (i / (anos.length - 1)) * iw : iw / 2)
  const y = (v: number) => topo + ((max - v) / (max - min || 1)) * ih
  const ticks = [min + folga, (min + max) / 2, max - folga]
  const indice = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - esq
    return Math.min(anos.length - 1, Math.max(0, Math.round(anos.length > 1 ? (px / iw) * (anos.length - 1) : 0)))
  }
  return (
    <div className="cap-grafico" ref={ref}>
      <div className="cap-legenda">
        {ar !== null && (
          <span>
            <i className="tracejado" style={{ borderColor: COR_AR }} /> {rotuloAr}
          </span>
        )}
        {series.map((s) => (
          <span key={s.nome}>
            <i style={{ background: s.cor }} /> {s.nome}
          </span>
        ))}
      </div>
      <svg
        height={altura}
        width="100%"
        role="img"
        aria-label="Evolução ano a ano"
        onMouseMove={(e) => setFoco(indice(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setFoco(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={esq} x2={w - dir} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="cap-eixo">
              {formatar === fmtBRL ? fmtBRLCurto(t) : formatar(t)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && <line x1={esq} x2={w - dir} y1={y(0)} y2={y(0)} stroke="var(--pt-eixo)" />}
        {anos.map((a, i) => (
          <text key={a} x={x(i)} y={altura - 8} textAnchor="middle" className="cap-eixo">
            {a}
          </text>
        ))}
        {ar !== null && <line x1={esq} x2={w - dir} y1={y(ar)} y2={y(ar)} stroke={COR_AR} strokeWidth={2} strokeDasharray="6 5" />}
        {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={topo} y2={topo + ih} stroke="var(--text-muted)" strokeDasharray="3 3" />}
        {series.map((s) => (
          <Fragment key={s.nome}>
            <path
              d={s.valores.map((v, i) => (v === null ? "" : `${i === 0 || s.valores[i - 1] === null ? "M" : "L"}${x(i)},${y(v)}`)).join("")}
              fill="none"
              stroke={s.cor}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            {s.valores.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={foco === i ? 5.5 : 3.5} fill={s.cor} stroke="var(--surface-1)" strokeWidth={2} />
              ),
            )}
          </Fragment>
        ))}
      </svg>
      <p className="cap-foco" aria-live="polite">
        {foco === null
          ? "Passe o mouse no gráfico para ver os valores de cada ano."
          : `${anos[foco]}: ${series.map((s) => `${s.nome} ${s.valores[foco] === null ? "n/d" : formatar(s.valores[foco]!)}`).join(" · ")}${
              ar !== null ? ` · ${rotuloAr} ${formatar(ar)}` : ""
            }`}
      </p>
    </div>
  )
}

/**
 * Demonstrativo (DRE ou fluxo de caixa): linhas com valores por coluna, que abrem até o tributo.
 * Nasce com as linhas principais; "Expandir tudo" do capítulo ou da tabela abre todos os níveis.
 */
export function Demonstrativo({ colunas, linhas }: { colunas: string[]; linhas: Linha[] }) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const todas = (ls: Linha[]): string[] => ls.flatMap((l) => (l.filhos?.length ? [l.id, ...todas(l.filhos)] : []))
  const expandir = () => setAbertas(new Set(todas(linhas)))
  const recolher = () => setAbertas(new Set())
  useComando((n) => (n === 2 ? expandir() : recolher()))
  const alternar = (id: string) =>
    setAbertas((a) => {
      const b = new Set(a)
      if (b.has(id)) b.delete(id)
      else b.add(id)
      return b
    })
  const formatar = (l: Linha, v: number | null) => (v === null ? "" : l.tipo === "percentual" ? fmtPct(v) : fmtBRL(v))
  const render = (ls: Linha[], nivel: number): React.ReactNode =>
    ls.map((l) => (
      <Fragment key={l.id}>
        <tr className={`cap-dem-${l.tipo ?? "normal"} cap-dem-nivel-${nivel}`}>
          <td style={{ paddingLeft: 12 + nivel * 20 }}>
            {l.filhos?.length ? (
              <button className="cap-dem-abrir" aria-expanded={abertas.has(l.id)} onClick={() => alternar(l.id)}>
                <span aria-hidden="true">{abertas.has(l.id) ? "▾" : "▸"}</span> {l.nome}
              </button>
            ) : (
              <span className="cap-dem-nome">{l.nome}</span>
            )}
          </td>
          {l.valores.map((v, i) => (
            <td key={i} className={`num${(v ?? 0) < 0 ? " negativo" : ""}`}>
              {formatar(l, v)}
            </td>
          ))}
        </tr>
        {l.filhos && abertas.has(l.id) && render(l.filhos, nivel + 1)}
      </Fragment>
    ))
  return (
    <>
      {todas(linhas).length > 0 && (
        <div className="cap-grupos">
          <BotoesExpandir onExpandir={expandir} onRecolher={recolher} />
        </div>
      )}
      <div className="tabela-rolagem">
        <table className="cap-tabela cap-demonstrativo">
          <thead>
            <tr>
              <th />
              {colunas.map((c, i) => (
                <th key={c} className={`num${i === 0 ? " cap-th-ar" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{render(linhas, 0)}</tbody>
        </table>
      </div>
    </>
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

/** Texto que vira botão quando há ficha para abrir (fornecedor, cliente ou item). */
export function Abrivel({ ativo, onAbrir, children }: { ativo: boolean; onAbrir: () => void; children: React.ReactNode }) {
  if (!ativo) return <>{children}</>
  return (
    <button className="cap-abrir" onClick={onAbrir} title="Abrir a ficha">
      {children}
    </button>
  )
}
