"use client"
import { useEffect, useMemo, useState } from "react"
import type { Exploracao } from "@/lib/explorar"
import { AGRUPADORES, GRUPOS_COLUNAS, type Agrupador } from "@/lib/tributos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtCnpj, fmtInt, fmtPct } from "../util"
import { useAbrirFicha } from "./ficha-contexto"
import { Abrivel, Diferenca } from "./ui"

const REGIMES: Record<string, string> = { simplesNacional: "Simples Nacional", lucroReal: "Lucro Real", lucroPresumido: "Lucro Presumido" }
const NOME_COLUNA = Object.fromEntries(GRUPOS_COLUNAS.flatMap((g) => g.metricas.map((m) => [m.id, m.nome])))
const ehPercentual = (m: string) => m.startsWith("carga_efetiva")
const ehContagem = (m: string) => m === "itens" || m === "quantidade"

type Props = { calculoId: string; regime: string; ano: number; sentido: "entrada" | "saida"; cenario?: string }

/**
 * Monte a sua visão: escolha os agrupadores (na ordem), as colunas por grupo e a ordenação.
 * Nasce na visão por item com o fornecedor (compras) ou cliente (vendas).
 */
export function Explorador({ calculoId, regime, ano, sentido, cenario }: Props) {
  const compras = sentido === "entrada"
  const [agrupar, setAgrupar] = useState<Agrupador[]>(["descricao_produto", "cnpj_outra_parte"])
  const [colunas, setColunas] = useState<string[]>(
    compras ? ["valor_ar", "valor_dr", "custo_ar", "custo_dr"] : ["valor_ar", "valor_dr", "valor_impostos_ar", "valor_impostos_dr"],
  )
  const [ordenar, setOrdenar] = useState<string>("valor_ar")
  const [direcao, setDirecao] = useState<"desc" | "asc">("desc")
  const [paginas, setPaginas] = useState<Exploracao[]>([])
  const [erro, setErro] = useState<unknown>(null)
  const [carregando, setCarregando] = useState(false)
  const [painel, setPainel] = useState(false)
  const abrir = useAbrirFicha()

  const ordenacao = colunas.includes(ordenar) ? ordenar : colunas[0]
  const chave = JSON.stringify({ calculoId, regime, ano, sentido, cenario, agrupar, colunas, ordenacao, direcao })

  async function carregar(pagina: number) {
    setCarregando(true)
    setErro(null)
    try {
      const r = await api<Exploracao>(`/api/calculos/${calculoId}/explorar`, {
        regime,
        ano,
        sentido,
        cenario,
        agrupar_por: agrupar,
        metricas: colunas,
        ordenar: ordenacao,
        direcao,
        pagina,
      })
      setPaginas((p) => (pagina === 0 ? [r] : [...p, r]))
    } catch (e) {
      setErro(e)
    } finally {
      setCarregando(false)
    }
  }
  useEffect(() => {
    if (agrupar.length && colunas.length) carregar(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const grupos = paginas.flatMap((p) => p.grupos)
  const nomes = Object.assign({}, ...paginas.map((p) => p.nomes)) as Record<string, string>
  const total = paginas[0]?.total ?? 0

  // Quando há AR e DR da mesma medida, a diferença entra logo depois do DR.
  const exibidas = useMemo(() => {
    const lista: { id: string; nome: string; dif?: [string, string] }[] = []
    for (const c of colunas) {
      lista.push({ id: c, nome: NOME_COLUNA[c] ?? c })
      if (c.endsWith("_dr") && colunas.includes(`${c.slice(0, -3)}_ar`) && !ehPercentual(c)) {
        lista.push({ id: `dif-${c}`, nome: `Dif. ${(NOME_COLUNA[c] ?? c).replace(/ DR$/, "")}`, dif: [`${c.slice(0, -3)}_ar`, c] })
      }
    }
    return lista
  }, [colunas])

  const rotulo = (d: Agrupador, v: unknown) => {
    if (v === null || v === undefined || v === "") return "Sem informação"
    if (d === "cnpj_outra_parte") return nomes[String(v)] ?? fmtCnpj(String(v))
    if (d === "regime_outra_parte") return REGIMES[String(v)] ?? String(v)
    return String(v)
  }
  const formatar = (m: string, v: unknown) => {
    const n = typeof v === "number" ? v : null
    if (n === null) return "n/d"
    if (ehPercentual(m)) return fmtPct(n)
    if (ehContagem(m)) return fmtInt(n)
    return fmtBRL(n)
  }

  const moverAgrupador = (d: Agrupador) =>
    setAgrupar((a) => (a.includes(d) ? a.filter((x) => x !== d) : a.length >= 4 ? a : [...a, d]))
  const alternarColuna = (m: string) => setColunas((c) => (c.includes(m) ? c.filter((x) => x !== m) : [...c, m]))
  const nivelGrupo = (g: string): 0 | 1 | 2 => {
    const ms = GRUPOS_COLUNAS.find((x) => x.id === g)!.metricas.map((m) => m.id as string)
    const marcadas = ms.filter((m) => colunas.includes(m))
    if (marcadas.length === 0) return 0
    return marcadas.length > 2 ? 2 : 1
  }
  const definirGrupo = (g: string, nivel: 0 | 1 | 2) => {
    const ms = GRUPOS_COLUNAS.find((x) => x.id === g)!.metricas.map((m) => m.id as string)
    const escolhidas = nivel === 0 ? [] : nivel === 1 ? ms.slice(0, 2) : ms
    setColunas((c) => [...c.filter((x) => !ms.includes(x)), ...escolhidas])
  }

  function baixarCsv() {
    const cab = [...agrupar.map((d) => AGRUPADORES[d]), ...exibidas.map((c) => c.nome)]
    const linhas = grupos.map((g) => [
      ...agrupar.map((d) => rotulo(d, g[d])),
      ...exibidas.map((c) => {
        const v = c.dif ? (Number(g[c.dif[1]]) || 0) - (Number(g[c.dif[0]]) || 0) : g[c.id]
        return typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "")
      }),
    ])
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map((x) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(";")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `visao-${compras ? "compras" : "vendas"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cap-explorar">
      <p className="cap-nota">
        <span className="cap-selo-est">ESTIMADO</span> Aqui os valores vêm do cálculo como estão: o IPI e o ICMS incluem os tributos estimados na cadeia,
        mesmo com a chave do topo em &ldquo;Excluir&rdquo;.
      </p>
      <div className="cap-explorar-barra">
        <div className="cap-explorar-agrupar">
          <span className="cap-kpi-rotulo">Agrupar por (na ordem)</span>
          <div className="cap-chips">
            {agrupar.map((d, i) => (
              <button key={d} className="cap-chip ativo" onClick={() => moverAgrupador(d)} title="Remover">
                {i + 1}. {AGRUPADORES[d]} ✕
              </button>
            ))}
            {(Object.keys(AGRUPADORES) as Agrupador[])
              .filter((d) => !agrupar.includes(d))
              .map((d) => (
                <button key={d} className="cap-chip" onClick={() => moverAgrupador(d)} disabled={agrupar.length >= 4}>
                  + {AGRUPADORES[d]}
                </button>
              ))}
          </div>
        </div>
        <div className="cap-grupos">
          {GRUPOS_COLUNAS.filter((g) => g.id !== "valor" && (compras ? g.id !== "debitos" : g.id !== "creditos")).map((g) => (
            <span key={g.id} className="cap-grupo">
              <b>{g.nome}</b>
              {(["Recolher", "Totais", "Por tributo"] as const).map((r, i) => (
                <button key={r} aria-pressed={nivelGrupo(g.id) === i} onClick={() => definirGrupo(g.id, i as 0 | 1 | 2)}>
                  {r}
                </button>
              ))}
            </span>
          ))}
          <button className="cap-link" onClick={() => setPainel((p) => !p)} aria-expanded={painel}>
            {painel ? "Fechar colunas" : "Escolher colunas uma a uma"}
          </button>
        </div>
        {painel && (
          <div className="cap-colunas">
            {GRUPOS_COLUNAS.map((g) => (
              <fieldset key={g.id}>
                <legend>{g.nome}</legend>
                {g.metricas.map((m) => (
                  <label key={m.id}>
                    <input type="checkbox" checked={colunas.includes(m.id)} onChange={() => alternarColuna(m.id)} /> {m.nome}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}
        <div className="cap-alternar-linha">
          <label className="cap-sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            Ordenar por
            <select value={ordenacao} onChange={(e) => setOrdenar(e.target.value)}>
              {colunas.map((c) => (
                <option key={c} value={c}>
                  {NOME_COLUNA[c] ?? c}
                </option>
              ))}
            </select>
          </label>
          <button className="cap-chip" onClick={() => setDirecao((d) => (d === "desc" ? "asc" : "desc"))}>
            {direcao === "desc" ? "Maior primeiro ▾" : "Menor primeiro ▴"}
          </button>
          <button className="cap-chip" onClick={baixarCsv} disabled={grupos.length === 0}>
            ⬇ Baixar CSV
          </button>
          <span className="cap-sub">
            {grupos.length ? `${fmtInt(grupos.length)} de ${fmtInt(total)} linhas` : ""}
          </span>
        </div>
      </div>

      {erro != null && <Erro erro={erro} />}
      {agrupar.length === 0 || colunas.length === 0 ? (
        <p className="cap-vazio">Escolha ao menos um agrupador e uma coluna.</p>
      ) : (
        <div className={`tabela-rolagem${carregando ? " carregando" : ""}`}>
          <table className="cap-tabela">
            <thead>
              <tr>
                {agrupar.map((d) => (
                  <th key={d}>{AGRUPADORES[d]}</th>
                ))}
                {exibidas.map((c) => (
                  <th key={c.id} className="num">
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g, i) => (
                <tr key={i}>
                  {agrupar.map((d) => (
                    <td key={d} className="texto" title={rotulo(d, g[d])}>
                      {d === "cnpj_outra_parte" && g[d] ? (
                        <>
                          <Abrivel ativo={!!abrir} onAbrir={() => abrir?.({ tipo: "parceiro", valor: String(g[d]), rotulo: rotulo(d, g[d]) })}>
                            <b>{rotulo(d, g[d])}</b>
                          </Abrivel>
                          <span className="cap-sub">{fmtCnpj(String(g[d]))}</span>
                        </>
                      ) : d === "descricao_produto" && g[d] ? (
                        <Abrivel ativo={!!abrir} onAbrir={() => abrir?.({ tipo: "item", valor: String(g[d]), rotulo: String(g[d]) })}>
                          {rotulo(d, g[d])}
                        </Abrivel>
                      ) : (
                        rotulo(d, g[d])
                      )}
                    </td>
                  ))}
                  {exibidas.map((c) => (
                    <td key={c.id} className="num">
                      {c.dif ? <Diferenca valor={(Number(g[c.dif[1]]) || 0) - (Number(g[c.dif[0]]) || 0)} subirEhBom={c.id.includes("credito")} /> : formatar(c.id, g[c.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {grupos.length > 0 && grupos.length < total && (
        <button className="cap-chip" style={{ justifySelf: "start" }} disabled={carregando} onClick={() => carregar(paginas.length)}>
          Carregar mais {fmtInt(Math.min(200, total - grupos.length))} linhas
        </button>
      )}
    </div>
  )
}
