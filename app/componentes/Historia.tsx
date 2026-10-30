"use client"
import type { Auditoria, RamoId } from "@/lib/auditoria"
import type { Bloco, Executivo } from "@/lib/executivo"
import { Erro } from "./comum"
import { CAUSAS, COR_CAUSA } from "./djf"
import type { Detalhe, Escolha } from "./Painel"
import { api, fmtBRL, fmtBRL0, fmtBRLCurto, useBusca, variacao } from "./util"

const COR = { hoje: "var(--cor-hoje)", transicao: "var(--cor-transicao)", pleno: "var(--cor-pleno)" }

/** "▲ 32%" ou "▼ 19%": a variação em uma palavra, sem casas demais. */
function seta(antes: number, depois: number) {
  const v = variacao(antes, depois)
  if (v === null || v === 0) return "sem mudança"
  return `${v > 0 ? "▲" : "▼"} ${Math.abs(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}

export function Historia({
  calculo,
  escolha,
  ano,
  periodo,
  onAbrirAuditoria,
}: {
  calculo: Detalhe
  escolha: Escolha
  ano: number
  periodo: string
  onAbrirAuditoria: (ramo: RamoId) => void
}) {
  const recorte = { regime: escolha.regime, ano, cenario_vendas: escolha.cenarioVendas, cenario_compras: escolha.cenarioCompras }
  const exec = useBusca(
    (s) => api<Executivo>(`/api/calculos/${calculo.id}/executivo`, { recorte, sentido: "ambas" }, s),
    [calculo.id, escolha.regime, escolha.cenarioVendas, escolha.cenarioCompras],
  )
  const djf = useBusca(
    (s) =>
      api<Auditoria>(
        `/api/calculos/${calculo.id}/auditoria`,
        { recorte: { regime: escolha.regime, ano, cenario_vendas: "base", cenario_compras: "base" }, sentido: "ambas" },
        s,
      ),
    [calculo.id, escolha.regime, ano],
  )

  if (exec.erro) return <Erro erro={exec.erro} />
  if (!exec.dados) return <div className="vazio">Lendo os números do cálculo…</div>
  const d = exec.dados
  const alvo = d.serie.find((p) => p.ano === ano)
  if (!alvo) return <div className="alerta">Este cálculo não tem o ano {ano}.</div>
  if (d.hoje.vendas.itens === 0 && d.hoje.compras.itens === 0) {
    return <div className="alerta">Este regime não tem notas no cálculo escolhido. Troque o regime ou o cálculo.</div>
  }
  const pleno = ano === escolha.anoPleno

  return (
    <div className={exec.carregando ? "carregando" : undefined} style={{ display: "grid", gap: "var(--espaco)" }}>
      <Passo1 hoje={d.hoje} alvo={alvo} serie={d.serie} pleno={pleno} periodo={periodo} anoPleno={escolha.anoPleno} />
      <Passo2 hoje={d.hoje} alvo={alvo} />
      <Passo3 dados={djf.dados} erro={djf.erro} ano={ano} onAbrir={onAbrirAuditoria} />
      <Passo4 dados={djf.dados} />
    </div>
  )
}

function Passo({ n, pergunta, children }: { n: number; pergunta: string; children: React.ReactNode }) {
  return (
    <section className="passo">
      <div className="passo-cabeca">
        <span className="passo-numero">{n}</span>
        <h2>{pergunta}</h2>
      </div>
      <div className="passo-corpo">{children}</div>
    </section>
  )
}

/** Duas barras lado a lado: hoje e o ano escolhido, na mesma escala. */
function HojeContraAno({ hoje, valor, ano, pleno }: { hoje: number; valor: number; ano: number; pleno: boolean }) {
  const max = Math.max(Math.abs(hoje), Math.abs(valor), 1)
  return (
    <div className="comparativo">
      {(
        [
          ["Hoje", hoje, COR.hoje],
          [String(ano), valor, pleno ? COR.pleno : COR.transicao],
        ] as const
      ).map(([rotulo, v, cor]) => (
        <div key={rotulo} className="comparativo-linha">
          <span className="comparativo-rotulo">{rotulo}</span>
          <div className="comparativo-trilho">
            <div style={{ width: `${(Math.max(0, v) / max) * 100}%`, background: cor }} />
          </div>
          <span className="comparativo-valor">{fmtBRL0(v)}</span>
        </div>
      ))}
    </div>
  )
}

function Passo1({
  hoje,
  alvo,
  serie,
  pleno,
  periodo,
  anoPleno,
}: {
  hoje: Bloco
  alvo: Bloco & { ano: number }
  serie: (Bloco & { ano: number })[]
  pleno: boolean
  periodo: string
  anoPleno: number
}) {
  const dif = alvo.saldo - hoje.saldo
  const max = Math.max(1, hoje.saldo, ...serie.map((p) => p.saldo))
  return (
    <Passo n={1} pergunta="Quanto muda?">
      <p className="numero-gigante">
        {dif === 0 ? "Nada muda" : `${fmtBRL0(Math.abs(dif))} ${dif < 0 ? "a menos" : "a mais"}`}
      </p>
      <p className="frase">
        de imposto sobre o consumo a pagar em {alvo.ano}, comparado com hoje, {periodo}.
      </p>
      <HojeContraAno hoje={hoje.saldo} valor={alvo.saldo} ano={alvo.ano} pleno={pleno} />
      <details className="ver-detalhes">
        <summary>Ver ano a ano</summary>
        <div className="mini-colunas" role="img" aria-label="Imposto a pagar em cada ano">
          {[{ ano: "Hoje", saldo: hoje.saldo, cor: COR.hoje }, ...serie.map((p) => ({ ano: String(p.ano), saldo: p.saldo, cor: p.ano === anoPleno ? COR.pleno : COR.transicao }))].map(
            (c) => (
              <div key={c.ano} className="mini-coluna" title={`${c.ano}: ${fmtBRL(c.saldo)}`}>
                <span className="mini-valor">{fmtBRLCurto(c.saldo)}</span>
                <div className="mini-trilho">
                  <div style={{ height: `${(Math.max(0, c.saldo) / max) * 100}%`, background: c.cor }} />
                </div>
                <span className={`mini-ano${c.ano === String(alvo.ano) ? " atual" : ""}`}>{c.ano}</span>
              </div>
            ),
          )}
        </div>
        <p className="nota">Imposto a pagar = imposto sobre as vendas menos o crédito das compras, no período analisado.</p>
      </details>
    </Passo>
  )
}

function Passo2({ hoje, alvo }: { hoje: Bloco; alvo: Bloco & { ano: number } }) {
  const vendasCai = alvo.vendas.tributos < hoje.vendas.tributos
  const creditoSobe = alvo.compras.credito > hoje.compras.credito
  const frase =
    vendasCai && creditoSobe
      ? "O imposto sobre as vendas cai e o crédito das compras sobe: as duas coisas reduzem o que a empresa paga."
      : !vendasCai && !creditoSobe
        ? "O imposto sobre as vendas sobe e o crédito das compras cai: as duas coisas aumentam o que a empresa paga."
        : creditoSobe
          ? "O crédito das compras sobe, mas o imposto sobre as vendas também sobe."
          : "O imposto sobre as vendas cai, mas o crédito das compras também cai."
  return (
    <Passo n={2} pergunta="Por que muda?">
      <div className="grade grade-2">
        <div className="cartao motivo">
          <span className="rotulo">Imposto sobre as vendas</span>
          <span className="motivo-valor">{seta(hoje.vendas.tributos, alvo.vendas.tributos)}</span>
          <span className="contexto">
            de {fmtBRL0(hoje.vendas.tributos)} para {fmtBRL0(alvo.vendas.tributos)}
          </span>
        </div>
        <div className="cartao motivo">
          <span className="rotulo">Crédito nas compras</span>
          <span className="motivo-valor">{seta(hoje.compras.credito, alvo.compras.credito)}</span>
          <span className="contexto">
            de {fmtBRL0(hoje.compras.credito)} para {fmtBRL0(alvo.compras.credito)}
          </span>
        </div>
      </div>
      <p className="frase">{frase}</p>
      <details className="ver-detalhes">
        <summary>Ver os números completos</summary>
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th />
                <th className="num hoje">Hoje</th>
                <th className="num transicao">{alvo.ano}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Vendas", (b: Bloco) => b.vendas.valor],
                  ["Imposto sobre as vendas", (b: Bloco) => b.vendas.tributos],
                  ["Compras", (b: Bloco) => b.compras.valor],
                  ["Crédito nas compras", (b: Bloco) => b.compras.credito],
                  ["Custo das compras (depois do crédito)", (b: Bloco) => b.compras.custo],
                  ["Imposto a pagar", (b: Bloco) => b.saldo],
                ] as const
              ).map(([rotulo, f]) => (
                <tr key={rotulo}>
                  <th scope="row">{rotulo}</th>
                  <td className="num">{fmtBRL(f(hoje))}</td>
                  <td className="num">{fmtBRL(f(alvo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Passo>
  )
}

function Passo3({ dados, erro, ano, onAbrir }: { dados: Auditoria | null; erro: unknown; ano: number; onAbrir: (r: RamoId) => void }) {
  return (
    <Passo n={3} pergunta="Onde a empresa está perdendo dinheiro?">
      {erro != null && <Erro erro={erro} />}
      {!dados && !erro && <p className="nota">Procurando…</p>}
      {dados && (
        <>
          <p className="numero-gigante">{fmtBRL0(dados.djf)}</p>
          <p className="frase">
            de <b>dinheiro jogado fora (DJF)</b> em {ano}, somando quatro causas que dá para corrigir.
          </p>
          <div className="causas">
            {[...dados.ramos]
              .sort((a, b) => b.valor - a.valor)
              .map((r) => (
                <button key={r.id} className="causa" onClick={() => onAbrir(r.id)} disabled={!r.disponivel}>
                  <span className="causa-topo">
                    <span className="causa-nome">{CAUSAS[r.id].titulo}</span>
                    <span className="causa-valor">{r.disponivel ? fmtBRL0(r.valor) : "sem dado"}</span>
                  </span>
                  <span className="causa-trilho">
                    <span style={{ width: `${dados.djf ? (r.valor / dados.djf) * 100 : 0}%`, background: COR_CAUSA[r.id] }} />
                  </span>
                </button>
              ))}
          </div>
          <p className="nota">Clique numa causa para ver os fornecedores e os itens.</p>
        </>
      )}
    </Passo>
  )
}

function Passo4({ dados }: { dados: Auditoria | null }) {
  const acoes = (dados?.ramos ?? [])
    .filter((r) => r.disponivel && r.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3)
  return (
    <Passo n={4} pergunta="O que fazer?">
      {!dados && <p className="nota">Montando as ações…</p>}
      {dados && acoes.length === 0 && <p className="frase">Nenhuma perda encontrada neste ano.</p>}
      {acoes.length > 0 && (
        <ol className="acoes">
          {acoes.map((r) => {
            const primeiro = r.detalhes[0]
            return (
              <li key={r.id}>
                <span className="acao-texto">
                  <b>{CAUSAS[r.id].acao}</b>
                  {primeiro && (
                    <span className="contexto">
                      começando por {primeiro.rotulo} ({fmtBRL0(primeiro.valor)})
                    </span>
                  )}
                </span>
                <span className="acao-valor">{fmtBRL0(r.valor)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </Passo>
  )
}
