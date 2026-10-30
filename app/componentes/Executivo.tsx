"use client"
import type { Bloco, Executivo as Dados, PontoAno } from "@/lib/executivo"
import { Erro } from "./comum"
import type { Detalhe, Escolha } from "./Painel"
import { api, fmtBRL, fmtBRLCurto, fmtPct, fmtVariacao, useBusca, variacao } from "./util"

/** Cores fixas dos cenários: Hoje em cinza, transição em amarelo, regime pleno em preto. */
const COR = { hoje: "var(--cor-hoje)", transicao: "var(--cor-transicao)", pleno: "var(--cor-pleno)" }

const razao = (a: number, b: number) => (b ? a / b : null)
const cargaVendas = (b: Bloco) => razao(b.vendas.tributos, b.vendas.valor)
const custoSobreCompra = (b: Bloco) => razao(b.compras.custo, b.compras.valor)

/** "de X para Y (+z%)". */
function deParaReais(antes: number, depois: number) {
  const v = fmtVariacao(antes, depois)
  return `de ${fmtBRL(antes)} para ${fmtBRL(depois)}${v ? ` (${v})` : ""}`
}
function deParaPct(antes: number | null, depois: number | null) {
  if (antes === null || depois === null) return "sem base para comparar"
  const pp = (depois - antes) * 100
  return `de ${fmtPct(antes)} para ${fmtPct(depois)} (${pp > 0 ? "+" : ""}${pp.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.)`
}
const sobeCai = (antes: number, depois: number, sobe = "sobe", cai = "cai", igual = "fica igual") =>
  depois > antes ? sobe : depois < antes ? cai : igual

export function Executivo({
  calculo,
  escolha,
  onAnoTransicao,
}: {
  calculo: Detalhe
  escolha: Escolha
  onAnoTransicao: (ano: number) => void
}) {
  const corpo = {
    recorte: {
      regime: escolha.regime,
      ano: escolha.anoTransicao,
      cenario_vendas: escolha.cenarioVendas,
      cenario_compras: escolha.cenarioCompras,
    },
    sentido: "ambas",
  }
  const { dados, erro, carregando } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculo.id}/executivo`, corpo, s),
    [calculo.id, JSON.stringify(corpo)],
  )

  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="vazio">Lendo os números do cálculo…</div>

  const semMovimento = dados.hoje.vendas.itens === 0 && dados.hoje.compras.itens === 0
  if (semMovimento) {
    return <div className="alerta">Este regime não tem notas no cálculo escolhido. Troque o regime ou o cálculo.</div>
  }

  return (
    <div className={carregando ? "carregando" : undefined} style={{ display: "grid", gap: "var(--espaco)" }}>
      <Legenda d={dados} />
      <Leitura d={dados} />
      <Indicadores d={dados} />
      <Curva d={dados} onAno={onAnoTransicao} />
      <Compras d={dados} />
      <Vendas d={dados} />
      <Regimes d={dados} />
      {dados.sensibilidade && <Sensibilidade d={dados} />}
      <Plano d={dados} />
    </div>
  )
}

function Legenda({ d }: { d: Dados }) {
  return (
    <div className="legenda" aria-label="Cores dos cenários">
      <span>
        <i style={{ background: COR.hoje }} /> Hoje (regras atuais)
      </span>
      <span>
        <i style={{ background: COR.transicao }} /> {d.transicao.ano}, transição
      </span>
      <span>
        <i style={{ background: COR.pleno }} /> {d.pleno.ano}, regime pleno
      </span>
      <span>
        Regime {d.regime.nome}
        {d.regime.atual ? " (atual da empresa)" : " (simulado)"} · Vendas {d.cenarios.vendas} · Compras {d.cenarios.compras}
      </span>
    </div>
  )
}

/** O caso em uma leitura: o diagnóstico em texto, cada afirmação com o número que a sustenta. */
function Leitura({ d }: { d: Dados }) {
  const { hoje, transicao: t, pleno: p } = d
  const dT = t.saldo - hoje.saldo
  const dP = p.saldo - hoje.saldo
  const inverte = dT !== 0 && dP !== 0 && Math.sign(dT) !== Math.sign(dP)
  return (
    <section className="bloco">
      <h2>O caso em uma leitura</h2>
      <p>
        <strong>O diagnóstico.</strong> No {d.regime.nome}, a empresa recolhe hoje{" "}
        <span className="chave">{fmtBRL(hoje.saldo)}</span> em tributos sobre o consumo no período analisado (tributos das vendas
        menos o crédito das compras). Em {t.ano}, esse saldo {sobeCai(hoje.saldo, t.saldo)} para{" "}
        <span className="chave">{fmtBRL(t.saldo)}</span>
        {fmtVariacao(hoje.saldo, t.saldo) ? ` (${fmtVariacao(hoje.saldo, t.saldo)})` : ""}. No regime pleno, em {p.ano},{" "}
        {sobeCai(hoje.saldo, p.saldo, "sobe", "cai", "fica")} para <span className="chave">{fmtBRL(p.saldo)}</span>
        {fmtVariacao(hoje.saldo, p.saldo) ? ` (${fmtVariacao(hoje.saldo, p.saldo)})` : ""}.
      </p>
      <p>
        <strong>Por que se move assim.</strong> O crédito das compras vai de {fmtBRL(hoje.compras.credito)} hoje para{" "}
        {fmtBRL(t.compras.credito)} em {t.ano} e {fmtBRL(p.compras.credito)} em {p.ano}. Os tributos sobre as vendas vão de{" "}
        {fmtBRL(hoje.vendas.debito)} para {fmtBRL(t.vendas.debito)} e {fmtBRL(p.vendas.debito)}. O custo efetivo das compras{" "}
        {sobeCai(hoje.compras.custo, t.compras.custo)} em {t.ano} e {sobeCai(hoje.compras.custo, p.compras.custo)} em {p.ano}.
      </p>
      {inverte && (
        <p>
          <strong>Atenção: o efeito muda de direção.</strong> Em {t.ano} o saldo {dT < 0 ? "cai" : "sobe"}, mas em {p.ano}{" "}
          {dP < 0 ? "cai" : "sobe"} frente a hoje. O resultado da transição tem prazo de validade e precisa virar estrutura
          permanente.
        </p>
      )}
      <p className="apoio">
        Os valores são do período analisado no cálculo. Os percentuais são calculados a partir desses valores. Esta visão não traz
        DRE nem fluxo de caixa, porque a API de cálculos não informa despesas, IR e CSLL.
      </p>
    </section>
  )
}

function CartaoDuplo({
  rotulo,
  hoje,
  transicao,
  pleno,
  anos,
  contextoT,
  contextoP,
}: {
  rotulo: string
  hoje: string
  transicao: string
  pleno: string
  anos: [number, number]
  contextoT: string
  contextoP: string
}) {
  return (
    <div className="cartao kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="linha-cenario">
        <span className="marca-cenario" style={{ background: COR.hoje }} />
        <div>
          <div className="ano">Hoje</div>
          <div className="valor-menor">{hoje}</div>
        </div>
      </div>
      <div className="linha-cenario">
        <span className="marca-cenario" style={{ background: COR.transicao }} />
        <div>
          <div className="ano">{anos[0]}, transição</div>
          <div className="valor">{transicao}</div>
          <div className="contexto">{contextoT}</div>
        </div>
      </div>
      <div className="linha-cenario">
        <span className="marca-cenario" style={{ background: COR.pleno }} />
        <div>
          <div className="ano">{anos[1]}, regime pleno</div>
          <div className="valor">{pleno}</div>
          <div className="contexto">{contextoP}</div>
        </div>
      </div>
    </div>
  )
}

function Indicadores({ d }: { d: Dados }) {
  const { hoje, transicao: t, pleno: p } = d
  const anos: [number, number] = [t.ano, p.ano]
  return (
    <section className="secao">
      <h2 className="secao-titulo">Os quatro números da reforma</h2>
      <p className="leitura">
        Cada cartão mostra o número de hoje e como ele fica no ano de transição e no regime pleno, com a variação contra hoje.
      </p>
      <div className="grade grade-4">
        <CartaoDuplo
          rotulo="Tributos a recolher"
          hoje={fmtBRL(hoje.saldo)}
          transicao={fmtBRL(t.saldo)}
          pleno={fmtBRL(p.saldo)}
          anos={anos}
          contextoT={deParaReais(hoje.saldo, t.saldo)}
          contextoP={deParaReais(hoje.saldo, p.saldo)}
        />
        <CartaoDuplo
          rotulo="Carga sobre as vendas"
          hoje={fmtPct(cargaVendas(hoje))}
          transicao={fmtPct(cargaVendas(t))}
          pleno={fmtPct(cargaVendas(p))}
          anos={anos}
          contextoT={deParaPct(cargaVendas(hoje), cargaVendas(t))}
          contextoP={deParaPct(cargaVendas(hoje), cargaVendas(p))}
        />
        <CartaoDuplo
          rotulo="Custo efetivo das compras"
          hoje={fmtBRL(hoje.compras.custo)}
          transicao={fmtBRL(t.compras.custo)}
          pleno={fmtBRL(p.compras.custo)}
          anos={anos}
          contextoT={deParaReais(hoje.compras.custo, t.compras.custo)}
          contextoP={deParaReais(hoje.compras.custo, p.compras.custo)}
        />
        <CartaoDuplo
          rotulo="Crédito recuperável nas compras"
          hoje={fmtBRL(hoje.compras.credito)}
          transicao={fmtBRL(t.compras.credito)}
          pleno={fmtBRL(p.compras.credito)}
          anos={anos}
          contextoT={deParaReais(hoje.compras.credito, t.compras.credito)}
          contextoP={deParaReais(hoje.compras.credito, p.compras.credito)}
        />
      </div>
      <p className="nota">
        Tributos a recolher = tributos sobre as vendas menos crédito das compras. Carga sobre as vendas = tributos sobre as vendas
        ÷ valor das vendas. Base: período analisado no cálculo.
      </p>
    </section>
  )
}

/** Colunas a partir do zero (com área negativa quando houver), uma por cenário. */
function Colunas({
  itens,
}: {
  itens: { rotulo: string; valor: number; cor: string; marcador?: string; destaque?: boolean; onClick?: () => void }[]
}) {
  const maxPos = Math.max(0, ...itens.map((i) => i.valor))
  const maxNeg = Math.max(0, ...itens.map((i) => -i.valor))
  const total = maxPos + maxNeg || 1
  return (
    <div>
      <div className="colunas" style={{ alignItems: "stretch" }} role="img" aria-label="Gráfico de colunas">
        {itens.map((i) => (
          <div
            key={i.rotulo}
            className="coluna"
            style={{ justifyContent: "flex-start", cursor: i.onClick ? "pointer" : undefined }}
            onClick={i.onClick}
            title={`${i.rotulo}: ${fmtBRL(i.valor)}`}
          >
            <div style={{ height: `${(maxPos / total) * 100}%`, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
              {i.valor >= 0 && (
                <>
                  {i.marcador && <span className="marcador">{i.marcador}</span>}
                  <span className="rotulo-valor">{fmtBRLCurto(i.valor)}</span>
                  <div className="barra" style={{ height: `${maxPos ? (i.valor / maxPos) * 100 : 0}%`, background: i.cor, maxHeight: "calc(100% - 22px)" }} />
                </>
              )}
            </div>
            <div style={{ height: `${(maxNeg / total) * 100}%`, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", borderTop: maxNeg ? "1px solid var(--texto-apoio)" : undefined }}>
              {i.valor < 0 && (
                <>
                  <div className="barra" style={{ height: `${(-i.valor / maxNeg) * 100}%`, background: i.cor, borderRadius: "0 0 4px 4px", maxHeight: "calc(100% - 22px)" }} />
                  <span className="rotulo-valor">{fmtBRLCurto(i.valor)}</span>
                  {i.marcador && <span className="marcador">{i.marcador}</span>}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="eixo-anos">
        {itens.map((i) => (
          <span key={i.rotulo} style={i.destaque ? { color: "var(--texto)", fontWeight: 800 } : undefined}>
            {i.rotulo}
          </span>
        ))}
      </div>
    </div>
  )
}

function Curva({ d, onAno }: { d: Dados; onAno: (ano: number) => void }) {
  const serie = d.serie
  const pico = serie.reduce((a, b) => (b.saldo > a.saldo ? b : a), serie[0])
  const piso = serie.reduce((a, b) => (b.saldo < a.saldo ? b : a), serie[0])
  const cor = (p: PontoAno) => (p.ano === d.pleno.ano ? COR.pleno : COR.transicao)
  return (
    <section className="secao">
      <h2 className="secao-titulo">A curva dos tributos a recolher</h2>
      <p className="leitura">
        Cada coluna é o saldo de tributos sobre o consumo no período analisado, recalculado com as regras de cada ano. A primeira, em
        cinza, é a regra de hoje. Clique num ano para usá-lo como ano de transição no restante da página.
      </p>
      <div className="cartao">
        <Colunas
          itens={[
            { rotulo: "Hoje", valor: d.hoje.saldo, cor: COR.hoje },
            ...serie.map((p) => ({
              rotulo: String(p.ano),
              valor: p.saldo,
              cor: cor(p),
              destaque: p.ano === d.transicao.ano,
              marcador: serie.length > 1 && pico !== piso ? (p === pico ? "pico" : p === piso ? "piso" : undefined) : undefined,
              onClick: p.ano !== d.pleno.ano ? () => onAno(p.ano) : undefined,
            })),
          ]}
        />
      </div>
      <div className="grade grade-2">
        <div className="cartao kpi">
          <div className="rotulo">Distância entre o pico e o piso</div>
          <div className="valor">{fmtBRL(pico.saldo - piso.saldo)}</div>
          <div className="contexto">
            Pico em {pico.ano} ({fmtBRL(pico.saldo)}), piso em {piso.ano} ({fmtBRL(piso.saldo)})
          </div>
        </div>
        <div className="cartao kpi">
          <div className="rotulo">Regime pleno frente a hoje</div>
          <div className="valor">{fmtBRL(d.pleno.saldo - d.hoje.saldo)}</div>
          <div className="contexto">{deParaReais(d.hoje.saldo, d.pleno.saldo)}</div>
        </div>
      </div>
    </section>
  )
}

function TabelaCenarios({
  d,
  linhas,
}: {
  d: Dados
  linhas: { rotulo: string; valor: (b: Bloco) => string }[]
}) {
  return (
    <div className="tabela">
      <table>
        <thead>
          <tr>
            <th />
            <th className="num hoje">Hoje</th>
            <th className="num transicao">{d.transicao.ano}</th>
            <th className="num pleno">{d.pleno.ano}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo}>
              <th scope="row">{l.rotulo}</th>
              <td className="num">{l.valor(d.hoje)}</td>
              <td className="num">{l.valor(d.transicao)}</td>
              <td className="num">{l.valor(d.pleno)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Compras({ d }: { d: Dados }) {
  const { hoje, transicao: t, pleno: p } = d
  const frase = (b: PontoAno) =>
    b.compras.custo < hoje.compras.custo
      ? `melhora em ${b.ano}: o custo cai ${fmtBRL(hoje.compras.custo - b.compras.custo)}`
      : b.compras.custo > hoje.compras.custo
        ? `piora em ${b.ano}: o custo sobe ${fmtBRL(b.compras.custo - hoje.compras.custo)}`
        : `fica igual em ${b.ano}`
  return (
    <section className="secao">
      <h2 className="secao-titulo">Compras e insumos</h2>
      <p className="leitura">
        Com a reforma, o crédito dos tributos pagos nas compras fica mais amplo. O que importa é o custo efetivo: o valor pago menos o
        crédito recuperado. Nas compras, o custo {frase(t)}, e {frase(p)}.
      </p>
      <div className="cartao">
        <TabelaCenarios
          d={d}
          linhas={[
            { rotulo: "Valor das compras", valor: (b) => fmtBRL(b.compras.valor) },
            { rotulo: "Tributos nas compras", valor: (b) => fmtBRL(b.compras.tributos) },
            { rotulo: "Crédito recuperável", valor: (b) => fmtBRL(b.compras.credito) },
            { rotulo: "Custo efetivo", valor: (b) => fmtBRL(b.compras.custo) },
            { rotulo: "Custo efetivo sobre a compra", valor: (b) => fmtPct(custoSobreCompra(b)) },
          ]}
        />
      </div>
      <p className="nota">Cenário de compras: {d.cenarios.compras}. Custo efetivo sobre a compra = custo efetivo ÷ valor das compras.</p>
    </section>
  )
}

function Vendas({ d }: { d: Dados }) {
  const ajustado = d.cenarios.vendas === "Ajustado"
  return (
    <section className="secao">
      <h2 className="secao-titulo">Vendas e preço</h2>
      <p className="leitura">
        {ajustado
          ? "No cenário Ajustado, o preço de venda é recalculado para manter a margem de hoje: o valor das vendas mostra o preço necessário para não perder nem ganhar."
          : `No cenário ${d.cenarios.vendas}, o preço segue a premissa escolhida no cálculo, e a diferença de carga recai sobre a margem.`}{" "}
        A carga sobre as vendas vai de {fmtPct(cargaVendas(d.hoje))} hoje para {fmtPct(cargaVendas(d.transicao))} em {d.transicao.ano}{" "}
        e {fmtPct(cargaVendas(d.pleno))} em {d.pleno.ano}.
      </p>
      <div className="cartao">
        <TabelaCenarios
          d={d}
          linhas={[
            { rotulo: "Valor das vendas", valor: (b) => fmtBRL(b.vendas.valor) },
            { rotulo: "Tributos sobre as vendas", valor: (b) => fmtBRL(b.vendas.tributos) },
            { rotulo: "Carga sobre as vendas", valor: (b) => fmtPct(cargaVendas(b)) },
            { rotulo: "Tributos a recolher (saldo)", valor: (b) => fmtBRL(b.saldo) },
          ]}
        />
      </div>
      <p className="nota">Cenário de vendas: {d.cenarios.vendas}. Tributos a recolher = tributos sobre as vendas menos crédito das compras.</p>
    </section>
  )
}

function Regimes({ d }: { d: Dados }) {
  if (d.regimes.length < 2) return null
  const max = Math.max(1, ...d.regimes.flatMap((r) => [r.hoje, r.transicao, r.pleno].map(Math.abs)))
  const vedados = d.regimes.filter((r) => r.vedado)
  return (
    <section className="secao">
      <h2 className="secao-titulo">Comparação de regimes</h2>
      <p className="leitura">
        O mesmo saldo de tributos sobre o consumo em cada regime simulado no cálculo, na mesma escala. A comparação não inclui IR e
        CSLL, que também mudam com o regime: use-a como um dos critérios, não como a decisão.
      </p>
      <div className="cartao barras-h">
        {d.regimes.map((r) => (
          <div key={r.regime} className="barra-h">
            <div className="nome" title={r.nome}>
              {r.nome}
              {r.regime === d.regime.id ? " (em análise)" : ""}
              {r.vedado && (
                <>
                  <br />
                  <span className="etiqueta-neutra">vedado</span>
                </>
              )}
            </div>
            <div className="trilho">
              {(
                [
                  ["Hoje", r.hoje, COR.hoje],
                  [String(d.transicao.ano), r.transicao, COR.transicao],
                  [String(d.pleno.ano), r.pleno, COR.pleno],
                ] as const
              ).map(([rotulo, v, cor]) => (
                <div key={rotulo} className="faixa">
                  <div className="preenchimento" style={{ width: `${(Math.max(0, v) / max) * 75}%`, background: cor }} />
                  <span className="valor">
                    {rotulo}: {fmtBRL(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {vedados.length > 0 && (
        <div className="alerta">
          <strong>Regime que não é opção</strong>
          {vedados.map((r) => (
            <span key={r.regime} style={{ display: "block" }}>
              {r.nome}: {r.vedado}. Ele aparece aqui só como referência.
            </span>
          ))}
          <span className="nota" style={{ display: "block", marginTop: 6 }}>
            Receita bruta anual estimada: {fmtBRL(d.receitaAnual)} (vendas do período com os tributos de hoje × 12 ÷{" "}
            {d.calculo.periodoMeses} meses).
          </span>
        </div>
      )}
    </section>
  )
}

function Sensibilidade({ d }: { d: Dados }) {
  const s = d.sensibilidade!
  const linha = (rotulo: string, base: number, pior: number) => {
    const v = variacao(base, pior)
    return { rotulo, base: fmtBRL(base), pior: fmtBRL(pior), dif: `${fmtBRL(pior - base)}${v !== null ? ` (${fmtVariacao(base, pior)})` : ""}` }
  }
  const blocos = [
    { ano: d.transicao.ano, cor: "transicao", linhas: [linha("Custo efetivo das compras", d.transicao.compras.custo, s.transicao.custo), linha("Tributos a recolher", d.transicao.saldo, s.transicao.saldo)] },
    { ano: d.pleno.ano, cor: "pleno", linhas: [linha("Custo efetivo das compras", d.pleno.compras.custo, s.pleno.custo), linha("Tributos a recolher", d.pleno.saldo, s.pleno.saldo)] },
  ]
  return (
    <section className="secao">
      <div>
        <span className="etiqueta">Recorte de compras: {s.nome} (pior cenário)</span>
      </div>
      <h2 className="secao-titulo">E se o fornecedor não ajustar o preço?</h2>
      <p className="leitura">
        Aqui muda só o cenário de compras, de {d.cenarios.compras} para {s.nome}. Pela definição da Pricetax, nas compras o {s.nome} é o
        pior cenário: o fornecedor repassa os novos impostos sobre o valor cheio. A diferença é o tamanho da aposta que a empresa faz
        ao contar com o repasse do fornecedor.
      </p>
      <div className="cartao tabela">
        <table>
          <thead>
            <tr>
              <th />
              <th className="num">{d.cenarios.compras}</th>
              <th className="num">{s.nome}</th>
              <th className="num">Diferença</th>
            </tr>
          </thead>
          {blocos.map((b) => (
            <tbody key={b.ano}>
              <tr>
                <th colSpan={4} className={b.cor} style={{ fontSize: 11 }}>
                  {b.ano}
                  {b.cor === "pleno" ? ", regime pleno" : ", transição"}
                </th>
              </tr>
              {b.linhas.map((l) => (
                <tr key={l.rotulo}>
                  <th scope="row">{l.rotulo}</th>
                  <td className="num">{l.base}</td>
                  <td className="num">{l.pior}</td>
                  <td className="num">{l.dif}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="nota">Diferença = {s.nome} menos {d.cenarios.compras}, no mesmo ano e no mesmo regime.</p>
    </section>
  )
}

function Plano({ d }: { d: Dados }) {
  const s = d.sensibilidade
  const outros = d.regimes.filter((r) => r.regime !== d.regime.id && !r.vedado && r.pleno < d.pleno.saldo)
  return (
    <section className="secao">
      <h2 className="secao-titulo">Plano de ação</h2>
      <p className="leitura">As frentes abaixo saem dos números desta página. A aba Auditoria de IBS e CBS mostra, caso a caso, onde o dinheiro está sendo perdido.</p>
      <div className="cartao">
        <ol className="passos">
          {s && (
            <li>
              <div>
                <b>Fechar agora o repasse com os fornecedores</b>
                Se os fornecedores repassarem sobre o valor cheio, o custo das compras sobe {fmtBRL(s.transicao.custo - d.transicao.compras.custo)}{" "}
                em {d.transicao.ano} e {fmtBRL(s.pleno.custo - d.pleno.compras.custo)} em {d.pleno.ano}. O acordo fechado agora vale para toda a
                transição.
              </div>
            </li>
          )}
          <li>
            <div>
              <b>Revisar a política de preços</b>
              A carga sobre as vendas passa de {fmtPct(cargaVendas(d.hoje))} para {fmtPct(cargaVendas(d.transicao))} em {d.transicao.ano} e{" "}
              {fmtPct(cargaVendas(d.pleno))} em {d.pleno.ano}. O preço precisa acompanhar essa mudança para manter a margem.
            </div>
          </li>
          <li>
            <div>
              <b>Mapear o regime tributário da carteira de clientes</b>
              O crédito que o cliente aproveita na compra depende do regime dele. Saber quem é do Simples, do Presumido e do Real mostra
              onde o preço fica mais ou menos competitivo.
            </div>
          </li>
          <li>
            <div>
              <b>Auditar o IBS e a CBS das notas</b>
              Corrigir o cadastro fiscal (cClassTrib) de produtos e fornecedores evita pagar tributo a mais e deixar crédito na mesa. Os
              valores estão no indicador DJF, na aba Auditoria de IBS e CBS.
            </div>
          </li>
          <li>
            <div>
              <b>Converter o ganho temporário em estrutura permanente</b>
              {outros.length > 0
                ? `Em ${d.pleno.ano}, o saldo no ${d.regime.nome} é ${fmtBRL(d.pleno.saldo)}; no ${outros[0].nome}, seria ${fmtBRL(outros[0].pleno)}. Avalie o regime junto com IR e CSLL antes da virada.`
                : `O saldo vai de ${fmtBRL(d.transicao.saldo)} em ${d.transicao.ano} para ${fmtBRL(d.pleno.saldo)} em ${d.pleno.ano}. As decisões de preço e de compras precisam valer para o regime pleno, não só para a transição.`}
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}
