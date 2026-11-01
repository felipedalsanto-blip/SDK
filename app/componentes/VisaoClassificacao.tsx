"use client"
import { useCallback, useState } from "react"
import type { CalculoDetalhe } from "@pricetax/sdk"
import type { Selecao } from "@/lib/catalogo"
import {
  SITUACOES,
  type AnaliseClassificacao,
  type CelulaCst,
  type Codigo,
  type ParDivergente,
  type PontoProjecao,
  type TipoErro,
} from "@/lib/classificacao"
import {
  BarraSaldo,
  Cascata,
  Cfops,
  ChipTipo,
  Gaveta,
  Impacto,
  Movimentos,
  PlanoAcao,
  Resumo,
  SENTIDO,
  SeletorOrdem,
  TERMOS,
  Termo,
  TiposErro,
  Valor,
  ordenar,
  rotuloPar,
  useFiltrada,
  type Alvo,
  type Ordem,
} from "./AuditorIva"
import { TIPOS_ERRO } from "@/lib/classificacao"
import { Erro } from "./comum"
import { escalaBonita } from "./GraficoSerie"
import { api, fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, useApi, useBusca, useLargura } from "./util"

type Abrir = (alvo: Alvo, titulo: string) => void

export function VisaoClassificacao({
  calculo,
  selecao,
  chave,
  chaveProjecao,
  onAno,
}: {
  calculo: CalculoDetalhe
  selecao: Selecao
  chave: string
  chaveProjecao: string
  onAno: (ano: number) => void
}) {
  const analise = useApi<AnaliseClassificacao>(`/api/calculos/${calculo.id}/classificacao`, selecao)
  const projecao = useBusca(
    (s) => api<{ projecao: PontoProjecao[] }>(`/api/calculos/${calculo.id}/classificacao/projecao`, selecao, s),
    [calculo.id, chaveProjecao],
  )
  const [tipo, setTipo] = useState<TipoErro | null>(null)
  const [gaveta, setGaveta] = useState<{ alvo: Alvo; titulo: string } | null>(null)
  const fechar = useCallback(() => setGaveta(null), [])
  const abrir: Abrir = (alvo, titulo) => setGaveta({ alvo: tipo && !alvo.tipo ? { ...alvo, tipo } : alvo, titulo })
  const abrirPar = (p: ParDivergente) => abrir({ sentido: p.sentido, nota: p.nota.codigo, calculado: p.calculado.codigo }, `${SENTIDO[p.sentido]} · ${rotuloPar(p)}`)
  const completo = analise.dados
  const a = useFiltrada(completo, tipo)

  return (
    <div className="iva">
      {analise.erro != null && <Erro erro={analise.erro} />}
      {!a && !analise.erro && <div className="cartao vazio">Comparando as classificações das notas com as calculadas…</div>}
      {a && completo && (
        <div className={analise.carregando ? "carregando" : undefined} style={{ display: "grid", gap: 16 }}>
          <Resumo a={a} completo={completo} tipo={tipo} onTipo={setTipo} />
          {a.parcial && (
            <div className="aviso">
              Este recorte tem muitos grupos: os rankings abaixo cobrem os maiores por valor. Os totais acima são completos.
            </div>
          )}
          <TiposErro a={completo} tipo={tipo} onTipo={setTipo} onVerNotas={(t) => abrir({ tipo: t }, TIPOS_ERRO[t].nome)} />
          <div className="grade-2 iva-grade">
            <PlanoAcao a={a} onVerNotas={abrir} />
            <Cascata a={a} />
          </div>
          <Movimentos a={a} onPar={abrirPar} />
        </div>
      )}

      <section className="cartao">
        <div className="cabeca">
          <div>
            <h2>Perda e oportunidade ano a ano</h2>
            <p className="sub">
              As divergências de classificação em cada ano da transição, com as alíquotas de cada ano (todos os tipos de erro).
              Clique num ano para abrir o detalhe.
            </p>
          </div>
        </div>
        {projecao.erro != null && <Erro erro={projecao.erro} />}
        {!projecao.erro && !projecao.dados && <div className="vazio">Calculando os anos…</div>}
        {projecao.dados && (
          <div className={projecao.carregando ? "carregando" : undefined}>
            <Projecao pontos={projecao.dados.projecao} anoAtual={selecao.recorte.ano} onAno={onAno} />
          </div>
        )}
      </section>

      {a && (
        <>
          <Itens a={a} onAbrir={abrir} />
          <div className="grade-2">
            <Fornecedores a={a} onAbrir={abrir} />
            <MatrizCst celulas={a.cst} nomes={a.nomesCst} />
          </div>
          <Pares a={a} onPar={abrirPar} />
          <Metodologia a={a} />
        </>
      )}
      {gaveta && <Gaveta calculoId={calculo.id} selecao={selecao} alvo={gaveta.alvo} titulo={gaveta.titulo} onFechar={fechar} />}
    </div>
  )
}

function CodigoComNome({ c }: { c: Codigo }) {
  if (!c.codigo) return <span className="etiqueta">sem código</span>
  return (
    <span title={c.nome ?? undefined}>
      <span className="codigo">{c.codigo}</span>
      {c.nome && <span className="nome-codigo">{c.nome}</span>}
    </span>
  )
}

function ListaPares({ pares }: { pares: string[] }) {
  return (
    <span title={pares.join("\n")}>
      {pares.slice(0, 2).map((p) => (
        <span key={p} style={{ display: "block" }}>
          {p}
        </span>
      ))}
      {pares.length > 2 && <span className="nome-codigo">+{pares.length - 2} pares</span>}
    </span>
  )
}

/** Separa as linhas com e sem impacto em R$: as sem impacto ficam recolhidas no fim. */
function comImpacto<T extends { perda: number; ganho: number }>(xs: T[]) {
  const sim = xs.filter((x) => x.perda >= 0.005 || x.ganho >= 0.005)
  return { sim, nao: xs.length - sim.length }
}

function Itens({ a, onAbrir }: { a: AnaliseClassificacao; onAbrir: Abrir }) {
  const [ordem, setOrdem] = useState<Ordem>("perda")
  const { sim, nao } = comImpacto(a.itens)
  const lista = ordenar(sim, ordem)
  const max = Math.max(0, ...lista.map((x) => Math.abs(x.ganho - x.perda)))
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Itens: perdas e oportunidades</h2>
          <p className="sub">Os produtos e serviços de maior impacto com classificação divergente em {a.ano}. Clique para ver as notas.</p>
        </div>
        {lista.length > 0 && <SeletorOrdem ordem={ordem} onOrdem={setOrdem} />}
      </div>
      {lista.length === 0 ? (
        <p className="iva-linha-discreta">Nenhum item com impacto em R$ neste recorte.</p>
      ) : (
        <div className="tabela-rolagem iva-tabela" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Operação</th>
                <th>CFOP</th>
                <th>Tipo</th>
                <th>Nota → correto</th>
                <th className="num">Itens</th>
                <th className="num">Perda</th>
                <th className="num">Oportunidade</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((it, i) => {
                const tipos = Object.keys(it.porTipo) as TipoErro[]
                return (
                  <tr
                    key={i}
                    className="iva-clicavel"
                    tabIndex={0}
                    onClick={() => onAbrir({ sentido: it.sentido, descricao: it.descricao }, it.descricao ?? "Item sem descrição")}
                    onKeyDown={(e) => e.key === "Enter" && onAbrir({ sentido: it.sentido, descricao: it.descricao }, it.descricao ?? "Item sem descrição")}
                  >
                    <td className="texto" data-rotulo="Item" title={it.descricao ?? undefined}>
                      {it.descricao ?? "—"}
                    </td>
                    <td data-rotulo="Operação">{SENTIDO[it.sentido]}</td>
                    <td data-rotulo="CFOP">
                      <Cfops cfops={it.cfops} />
                    </td>
                    <td data-rotulo="Tipo">
                      {tipos.map((t) => (
                        <ChipTipo key={t} tipo={t} />
                      ))}
                    </td>
                    <td className="codigo" data-rotulo="Nota → correto">
                      <ListaPares pares={it.pares} />
                    </td>
                    <td className="num" data-rotulo="Itens">{fmtInt(it.itens)}</td>
                    <td className="num" data-rotulo="Perda">{it.perda ? <Valor v={it.perda} classe="perda" /> : "—"}</td>
                    <td className="num" data-rotulo="Oportunidade">{it.ganho ? <Valor v={it.ganho} classe="oport" /> : "—"}</td>
                    <td className="num" data-rotulo="Saldo">
                      <BarraSaldo perda={it.perda} ganho={it.ganho} max={max} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {nao > 0 && <p className="iva-linha-discreta">{fmtInt(nao)} item(ns) divergente(s) sem impacto financeiro (mesma carga ou regra própria) não listados.</p>}
    </section>
  )
}

function Fornecedores({ a, onAbrir }: { a: AnaliseClassificacao; onAbrir: Abrir }) {
  const [ordem, setOrdem] = useState<Ordem>("perda")
  const { sim, nao } = comImpacto(a.fornecedores ?? [])
  const lista = ordenar(sim, ordem)
  const max = Math.max(0, ...lista.map((x) => Math.abs(x.ganho - x.perda)))
  const abrirF = (f: (typeof lista)[number]) => onAbrir({ cnpj: f.cnpj, sentido: "entrada" }, f.razaoSocial ?? (f.cnpj ? fmtCnpj(f.cnpj) : "Fornecedor sem CNPJ"))
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Fornecedores</h2>
          <p className="sub">
            Quem emite notas de compra com cClassTrib divergente em {a.ano}: crédito em risco de <Termo texto="glosa" dica={TERMOS.glosa} /> ou a recuperar.
          </p>
        </div>
        {lista.length > 0 && <SeletorOrdem ordem={ordem} onOrdem={setOrdem} />}
      </div>
      {a.fornecedores === null ? (
        <p className="iva-linha-discreta">Escolha “Todas” ou “Compras” em Notas para ver os fornecedores.</p>
      ) : lista.length === 0 ? (
        <p className="iva-linha-discreta">Nenhum fornecedor com impacto em R$.</p>
      ) : (
        <div className="tabela-rolagem iva-tabela" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>CFOP</th>
                <th className="num">Itens</th>
                <th className="num">Perda</th>
                <th className="num">Oportunidade</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f, i) => (
                <tr key={i} className="iva-clicavel" tabIndex={0} onClick={() => abrirF(f)} onKeyDown={(e) => e.key === "Enter" && abrirF(f)}>
                  <td className="texto" data-rotulo="Fornecedor" title={f.razaoSocial ?? undefined}>
                    {f.razaoSocial ?? "—"}
                    <span className="nome-codigo">{f.cnpj ? fmtCnpj(f.cnpj) : "sem CNPJ"}</span>
                  </td>
                  <td data-rotulo="CFOP">
                    <Cfops cfops={f.cfops} />
                  </td>
                  <td className="num" data-rotulo="Itens">{fmtInt(f.itens)}</td>
                  <td className="num" data-rotulo="Perda">{f.perda ? <Valor v={f.perda} classe="perda" /> : "—"}</td>
                  <td className="num" data-rotulo="Oportunidade">{f.ganho ? <Valor v={f.ganho} classe="oport" /> : "—"}</td>
                  <td className="num" data-rotulo="Saldo">
                    <BarraSaldo perda={f.perda} ganho={f.ganho} max={max} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nao > 0 && <p className="iva-linha-discreta">{fmtInt(nao)} fornecedor(es) com divergência sem impacto financeiro.</p>}
    </section>
  )
}

type Coluna = "operacao" | "tipo" | "itens" | "valor" | "pelaNota" | "correto" | "impacto"

function Pares({ a, onPar }: { a: AnaliseClassificacao; onPar: (p: ParDivergente) => void }) {
  const [col, setCol] = useState<Coluna>("impacto")
  const [asc, setAsc] = useState(true)
  const chave = (p: ParDivergente): number | string => {
    switch (col) {
      case "operacao": return p.sentido
      case "tipo": return TIPOS_ERRO[p.tipo].curto
      case "itens": return p.itens
      case "valor": return p.valor
      case "pelaNota": return p.estimativa?.pelaNota ?? -Infinity
      case "correto": return p.estimativa?.correto ?? -Infinity
      case "impacto": return p.estimativa?.impacto ?? 0
    }
  }
  const lista = [...a.pares].sort((x, y) => {
    const [p, q] = [chave(x), chave(y)]
    const c = typeof p === "string" ? p.localeCompare(String(q)) : p - (q as number)
    return asc ? c : -c
  })
  const Cab = ({ c, children, num }: { c: Coluna; children: React.ReactNode; num?: boolean }) => (
    <th className={num ? "num" : undefined} aria-sort={col === c ? (asc ? "ascending" : "descending") : "none"}>
      <button className="iva-ordenar" onClick={() => (col === c ? setAsc(!asc) : (setCol(c), setAsc(c === "impacto")))}>
        {children} {col === c ? (asc ? "▲" : "▼") : ""}
      </button>
    </th>
  )
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Todos os pares de cClassTrib divergentes</h2>
          <p className="sub">
            Cada par nota → correto, com o IBS + CBS pelas duas classificações em {a.ano}. Clique numa coluna para ordenar e numa linha para ver as notas.
          </p>
        </div>
      </div>
      {a.pares.length === 0 ? (
        <p className="iva-linha-discreta">Nenhuma divergência de cClassTrib neste recorte.</p>
      ) : (
        <div className="tabela-rolagem iva-tabela iva-fixa" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <Cab c="operacao">Operação</Cab>
                <Cab c="tipo">Tipo</Cab>
                <th>Nota</th>
                <th>Correto</th>
                <th>CFOP</th>
                <Cab c="itens" num>Itens</Cab>
                <Cab c="valor" num>Valor de notas</Cab>
                <Cab c="pelaNota" num>IBS+CBS pela nota</Cab>
                <Cab c="correto" num>IBS+CBS correto</Cab>
                <Cab c="impacto" num>Impacto</Cab>
              </tr>
            </thead>
            <tbody>
              {lista.map((p, i) => (
                <tr key={i} className="iva-clicavel" tabIndex={0} onClick={() => onPar(p)} onKeyDown={(e) => e.key === "Enter" && onPar(p)}>
                  <td data-rotulo="Operação">{SENTIDO[p.sentido]}</td>
                  <td data-rotulo="Tipo">
                    <ChipTipo tipo={p.tipo} />
                  </td>
                  <td data-rotulo="Nota">
                    <CodigoComNome c={p.nota} />
                  </td>
                  <td data-rotulo="Correto">
                    <CodigoComNome c={p.calculado} />
                  </td>
                  <td data-rotulo="CFOP">
                    <Cfops cfops={p.cfops} />
                  </td>
                  <td className="num" data-rotulo="Itens">{fmtInt(p.itens)}</td>
                  <td className="num" data-rotulo="Valor de notas"><Valor v={p.valor} /></td>
                  <td className="num" data-rotulo="IBS+CBS pela nota">{p.estimativa ? fmtBRL(p.estimativa.pelaNota) : "—"}</td>
                  <td className="num" data-rotulo="IBS+CBS correto">{p.estimativa ? fmtBRL(p.estimativa.correto) : "—"}</td>
                  <td className="num" data-rotulo="Impacto">
                    <Impacto valor={p.estimativa?.impacto} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function MatrizCst({ celulas, nomes }: { celulas: CelulaCst[]; nomes: Record<string, string> }) {
  const chave = (v: string | null) => v ?? "—"
  const linhas = [...new Set(celulas.map((c) => chave(c.nota)))].sort()
  const colunas = [...new Set(celulas.map((c) => chave(c.calculado)))].sort()
  const mapa = new Map(celulas.map((c) => [`${chave(c.nota)}|${chave(c.calculado)}`, c]))
  const max = Math.max(1, ...celulas.map((c) => c.itens))
  const rotulo = (v: string) => (v === "—" ? "sem CST" : v)

  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>CST: nota × calculado</h2>
          <p className="sub">Itens por par de CST do IBS/CBS. Fora da diagonal, a nota diverge do cálculo.</p>
        </div>
      </div>
      {celulas.length === 0 ? (
        <div className="vazio">Nenhum item neste recorte.</div>
      ) : (
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="matriz">
            <thead>
              <tr>
                <th className="lado">Nota ↓ / Calculado →</th>
                {colunas.map((c) => (
                  <th key={c} className="num" title={nomes[c]}>
                    <span className="codigo">{rotulo(c)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l}>
                  <th className="lado" title={nomes[l]}>
                    <span className="codigo">{rotulo(l)}</span>
                    {nomes[l] && <span className="nome-codigo">{nomes[l]}</span>}
                  </th>
                  {colunas.map((c) => {
                    const cel = mapa.get(`${l}|${c}`)
                    const diagonal = l === c
                    const forte = cel ? Math.round(8 + (cel.itens / max) * 42) : 0
                    return (
                      <td
                        key={c}
                        className={`celula${diagonal ? " diagonal" : ""}`}
                        title={cel ? `${fmtInt(cel.itens)} itens · ${fmtBRL(cel.valor)}` : undefined}
                        style={
                          cel
                            ? {
                                background: `color-mix(in srgb, ${diagonal || l === "—" ? "var(--series-antes)" : "var(--sobe)"} ${forte}%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        {cel ? fmtInt(cel.itens) : ""}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="sub" style={{ marginTop: 8 }}>
        Azul: nota igual ao cálculo ou nota sem CST. Vermelho: divergência. Quanto mais forte, mais itens.
      </p>
    </section>
  )
}

const ALTURA = 280
const M = { topo: 16, dir: 16, base: 28, esq: 72 }

/** Barras divergentes por ano (ganho para cima, perda para baixo) ou o líquido acumulado. */
function Projecao({ pontos, anoAtual, onAno }: { pontos: PontoProjecao[]; anoAtual: number; onAno: (ano: number) => void }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [modo, setModo] = useState<"ano" | "acumulado">("ano")
  const fatorAnual = pontos[0]?.fatorAnual ?? null
  const [anualizar, setAnualizar] = useState(true)
  const [foco, setFoco] = useState<number | null>(null)

  if (pontos.length === 0) return <div className="vazio">Sem anos neste cálculo.</div>
  const f = anualizar && fatorAnual ? fatorAnual : 1
  const dados = pontos.map((p) => ({ ano: p.ano, perda: p.perda * f, ganho: p.ganho * f, liquido: (p.ganho - p.perda) * f }))
  let soma = 0
  const acumulado = dados.map((d) => (soma += d.liquido))

  const w = Math.max(largura, 280)
  const iw = w - M.esq - M.dir
  const ih = ALTURA - M.topo - M.base
  const valores = modo === "ano" ? dados.flatMap((d) => [d.ganho, -d.perda]) : acumulado
  const maiorPositivo = Math.max(0, ...valores)
  const maiorNegativo = Math.max(0, ...valores.map((v) => -v))
  const topo = maiorPositivo > 0 ? escalaBonita(maiorPositivo) : 0
  const fundo = maiorNegativo > 0 ? -escalaBonita(maiorNegativo) : 0
  // Eixo de `fundo` a `topo`, sempre incluindo o zero; só um lado quando os valores têm um sinal só.
  const max = topo === 0 && fundo === 0 ? 1 : topo
  const min = fundo
  const y = (v: number) => M.topo + ((max - v) / (max - min)) * ih
  const banda = iw / dados.length
  const xc = (i: number) => M.esq + banda * (i + 0.5)
  const larguraBarra = Math.min(36, banda * 0.32)
  const ticks = [...(min < 0 ? [min, min / 2] : []), 0, ...(max > 0 ? [max / 2, max] : [])]
  const total = acumulado[acumulado.length - 1] ?? 0

  return (
    <div className="grafico" ref={ref}>
      <div className="cabeca" style={{ marginBottom: 6 }}>
        <div className="legenda">
          {modo === "ano" ? (
            <>
              <span>
                <i style={{ background: "var(--div-ganho)" }} /> Oportunidade
              </span>
              <span>
                <i style={{ background: "var(--div-perda)" }} /> Perda
              </span>
            </>
          ) : (
            <span>
              Impacto líquido acumulado até {dados[dados.length - 1].ano}: <strong>{fmtBRL(total)}</strong>
            </span>
          )}
        </div>
        <div className="filtros">
          {fatorAnual && (
            <div className="segmentos" role="group" aria-label="Período">
              <button aria-pressed={!anualizar} onClick={() => setAnualizar(false)}>
                Período do cálculo
              </button>
              <button aria-pressed={anualizar} onClick={() => setAnualizar(true)}>
                12 meses
              </button>
            </div>
          )}
          <div className="segmentos" role="group" aria-label="Modo">
            <button aria-pressed={modo === "ano"} onClick={() => setModo("ano")}>
              Por ano
            </button>
            <button aria-pressed={modo === "acumulado"} onClick={() => setModo("acumulado")}>
              Acumulado
            </button>
          </div>
        </div>
      </div>
      <svg height={ALTURA} role="img" aria-label="Projeção de perda e oportunidade por ano" onMouseLeave={() => setFoco(null)}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.esq} x2={w - M.dir} y1={y(t)} y2={y(t)} style={t === 0 ? { stroke: "var(--text-muted)" } : undefined} />
              <text x={M.esq - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmtBRLCurto(t)}
              </text>
            </g>
          ))}
        </g>
        {dados.map((d, i) => (
          <g
            key={d.ano}
            onMouseEnter={() => setFoco(i)}
            onClick={() => onAno(d.ano)}
            style={{ cursor: "pointer" }}
          >
            <rect x={xc(i) - banda / 2} y={M.topo} width={banda} height={ih} fill={foco === i ? "var(--surface-2)" : "transparent"} />
            {modo === "ano" ? (
              <>
                <rect x={xc(i) - larguraBarra - 1} y={y(d.ganho)} width={larguraBarra} height={Math.max(0, y(0) - y(d.ganho))} rx={2} fill="var(--div-ganho)" />
                <rect x={xc(i) + 1} y={y(0)} width={larguraBarra} height={Math.max(0, y(-d.perda) - y(0))} rx={2} fill="var(--div-perda)" />
              </>
            ) : null}
            <text
              x={xc(i)}
              y={ALTURA - 8}
              textAnchor="middle"
              style={d.ano === anoAtual ? { fill: "var(--text-primary)", fontWeight: 600 } : undefined}
            >
              {banda < 34 && (i - Math.max(0, dados.findIndex((x) => x.ano === anoAtual))) % 2 !== 0 ? "" : d.ano}
            </text>
          </g>
        ))}
        {modo === "acumulado" && (
          <>
            <path
              d={acumulado.map((v, i) => `${i ? "L" : "M"}${xc(i)},${y(v)}`).join("")}
              fill="none"
              stroke="var(--series-antes)"
              strokeWidth={2}
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {acumulado.map((v, i) => (
              <circle key={i} cx={xc(i)} cy={y(v)} r={foco === i ? 5 : 3.5} fill="var(--series-antes)" stroke="var(--surface-1)" strokeWidth={2} pointerEvents="none" />
            ))}
          </>
        )}
      </svg>
      {foco !== null && (
        <div
          className="tooltip"
          style={{
            left: xc(foco) + (xc(foco) > w - 200 ? -12 : 12),
            top: 60,
            transform: xc(foco) > w - 200 ? "translateX(-100%)" : "none",
          }}
        >
          <div className="titulo">{dados[foco].ano}</div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--div-perda)" }} />
              Perda
            </span>
            <span>{fmtBRL(dados[foco].perda)}</span>
          </div>
          <div className="linha">
            <span>
              <i style={{ background: "var(--div-ganho)" }} />
              Oportunidade
            </span>
            <span>{fmtBRL(dados[foco].ganho)}</span>
          </div>
          <div className="linha">
            <span>Líquido</span>
            <span>{fmtBRL(dados[foco].liquido)}</span>
          </div>
          <div className="linha">
            <span>Acumulado</span>
            <span>{fmtBRL(acumulado[foco])}</span>
          </div>
        </div>
      )}
      <p className="sub" style={{ marginTop: 6 }}>
        {anualizar && fatorAnual
          ? `Valores anualizados: o período do cálculo multiplicado por ${fatorAnual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} (12 ÷ meses analisados), supondo o mesmo volume e as mesmas divergências nos anos seguintes.`
          : "Valores do período analisado no cálculo, supondo as mesmas notas e divergências em cada ano."}
      </p>
      <details style={{ marginTop: 4 }}>
        <summary className="sub" style={{ cursor: "pointer" }}>
          Ver como tabela
        </summary>
        <div className="tabela-rolagem" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Perda</th>
                <th className="num">Oportunidade</th>
                <th className="num">Líquido</th>
                <th className="num">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d, i) => (
                <tr key={d.ano}>
                  <td>{d.ano}</td>
                  <td className="num">{fmtBRL(d.perda)}</td>
                  <td className="num">{fmtBRL(d.ganho)}</td>
                  <td className="num">{fmtBRL(d.liquido)}</td>
                  <td className="num">{fmtBRL(acumulado[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Metodologia({ a }: { a: AnaliseClassificacao }) {
  return (
    <section className="cartao">
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Como a perda e a oportunidade são estimadas</summary>
        <ul className="metodologia">
          <li>
            <strong>O correto é o calculado.</strong> O tributo correto é o IBS + CBS que a PriceTax calculou para o item
            com o <span className="codigo">cclass_calculado</span>, no ano do recorte.
          </li>
          <li>
            <strong>Pela nota</strong> é o mesmo item tributado com a redução do <span className="codigo">cclass_nota</span>,
            segundo a tabela oficial de cClassTrib (CST 000, 200, 222, 400 e 410). Se o calculado tem redução de 60% e a nota,
            de 0%, a nota gera 1 ÷ 0,4 = 2,5 vezes o tributo correto. Quando o correto é isento, usa-se a alíquota cheia do
            próprio recorte.
          </li>
          <li>
            <strong>Vendas:</strong> nota com tributo menor que o correto é <span className="perda">perda</span> (tributo a
            recolher e risco de autuação); maior é <span className="oport">oportunidade</span> (pago a mais, recuperável).
          </li>
          <li>
            <strong>Compras:</strong> crédito pela nota maior que o correto é <span className="perda">perda</span> (risco de
            glosa); menor é <span className="oport">oportunidade</span> (crédito a recuperar).
          </li>
          <li>
            CST com regra própria (alíquota fixa, alíquotas uniformes, diferimento, suspensão, monofásica, transferência de
            crédito, ajustes) e notas sem cClassTrib aparecem nas contagens, mas ficam fora dos valores em R$.
          </li>
          <li>
            Tabela oficial: <a href={a.tabela.fonte}>Portal DF-e (SVRS)</a>, obtida em{" "}
            {new Date(`${a.tabela.obtidoEm}T12:00:00`).toLocaleDateString("pt-BR")}. É uma estimativa para priorizar a
            revisão, não um parecer.
          </li>
        </ul>
      </details>
    </section>
  )
}
