"use client"
import { useState } from "react"
import type { Auditoria as Dados, Detalhe as Galho, Ramo, RamoId } from "@/lib/auditoria"
import { Contador, Erro, Esqueleto } from "./comum"
import { CAUSAS, COR_CAUSA } from "./djf"
import type { Detalhe, Escolha } from "./Painel"
import { api, fmtBRL0, fmtCnpj, fmtPct, useBusca } from "./util"

const PRIMEIROS = 5

export function Auditoria({
  calculo,
  escolha,
  ano,
  periodo,
  ramoInicial,
}: {
  calculo: Detalhe
  escolha: Escolha
  ano: number
  periodo: string
  ramoInicial: RamoId | null
}) {
  const corpo = {
    recorte: { regime: escolha.regime, ano, cenario_vendas: "base", cenario_compras: "base" },
    sentido: "ambas",
  }
  const { dados, erro, carregando } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculo.id}/auditoria`, corpo, s),
    [calculo.id, escolha.regime, ano],
  )
  if (erro) return <Erro erro={erro} />
  if (!dados) return <Esqueleto alturas={[180, 90, 90, 90, 90]} />

  const ramos = [...dados.ramos].sort((a, b) => b.valor - a.valor)
  const aberto = ramoInicial ?? ramos.find((r) => r.valor > 0)?.id ?? null

  return (
    <div className={carregando ? "carregando" : undefined} style={{ display: "grid", gap: "var(--espaco)" }}>
      <section className="bloco surge">
        <span className="heroi-forma" aria-hidden="true" style={{ opacity: 0.9, width: 220, height: 190, right: -70, top: -80 }} />
        <h2>DJF · Dinheiro Jogado Fora em {dados.ano}</h2>
        <p className="numero-gigante" style={{ color: "var(--amarelo)" }}>
          <Contador valor={dados.djf} formatar={fmtBRL0} />
        </p>
        <p className="apoio">Quanto a empresa perde, {periodo}, por quatro causas que dá para corrigir.</p>
      </section>

      <div className="ramos">
        {ramos.map((r) => (
          <Causa key={r.id} ramo={r} total={dados.djf} calculoId={calculo.id} corpo={corpo} abertoInicial={r.id === aberto} />
        ))}
      </div>

      {(dados.risco.compras > 0 || dados.risco.vendas > 0) && (
        <div className="alerta">
          <strong>Atenção: risco fiscal de {fmtBRL0(dados.risco.compras + dados.risco.vendas)}</strong>
          Notas com classificação errada a favor da empresa: {fmtBRL0(dados.risco.vendas)} de imposto que deveria ter sido cobrado nas vendas e{" "}
          {fmtBRL0(dados.risco.compras)} de crédito a mais nas compras. Não é dinheiro perdido, mas pode virar autuação.
        </div>
      )}

      <details className="ver-detalhes">
        <summary>Como o DJF é calculado</summary>
        <ul className="nota" style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>
            Fornecedores cobrando a mais e preço desatualizado: diferença entre os cenários Ajustado e Sem Reajuste da Pricetax, no mesmo regime e
            ano.
          </li>
          <li>
            Crédito que ficou para trás e imposto pago a mais: classificação fiscal (cClassTrib) da nota comparada com a calculada pela Pricetax,
            usando a tabela oficial do <a href={dados.tabela.fonte}>Portal DF-e</a> e mantido o valor da nota. É uma estimativa.
          </li>
          <li>Valores do período analisado no cálculo.</li>
        </ul>
      </details>
    </div>
  )
}

function Causa({
  ramo,
  total,
  calculoId,
  corpo,
  abertoInicial,
}: {
  ramo: Ramo
  total: number
  calculoId: string
  corpo: object
  abertoInicial: boolean
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  const [todos, setTodos] = useState(false)
  const c = CAUSAS[ramo.id]
  const lista = todos ? ramo.detalhes : ramo.detalhes.slice(0, PRIMEIROS)
  const maior = Math.max(0, ...ramo.detalhes.map((d) => d.valor))
  return (
    <div className="ramo">
      <button aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span className="marca-causa" style={{ background: COR_CAUSA[ramo.id] }} />
        <span>
          <span className="titulo-ramo">{c.titulo}</span>
          <span className="resumo-ramo" style={{ display: "block" }}>
            {c.frase}
          </span>
        </span>
        <span className="valor-ramo">
          <strong>{ramo.disponivel ? fmtBRL0(ramo.valor) : "sem dado"}</strong>
          {ramo.disponivel && total > 0 && <span>{fmtPct(ramo.valor / total)} do DJF</span>}
        </span>
      </button>
      {aberto && (
        <div className="ramo-corpo">
          {ramo.motivo && <p className="nota">{ramo.motivo}</p>}
          {ramo.detalhes.length === 0 && !ramo.motivo && <p className="nota">Nenhum caso encontrado.</p>}
          {lista.length > 0 && (
            <>
              <p className="rotulo">
                {c.alvo === "fornecedor" ? "Fornecedores" : "Itens"} que mais pesam · o que fazer: {c.acao.toLowerCase()}
              </p>
              <div className="galhos">
                {lista.map((g) => (
                  <GalhoItem key={g.chave} galho={g} maior={maior} calculoId={calculoId} corpo={corpo} ramo={ramo.id} />
                ))}
              </div>
              {ramo.detalhes.length > PRIMEIROS && (
                <button className="link" onClick={() => setTodos((t) => !t)}>
                  {todos ? "Mostrar só os principais" : `Mostrar todos (${ramo.detalhes.length})`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function GalhoItem({ galho, maior, calculoId, corpo, ramo }: { galho: Galho; maior: number; calculoId: string; corpo: object; ramo: RamoId }) {
  const [aberto, setAberto] = useState(false)
  const filhos = useBusca(
    aberto && galho.abrir
      ? (s) => api<{ detalhes: Galho[] }>(`/api/calculos/${calculoId}/auditoria/detalhe`, { ...corpo, ...galho.abrir }, s)
      : null,
    [aberto],
  )
  const maiorFilho = Math.max(0, ...(filhos.dados?.detalhes ?? []).map((d) => d.valor))
  const abrirTexto = ramo === "repasse" ? "Ver itens" : ramo === "preco" ? "Ver clientes" : null
  return (
    <div className="galho">
      <div className="galho-linha">
        <span>
          <span className="galho-nome">{galho.rotulo}</span>
          {galho.sub && (
            <span className="galho-sub" style={{ display: "block" }}>
              {fmtCnpj(galho.sub)}
            </span>
          )}
        </span>
        <span className="galho-valor">{fmtBRL0(galho.valor)}</span>
      </div>
      <div className="galho-barra">
        <div className="cresce" style={{ width: `${maior ? (galho.valor / maior) * 100 : 0}%` }} />
      </div>
      {galho.abrir && abrirTexto && (
        <button className="link" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          {aberto ? "Fechar" : abrirTexto}
        </button>
      )}
      {aberto && (
        <>
          {filhos.erro != null && <Erro erro={filhos.erro} />}
          {!filhos.dados && !filhos.erro && <span className="nota">Carregando…</span>}
          {filhos.dados && filhos.dados.detalhes.length === 0 && <span className="nota">Nenhum caso.</span>}
          {filhos.dados && filhos.dados.detalhes.length > 0 && (
            <div className="galhos">
              {filhos.dados.detalhes.slice(0, 10).map((f) => (
                <GalhoItem key={f.chave} galho={f} maior={maiorFilho} calculoId={calculoId} corpo={corpo} ramo={ramo} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
