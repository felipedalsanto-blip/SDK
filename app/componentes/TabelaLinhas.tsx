"use client"
import { useEffect, useState } from "react"
import { TIPOS_LINHA, type LinhaResumida, type Selecao } from "@/lib/catalogo"
import { Erro } from "./comum"
import { api, ErroApi, fmtBRL, fmtData, fmtInt, fmtPct } from "./util"

type Pagina = { linhas: LinhaResumida[]; total_linhas: number; proximo_cursor: string | null }
const POR_PAGINA = 50

/** Itens de nota do recorte, uma página por vez (cursor da API). O pai troca a `key` quando o recorte muda. */
export function TabelaLinhas({ calculoId, selecao }: { calculoId: string; selecao: Selecao; chave: string }) {
  // cursores[i] é o cursor que abre a página i (a primeira não tem cursor).
  const [cursores, setCursores] = useState<(string | null)[]>([null])
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [erro, setErro] = useState<unknown>(null)
  const [carregando, setCarregando] = useState(false)

  const atual = cursores.length - 1
  useEffect(() => {
    const ctl = new AbortController()
    setCarregando(true)
    setErro(null)
    api<Pagina>(`/api/calculos/${calculoId}/linhas`, { ...selecao, limite: POR_PAGINA, cursor: cursores[atual] }, ctl.signal)
      .then((p) => setPagina(p))
      .catch((e) => {
        if (ctl.signal.aborted) return
        // O cálculo foi refeito no meio da paginação: recomeça da primeira página.
        if (e instanceof ErroApi && e.codigo === "cursor_invalido" && atual > 0) setCursores([null])
        else setErro(e)
      })
      .finally(() => !ctl.signal.aborted && setCarregando(false))
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursores])

  const inicio = atual * POR_PAGINA

  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Itens de nota</h2>
          <p className="sub">Cada linha é um item de nota recalculado antes e depois da reforma, no ano do recorte.</p>
        </div>
      </div>
      {erro != null && <Erro erro={erro} />}
      {!erro && pagina && pagina.linhas.length === 0 && <div className="vazio">Nenhum item neste recorte.</div>}
      {!erro && !pagina && <div className="vazio">Carregando…</div>}
      {!erro && pagina && pagina.linhas.length > 0 && (
        <div className={carregando ? "carregando" : undefined} aria-busy={carregando}>
          <div className="tabela-rolagem" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Sentido</th>
                  <th>Tipo</th>
                  <th>Produto / serviço</th>
                  <th>NCM</th>
                  <th>CFOP</th>
                  <th>Outra parte</th>
                  <th className="num">Valor antes</th>
                  <th className="num">Valor depois</th>
                  <th className="num">Tributos antes</th>
                  <th className="num">Tributos depois</th>
                  <th className="num">Carga antes</th>
                  <th className="num">Carga depois</th>
                </tr>
              </thead>
              <tbody>
                {pagina.linhas.map((l, i) => (
                  <tr key={`${String(l.input_id)}-${i}`}>
                    <td>{fmtData(l.data_operacao)}</td>
                    <td>{l.tipo_movimentacao === "saida" ? "Venda" : l.tipo_movimentacao === "entrada" ? "Compra" : "—"}</td>
                    <td>{TIPOS_LINHA[String(l.tipo_linha)] ?? l.tipo_linha ?? "—"}</td>
                    <td className="texto" title={String(l.descricao_produto ?? "")}>
                      {l.descricao_produto ?? "—"}
                    </td>
                    <td>{l.ncm ?? "—"}</td>
                    <td>{l.cfop ?? "—"}</td>
                    <td className="texto" title={String(l.razao_social_outra_parte ?? "")}>
                      {l.razao_social_outra_parte ?? "—"}
                    </td>
                    <td className="num">{fmtBRL(l.valor_ar)}</td>
                    <td className="num">{fmtBRL(l.valor_dr)}</td>
                    <td className="num">{fmtBRL(l.valor_impostos_ar)}</td>
                    <td className="num">{fmtBRL(l.valor_impostos_dr)}</td>
                    <td className="num">{fmtPct(l.porcentagem_carga_tributaria_ar)}</td>
                    <td className="num">{fmtPct(l.porcentagem_carga_tributaria_dr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="paginacao">
            <span>
              {fmtInt(inicio + 1)}–{fmtInt(inicio + pagina.linhas.length)} de {fmtInt(pagina.total_linhas)}
            </span>
            <div>
              <button className="botao" disabled={atual === 0 || carregando} onClick={() => setCursores((c) => c.slice(0, -1))}>
                ← Anterior
              </button>
              <button
                className="botao"
                disabled={!pagina.proximo_cursor || carregando}
                onClick={() => setCursores((c) => [...c, pagina.proximo_cursor])}
              >
                Próxima →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
