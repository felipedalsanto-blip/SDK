"use client"
import { useState } from "react"
import type { CalculoDetalhe } from "@pricetax/sdk"
import type { Selecao } from "@/lib/catalogo"
import {
  SITUACOES,
  type AnaliseClassificacao,
  type CelulaCst,
  type Codigo,
  type PontoProjecao,
} from "@/lib/classificacao"
import { Erro } from "./comum"
import { escalaBonita } from "./GraficoSerie"
import { api, fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, fmtPct, useBusca, useLargura } from "./util"

const SENTIDO_CURTO = { entrada: "Compra", saida: "Venda" } as const

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
  const analise = useBusca(
    (s) => api<AnaliseClassificacao>(`/api/calculos/${calculo.id}/classificacao`, selecao, s),
    [calculo.id, chave],
  )
  const projecao = useBusca(
    (s) => api<{ projecao: PontoProjecao[] }>(`/api/calculos/${calculo.id}/classificacao/projecao`, selecao, s),
    [calculo.id, chaveProjecao],
  )
  const a = analise.dados

  return (
    <>
      {analise.erro != null && <Erro erro={analise.erro} />}
      {!a && !analise.erro && <div className="cartao vazio">Comparando as classificações das notas com as calculadas…</div>}
      {a && (
        <div className={analise.carregando ? "carregando" : undefined} style={{ display: "grid", gap: 16 }}>
          <Indicadores a={a} />
          {a.parcial && (
            <div className="aviso">
              Este recorte tem muitos grupos: os rankings abaixo cobrem os maiores por valor. Os totais acima são
              completos.
            </div>
          )}
        </div>
      )}

      <section className="cartao">
        <div className="cabeca">
          <div>
            <h2>Projeção ano a ano</h2>
            <p className="sub">
              Perda e ganho potenciais das divergências em cada ano da transição, com as alíquotas de cada ano.
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
          <Pares a={a} />
          <div className="grade-2">
            <MatrizCst celulas={a.cst} nomes={a.nomesCst} />
            <Fornecedores a={a} />
          </div>
          <Itens a={a} />
          <Metodologia a={a} />
        </>
      )}
    </>
  )
}

function Indicadores({ a }: { a: AnaliseClassificacao }) {
  const r = a.resumo
  const classificados = r.porSituacao.conforme.itens + r.porSituacao.divergente.itens
  const liquido = r.ganho - r.perda
  return (
    <div className="kpis">
      <div className="cartao kpi">
        <div className="rotulo">Itens divergentes · {a.ano}</div>
        <div className="valor">{fmtInt(r.porSituacao.divergente.itens)}</div>
        <div className="antes">
          {classificados ? fmtPct(r.porSituacao.divergente.itens / classificados) : "—"} dos itens com cClassTrib na nota ·{" "}
          {fmtBRL(r.porSituacao.divergente.valor)}
        </div>
      </div>
      <div className="cartao kpi">
        <div className="rotulo">Perda potencial · {a.ano}</div>
        <div className="valor">{fmtBRL(r.perda)}</div>
        <div className="antes">Tributo a recolher ou crédito a glosar</div>
      </div>
      <div className="cartao kpi">
        <div className="rotulo">Ganho potencial · {a.ano}</div>
        <div className="valor">{fmtBRL(r.ganho)}</div>
        <div className="antes">Tributo pago a mais ou crédito a recuperar</div>
      </div>
      <div className="cartao kpi">
        <div className="rotulo">Impacto líquido · {a.ano}</div>
        <div className="valor">{fmtBRL(liquido)}</div>
        <div className="antes">
          <span className={liquido < 0 ? "perda" : liquido > 0 ? "ganho" : undefined}>
            {liquido < 0 ? "▼ perda líquida" : liquido > 0 ? "▲ ganho líquido" : "sem efeito"}
          </span>
        </div>
      </div>
      <div className="cartao kpi">
        <div className="rotulo">{SITUACOES.sem_nota}</div>
        <div className="valor">{fmtInt(r.porSituacao.sem_nota.itens)}</div>
        <div className="antes">
          {fmtBRL(r.porSituacao.sem_nota.valor)} · fora da comparação
          {r.naoEstimado.itens > 0 && ` · ${fmtInt(r.naoEstimado.itens)} divergentes sem estimativa`}
        </div>
      </div>
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

function Impacto({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined) return <span className="etiqueta">não estimado</span>
  if (Math.abs(valor) < 0.005) return <span>{fmtBRL(0)}</span>
  return <span className={valor < 0 ? "perda" : "ganho"}>{`${valor < 0 ? "▼ " : "▲ "}${fmtBRL(Math.abs(valor))}`}</span>
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
        <div className="tabela-rolagem">
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

function Pares({ a }: { a: AnaliseClassificacao }) {
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>cClassTrib: divergências</h2>
          <p className="sub">Cada par nota → calculado, com o tributo IBS + CBS pelas duas classificações em {a.ano}.</p>
        </div>
      </div>
      {a.pares.length === 0 ? (
        <div className="vazio">Nenhuma divergência de cClassTrib neste recorte.</div>
      ) : (
        <div className="tabela-rolagem" style={{ maxHeight: 460 }}>
          <table>
            <thead>
              <tr>
                <th>Notas</th>
                <th>Nota</th>
                <th>Calculado</th>
                <th className="num">Itens</th>
                <th className="num">Pela nota</th>
                <th className="num">Correto</th>
                <th className="num">Impacto</th>
              </tr>
            </thead>
            <tbody>
              {a.pares.map((p, i) => (
                <tr key={i}>
                  <td>{SENTIDO_CURTO[p.sentido]}</td>
                  <td>
                    <CodigoComNome c={p.nota} />
                  </td>
                  <td>
                    <CodigoComNome c={p.calculado} />
                  </td>
                  <td className="num">{fmtInt(p.itens)}</td>
                  <td className="num">{p.estimativa ? fmtBRL(p.estimativa.pelaNota) : "—"}</td>
                  <td className="num">{p.estimativa ? fmtBRL(p.estimativa.correto) : "—"}</td>
                  <td className="num">
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

function Itens({ a }: { a: AnaliseClassificacao }) {
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Itens críticos</h2>
          <p className="sub">Produtos e serviços com maior perda potencial por classificação divergente em {a.ano}.</p>
        </div>
      </div>
      {a.itens.length === 0 ? (
        <div className="vazio">Nenhum item divergente.</div>
      ) : (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Notas</th>
                <th>Nota → calculado</th>
                <th className="num">Itens</th>
                <th className="num">Perda</th>
                <th className="num">Ganho</th>
              </tr>
            </thead>
            <tbody>
              {a.itens.map((it, i) => (
                <tr key={i}>
                  <td className="texto" title={it.descricao ?? undefined}>
                    {it.descricao ?? "—"}
                  </td>
                  <td>{SENTIDO_CURTO[it.sentido]}</td>
                  <td className="codigo">
                    <ListaPares pares={it.pares} />
                  </td>
                  <td className="num">{fmtInt(it.itens)}</td>
                  <td className="num">{it.perda ? <span className="perda">{fmtBRL(it.perda)}</span> : "—"}</td>
                  <td className="num">{it.ganho ? <span className="ganho">{fmtBRL(it.ganho)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Fornecedores({ a }: { a: AnaliseClassificacao }) {
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Fornecedores críticos</h2>
          <p className="sub">Quem mais emite notas de compra com cClassTrib divergente, por perda potencial em {a.ano}.</p>
        </div>
      </div>
      {a.fornecedores === null ? (
        <div className="vazio">Escolha “Todas” ou “Compras” em Notas para ver os fornecedores.</div>
      ) : a.fornecedores.length === 0 ? (
        <div className="vazio">Nenhum fornecedor com divergência.</div>
      ) : (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Nota → calculado</th>
                <th className="num">Itens</th>
                <th className="num">Perda</th>
                <th className="num">Ganho</th>
              </tr>
            </thead>
            <tbody>
              {a.fornecedores.map((f, i) => (
                <tr key={i}>
                  <td className="texto" title={f.razaoSocial ?? undefined}>
                    {f.razaoSocial ?? "—"}
                    <span className="nome-codigo">{f.cnpj ? fmtCnpj(f.cnpj) : "sem CNPJ"}</span>
                  </td>
                  <td className="codigo">
                    <ListaPares pares={f.pares} />
                  </td>
                  <td className="num">{fmtInt(f.itens)}</td>
                  <td className="num">{f.perda ? <span className="perda">{fmtBRL(f.perda)}</span> : "—"}</td>
                  <td className="num">{f.ganho ? <span className="ganho">{fmtBRL(f.ganho)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
                <i style={{ background: "var(--div-ganho)" }} /> Ganho potencial
              </span>
              <span>
                <i style={{ background: "var(--div-perda)" }} /> Perda potencial
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
      <svg height={ALTURA} role="img" aria-label="Projeção de perda e ganho por ano" onMouseLeave={() => setFoco(null)}>
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
              Ganho
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
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Perda</th>
                <th className="num">Ganho</th>
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
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Como a perda e o ganho são estimados</summary>
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
            recolher e risco de autuação); maior é <span className="ganho">ganho</span> (pago a mais, recuperável).
          </li>
          <li>
            <strong>Compras:</strong> crédito pela nota maior que o correto é <span className="perda">perda</span> (risco de
            glosa); menor é <span className="ganho">ganho</span> (crédito a recuperar).
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
