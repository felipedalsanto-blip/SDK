"use client"
import { useState } from "react"
import type { Auditoria as Dados, Detalhe as Galho, Ramo, RamoId } from "@/lib/auditoria"
import { REGIMES } from "@/lib/catalogo"
import { Erro } from "./comum"
import type { Detalhe, Escolha } from "./Painel"
import { api, fmtBRL, fmtCnpj, fmtPct, useBusca } from "./util"

/** Tons dos ramos: só cores da paleta (amarelo, preto, cinza e um cinza claro). */
const COR_RAMO: Record<RamoId, { fundo: string; texto: string }> = {
  repasse: { fundo: "var(--amarelo)", texto: "var(--preto)" },
  preco: { fundo: "var(--cor-pleno)", texto: "var(--texto-sobre-pleno)" },
  credito: { fundo: "var(--cor-hoje)", texto: "var(--branco-neutro)" },
  destaque: { fundo: "var(--cor-neutra-clara)", texto: "var(--texto)" },
}
/** Dentro do bloco escuro, o preto do regime pleno vira branco para aparecer. */
const COR_NO_BLOCO: Record<RamoId, string> = {
  repasse: "var(--amarelo)",
  preco: "var(--branco-neutro)",
  credito: "#8c8c8c",
  destaque: "#4d4d4d",
}

const TEXTO: Record<RamoId, { titulo: string; resumo: string; oQue: string; porQue: string; fazer: string; abrir?: string }> = {
  repasse: {
    titulo: "Fornecedor repassando o tributo sobre o valor cheio",
    resumo: "Compras: o custo sobe se o fornecedor não ajustar o preço",
    oQue: "Quanto o custo das compras sobe quando o fornecedor repassa os novos tributos sobre o valor cheio (cenário Sem Reajuste), em vez de ajustar o preço (Ajustado).",
    porQue: "O fornecedor mantém o preço de hoje e soma os novos tributos por cima. A empresa paga mais pela mesma mercadoria.",
    fazer: "Negociar o repasse com os fornecedores abaixo, começando pelos maiores, antes de cada virada de alíquota.",
    abrir: "Ver itens deste fornecedor",
  },
  preco: {
    titulo: "Preço de venda sem reajuste",
    resumo: "Vendas: a margem encolhe se o preço não acompanhar a nova carga",
    oQue: "Quanto a empresa deixa de receber, já descontados os tributos, se mantiver o preço de hoje (Sem Reajuste) em vez de recalculá-lo para manter a margem (Ajustado).",
    porQue: "A carga sobre as vendas muda com a reforma. Sem reajuste, a diferença sai da margem da empresa.",
    fazer: "Revisar a tabela de preços dos itens abaixo, começando pelos de maior valor.",
    abrir: "Ver clientes deste item",
  },
  credito: {
    titulo: "Crédito de IBS e CBS deixado na mesa",
    resumo: "Compras: o fornecedor classificou o item com mais redução do que o correto",
    oQue: "Crédito que a empresa deixa de tomar porque a nota de compra traz um cClassTrib com mais redução de alíquota do que a classificação correta calculada pela Pricetax.",
    porQue: "O cClassTrib vem do cadastro do fornecedor. Com redução indevida, ele destaca menos tributo e o crédito da empresa encolhe junto.",
    fazer: "Pedir a correção aos fornecedores abaixo e conferir o cClassTrib na entrada das notas.",
  },
  destaque: {
    titulo: "IBS e CBS destacado a mais nas vendas",
    resumo: "Vendas: a empresa classificou o item com menos redução do que o correto",
    oQue: "Tributo que a empresa destaca e recolhe a mais porque a nota de venda traz um cClassTrib com menos redução de alíquota do que a classificação correta.",
    porQue: "O cadastro fiscal do item está desatualizado e não aplica a redução a que ele tem direito.",
    fazer: "Corrigir o cClassTrib dos itens abaixo no cadastro e avaliar a recuperação do que foi pago a mais.",
  },
}

export function Auditoria({ calculo, escolha }: { calculo: Detalhe; escolha: Escolha }) {
  const corpo = {
    recorte: { regime: escolha.regime, ano: escolha.anoTransicao, cenario_vendas: "base", cenario_compras: "base" },
    sentido: "ambas",
  }
  const { dados, erro, carregando } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculo.id}/auditoria`, corpo, s),
    [calculo.id, JSON.stringify(corpo)],
  )
  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="vazio">Procurando onde a empresa está perdendo dinheiro…</div>

  return (
    <div className={carregando ? "carregando" : undefined} style={{ display: "grid", gap: "var(--espaco)" }}>
      <Total d={dados} />
      <section className="secao">
        <h2 className="secao-titulo">Onde o dinheiro está indo</h2>
        <p className="leitura">
          Cada ramo é uma causa diferente. Abra um ramo para ver o que ele é, por que acontece e o que fazer, e desça até o
          fornecedor, o item e o cliente que concentram a perda.
        </p>
        <div className="ramos">
          {dados.ramos.map((r, i) => (
            <RamoCartao key={r.id} ramo={r} indice={i + 1} total={dados.djf} calculoId={calculo.id} corpo={corpo} abertoInicial={i === 0} />
          ))}
        </div>
      </section>
      <Evolucao d={dados} />
      <Risco d={dados} />
      <Metodologia d={dados} />
    </div>
  )
}

function Total({ d }: { d: Dados }) {
  const anual = d.periodoMeses && d.periodoMeses > 0 ? (d.djf * 12) / d.periodoMeses : null
  return (
    <section className="bloco">
      <h2>DJF · Dinheiro Jogado Fora em {d.ano}</h2>
      <div className="djf-total">
        <span className="numero">{fmtBRL(d.djf)}</span>
        <span className="apoio">
          No período analisado{d.periodoMeses ? ` (${d.periodoMeses} meses)` : ""}, no {REGIMES[d.regime] ?? d.regime}, com as regras de{" "}
          {d.ano}.
          {anual !== null && d.periodoMeses !== 12 && ` Equivale a ${fmtBRL(anual)} por ano (período × 12 ÷ ${d.periodoMeses}).`}
        </span>
      </div>
      {d.djf > 0 && (
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <div className="composicao" aria-label="Composição do DJF">
            {d.ramos
              .filter((r) => r.valor > 0)
              .map((r) => (
                <div key={r.id} style={{ width: `${(r.valor / d.djf) * 100}%`, background: COR_NO_BLOCO[r.id] }} title={`${TEXTO[r.id].titulo}: ${fmtBRL(r.valor)}`} />
              ))}
          </div>
          <div className="legenda" style={{ color: "var(--bloco-apoio)" }}>
            {d.ramos.map((r, i) => (
              <span key={r.id}>
                <i style={{ background: COR_NO_BLOCO[r.id], borderColor: "transparent" }} />
                {i + 1}. {TEXTO[r.id].titulo}: {fmtBRL(r.valor)} ({d.djf ? fmtPct(r.valor / d.djf) : "n/d"})
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function RamoCartao({
  ramo,
  indice,
  total,
  calculoId,
  corpo,
  abertoInicial,
}: {
  ramo: Ramo
  indice: number
  total: number
  calculoId: string
  corpo: object
  abertoInicial: boolean
}) {
  const [aberto, setAberto] = useState(abertoInicial)
  const t = TEXTO[ramo.id]
  const maior = Math.max(0, ...ramo.detalhes.map((d) => d.valor))
  return (
    <div className="ramo">
      <button aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span className="numero-ramo" style={{ background: COR_RAMO[ramo.id].fundo, color: COR_RAMO[ramo.id].texto }}>
          {indice}
        </span>
        <span>
          <span className="titulo-ramo">{t.titulo}</span>
          <span className="resumo-ramo" style={{ display: "block" }}>
            {t.resumo}
          </span>
        </span>
        <span className="valor-ramo">
          <strong>{ramo.disponivel ? fmtBRL(ramo.valor) : "n/d"}</strong>
          <span>{ramo.disponivel && total ? `${fmtPct(ramo.valor / total)} do DJF` : "sem dado"}</span>
        </span>
      </button>
      {aberto && (
        <div className="ramo-corpo">
          <div className="explicacao">
            <div>
              <b>O que é</b>
              {t.oQue}
            </div>
            <div>
              <b>Por que acontece</b>
              {t.porQue}
            </div>
            <div>
              <b>O que fazer</b>
              {t.fazer}
            </div>
          </div>
          {ramo.motivo && <p className="nota">{ramo.motivo}</p>}
          {ramo.detalhes.length > 0 ? (
            <div className="galhos">
              {ramo.detalhes.map((g) => (
                <GalhoItem key={g.chave} galho={g} maior={maior} calculoId={calculoId} corpo={corpo} rotuloAbrir={t.abrir} />
              ))}
            </div>
          ) : (
            ramo.disponivel && !ramo.motivo && <p className="nota">Nenhum caso encontrado neste ramo.</p>
          )}
        </div>
      )}
    </div>
  )
}

function GalhoItem({
  galho,
  maior,
  calculoId,
  corpo,
  rotuloAbrir,
}: {
  galho: Galho
  maior: number
  calculoId: string
  corpo: object
  rotuloAbrir?: string
}) {
  const [aberto, setAberto] = useState(false)
  const filhos = useBusca(
    aberto && galho.abrir
      ? (s) => api<{ detalhes: Galho[] }>(`/api/calculos/${calculoId}/auditoria/detalhe`, { ...corpo, ...galho.abrir }, s)
      : null,
    [aberto],
  )
  const maiorFilho = Math.max(0, ...(filhos.dados?.detalhes ?? []).map((d) => d.valor))
  return (
    <div className="galho">
      <div className="galho-linha">
        <span>
          <span className="galho-nome">{galho.rotulo}</span>
          <span className="galho-sub" style={{ display: "block" }}>
            {[galho.sub && fmtCnpj(galho.sub), galho.nota].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="galho-valor">{fmtBRL(galho.valor)}</span>
      </div>
      <div className="galho-barra">
        <div style={{ width: `${maior ? (galho.valor / maior) * 100 : 0}%` }} />
      </div>
      {galho.abrir && rotuloAbrir && (
        <button onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          {aberto ? "Fechar" : rotuloAbrir}
        </button>
      )}
      {aberto && (
        <>
          {filhos.erro != null && <Erro erro={filhos.erro} />}
          {!filhos.dados && !filhos.erro && <span className="nota">Carregando…</span>}
          {filhos.dados && filhos.dados.detalhes.length === 0 && <span className="nota">Nenhum caso abaixo deste.</span>}
          {filhos.dados && filhos.dados.detalhes.length > 0 && (
            <div className="galhos">
              {filhos.dados.detalhes.map((f) => (
                <GalhoItem key={f.chave} galho={f} maior={maiorFilho} calculoId={calculoId} corpo={corpo} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Evolucao({ d }: { d: Dados }) {
  if (d.evolucao.length < 2) return null
  const somar = (p: Dados["evolucao"][number]) => p.repasse + p.preco + p.credito + p.destaque
  const [t, p] = d.evolucao
  const max = Math.max(1, ...d.evolucao.map(somar))
  const ramos: RamoId[] = ["repasse", "preco", "credito", "destaque"]
  return (
    <section className="secao">
      <h2 className="secao-titulo">O DJF na transição e no regime pleno</h2>
      <p className="leitura">
        O mesmo indicador com as regras de {t.ano} e de {p.ano}, no mesmo regime e no mesmo período analisado. Em {p.ano}, o DJF{" "}
        {somar(p) > somar(t) ? "cresce" : somar(p) < somar(t) ? "diminui" : "fica igual"}: vai de {fmtBRL(somar(t))} para {fmtBRL(somar(p))}.
      </p>
      <div className="cartao barras-h">
        {d.evolucao.map((e) => (
          <div key={e.ano} className="barra-h">
            <div className="nome">
              {e.ano}
              {e.ano === p.ano ? ", regime pleno" : ", transição"}
            </div>
            <div className="trilho">
              <div className="faixa">
                <div className="composicao" style={{ width: `${(somar(e) / max) * 75}%`, minWidth: 4, height: 16 }}>
                  {ramos
                    .filter((r) => e[r] > 0)
                    .map((r) => (
                      <div key={r} style={{ width: `${(e[r] / (somar(e) || 1)) * 100}%`, background: COR_RAMO[r].fundo }} title={`${TEXTO[r].titulo}: ${fmtBRL(e[r])}`} />
                    ))}
                </div>
                <span className="valor">{fmtBRL(somar(e))}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="legenda">
          {ramos.map((r, i) => (
            <span key={r}>
              <i style={{ background: COR_RAMO[r].fundo }} />
              {i + 1}. {TEXTO[r].titulo}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Risco({ d }: { d: Dados }) {
  const total = d.risco.compras + d.risco.vendas
  return (
    <section className="secao">
      <h2 className="secao-titulo">Risco fiscal: não é DJF, é passivo</h2>
      <p className="leitura">
        Quando o erro de classificação é a favor da empresa, ela não perde dinheiro agora, mas fica exposta a autuação ou glosa. Esse valor
        não entra no DJF.
      </p>
      <div className="grade grade-2">
        <div className="cartao kpi">
          <div className="rotulo">IBS e CBS destacado a menor nas vendas</div>
          <div className="valor">{fmtBRL(d.risco.vendas)}</div>
          <div className="contexto">Tributo que deveria ter sido destacado e recolhido</div>
        </div>
        <div className="cartao kpi">
          <div className="rotulo">Crédito tomado a maior nas compras</div>
          <div className="valor">{fmtBRL(d.risco.compras)}</div>
          <div className="contexto">Crédito sujeito a glosa pelo fisco</div>
        </div>
      </div>
      <p className="nota">
        Risco total estimado em {d.ano}: {fmtBRL(total)}.
        {d.risco.naoEstimadoItens > 0 &&
          ` ${d.risco.naoEstimadoItens.toLocaleString("pt-BR")} itens com classificação divergente ficaram fora da estimativa, porque o código tem regra própria (alíquota fixa, diferimento, monofásica e outros).`}
      </p>
    </section>
  )
}

function Metodologia({ d }: { d: Dados }) {
  return (
    <section className="cartao">
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Como o DJF é calculado</summary>
        <ul className="leitura" style={{ paddingLeft: 18 }}>
          <li>
            Ramos 1 e 2 comparam dois resultados da própria Pricetax, no mesmo regime e ano: o cenário Ajustado (preço recalculado para manter
            a margem) e o Sem Reajuste (nas compras, o fornecedor repassa sobre o valor cheio; nas vendas, a empresa absorve o impacto).
          </li>
          <li>
            Ramos 3 e 4 comparam o cClassTrib da nota com o calculado pela Pricetax, que é o correto. O tributo pela nota é estimado com a
            redução de cada código na tabela oficial (<a href={d.tabela.fonte}>Portal DF-e, SVRS</a>, obtida em{" "}
            {new Date(`${d.tabela.obtidoEm}T12:00:00`).toLocaleDateString("pt-BR")}), mantido o valor da nota.
          </li>
          <li>Os ramos medem causas diferentes e são somados. É uma estimativa para priorizar a ação, não um parecer.</li>
          <li>Valores do período analisado no cálculo. A conversão para 12 meses supõe o mesmo volume ao longo do ano.</li>
        </ul>
      </details>
    </section>
  )
}
