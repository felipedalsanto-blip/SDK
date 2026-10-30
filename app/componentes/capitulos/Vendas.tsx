"use client"
import { useState } from "react"
import type { Vendas as Dados } from "@/lib/capitulos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtInt, fmtPct, useBusca } from "../util"
import { CustoCliente } from "./CustoCliente"
import { Explorador } from "./Explorador"
import { AvisoEstimados } from "./Estimados"
import { ProvedorFicha } from "./Ficha"
import { Alternar, Bloco, COR_CENARIO, Capitulo, Diferenca, Pareto, Plano, Premissa, Seta, TabelaItens, TabelaParceiros } from "./ui"

type Sentido = "aumento" | "reducao"
const TOPS = { "10": "Top 10", "20": "Top 20", "30": "Top 30", "40": "Top 40", "50": "Top 50" }

const EXPLICA: Record<string, string> = {
  "Sem Ajuste":
    "A empresa mantém o mesmo preço de hoje. A diferença de tributos sai (ou entra) na margem, e o efeito aparece na DRE e no fluxo de caixa.",
  "Com Reajuste":
    "O cenário conservador: tira do preço os tributos atuais, inclui os novos e os que permanecem, sem considerar o que muda no custo das compras.",
  "Preço Alvo":
    "Além de trocar os tributos, usa os novos créditos das compras, que podem baixar o custo e reduzir a necessidade de aumento de preço.",
  "Custo Neutro":
    "Repassa ao preço só o que o custo das compras sobe ou cai, para o lucro bruto ficar igual ao de hoje, sem olhar despesas. Mostra o quanto a venda precisa ser mais (ou pode ser menos) eficiente por causa do custo.",
}

export function Vendas({ calculoId, regime, ano, semEstimados }: { calculoId: string; regime: string; ano: number; semEstimados: boolean }) {
  const [cenario, setCenario] = useState("base")
  const [quantidade, setQuantidade] = useState(10)
  const [sentido, setSentido] = useState<Sentido>("aumento")
  const [pareto, setPareto] = useState<"cliente" | "ncm" | "grupo">("cliente")
  const { dados, erro, carregando } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculoId}/capitulos/vendas`, { regime, cenario, quantidade, ano, semEstimados }, s),
    [calculoId, regime, cenario, quantidade, ano, semEstimados],
  )

  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Lendo as vendas de {ano} em todos os cenários…</div>
  const atual = dados.cenarios.find((c) => c.id === dados.cenario.id) ?? dados.cenarios[0]
  const sobe = sentido === "aumento"
  const p = dados.pareto

  return (
    <ProvedorFicha calculoId={calculoId} regime={regime} ano={ano} semEstimados={semEstimados} sentido="saida" cenario={dados.cenario.id}>
    <div className={carregando ? "carregando" : undefined}>
      <Capitulo numero="02" titulo={`Vendas · ${dados.ano}`} sub={`Os caminhos de preço para ${dados.ano} e o que cada um faz com o resultado.`}>
        <Bloco titulo="Os cenários de preço" leitura="Escolha um cenário para ver as listas e os padrões logo abaixo.">
          <div className="cap-cenarios">
            {dados.cenarios.map((c) => (
              <button key={c.id} className="cap-cenario" aria-pressed={c.id === dados.cenario.id} onClick={() => setCenario(c.id)}>
                <span className="cap-cenario-marca" style={{ background: COR_CENARIO[c.rotulo] }} />
                <span className="cap-cenario-nome">{c.rotulo}</span>
                <span className="cap-sub">{c.nome}</span>
                <span className="cap-cenario-valor">{fmtBRL(c.totais.valorDr)}</span>
                <span className="cap-sub">
                  vendas em {dados.ano}, contra {fmtBRL(c.totais.valorAr)} hoje <Seta antes={c.totais.valorAr} depois={c.totais.valorDr} />
                </span>
                <span className="cap-sub">
                  Tributos: {fmtBRL(c.totais.tributosAr)} → {fmtBRL(c.totais.tributosDr)}
                </span>
                <span className="cap-cenario-texto">{EXPLICA[c.rotulo]}</span>
              </button>
            ))}
          </div>
          {dados.cenarios.every((c) => c.rotulo !== "Preço Alvo") && (
            <p className="cap-nota">O cenário Preço Alvo não foi criado neste cálculo. Crie a margem no app da Pricetax para ele aparecer aqui.</p>
          )}
          {atual?.rotulo === "Custo Neutro" && (
            <div className="cap-atencao">
              <b>Como ler.</b> Cenário montado no painel: o Com Reajuste com o preço líquido mexido só pela variação do custo das compras de {dados.ano}. O
              lucro bruto fica igual ao de hoje; as despesas não entram na conta. A ficha de cada cliente ou item mostra a memória do Com Reajuste.
            </div>
          )}
          {atual?.rotulo === "Com Reajuste" && (
            <div className="cap-atencao">
              <b>Ponto de atenção.</b> Este cenário isola os efeitos das compras, positivos ou negativos: parte do princípio de que os custos
              permanecem os mesmos.
            </div>
          )}
        </Bloco>

        <AvisoEstimados resumo={dados.estimados.resumo} excluidos={dados.estimados.excluidos} lado="vendas" />

        {atual && (
          <Bloco
            titulo={`Clientes e vendas por regime tributário · ${atual.rotulo}`}
            leitura="O regime do cliente decide quanto do IBS e da CBS ele recupera. Para quem é do regime regular, o tributo volta como crédito; para o Simples Nacional, em regra, vira custo."
          >
            <div className="tabela-rolagem">
              <table className="cap-tabela">
                <thead>
                  <tr>
                    <th>Regime do cliente</th>
                    <th className="num">Clientes</th>
                    <th className="num">Vendas AR</th>
                    <th className="num">Vendas DR</th>
                    <th className="num">Diferença</th>
                    <th className="num">Custo do cliente DR*</th>
                    <th className="num">% das vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {atual.porRegime.map((r) => {
                    const custoCliente = r.regime === "simplesNacional" ? r.valorDr : r.valorDr - r.ibsCbs
                    return (
                      <tr key={String(r.regime)}>
                        <td>
                          <b>{r.nome}</b>
                        </td>
                        <td className="num">{fmtInt(r.clientes)}</td>
                        <td className="num">{fmtBRL(r.valorAr)}</td>
                        <td className="num">{fmtBRL(r.valorDr)}</td>
                        <td className="num">
                          <Diferenca valor={r.valorDr - r.valorAr} />
                        </td>
                        <td className="num">{fmtBRL(custoCliente)}</td>
                        <td className="num">{atual.totais.valorAr ? fmtPct(r.valorAr / atual.totais.valorAr) : "n/d"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="cap-nota">
              * Estimado: para cliente do regime regular, preço menos o IBS e a CBS que ele credita; para o Simples Nacional, o próprio preço.
            </p>
          </Bloco>
        )}

        {atual && (
          <Bloco
            titulo={`Custo do seu cliente · ${atual.rotulo}`}
            leitura="Quanto o cliente efetivamente paga, conforme o regime dele e os créditos que consegue aproveitar: não só o IBS e a CBS, mas também o ICMS da transição e o IPI e o PIS/COFINS de hoje, quando ele tem direito. Clique num perfil para ver o detalhamento e use a régua para dizer quanto da sua carteira é de cada perfil."
          >
            <CustoCliente base={dados.custoCliente} porRegime={atual.porRegime} ano={dados.ano} calculoId={calculoId} />
          </Bloco>
        )}

        <div className="cap-alternar-linha">
          <Alternar opcoes={{ aumento: "Quem paga mais", reducao: "Quem paga menos" }} valor={sentido} onChange={setSentido} />
          <Alternar opcoes={TOPS} valor={String(quantidade) as keyof typeof TOPS} onChange={(v) => setQuantidade(Number(v))} />
        </div>

        <Bloco
          titulo={`Top ${quantidade} clientes com ${sobe ? "aumento" : "redução"} no preço de venda`}
          leitura={sobe ? "Os clientes que mais vão sentir o novo preço. A conversa precisa chegar antes da nota." : "Clientes em que o preço cai: espaço para recuperar margem ou ganhar mercado."}
        >
          <TabelaParceiros lista={dados.clientes[sentido]} mostrarCusto={false} grupos={["impostos"]} vazio="Nenhum cliente nesta situação." />
        </Bloco>

        <Bloco titulo={`Top ${quantidade} itens com ${sobe ? "aumento" : "redução"} no preço de venda`} leitura="Cada item vem com o cliente que o compra.">
          <TabelaItens lista={dados.itens[sentido]} parceiro="Cliente" mostrarCusto={false} grupos={["impostos"]} vazio="Nenhum item nesta situação." />
        </Bloco>

        <Bloco
          titulo={`Top ${quantidade} clientes do Simples Nacional com ${sobe ? "aumento" : "redução"} no preço`}
          leitura="Para o cliente do Simples, o IBS e a CBS em regra não voltam como crédito: o preço que sobe é custo que sobe para ele. É o cliente mais sensível ao reajuste."
        >
          <TabelaParceiros lista={dados.simples[sentido]} mostrarCusto={false} grupos={["impostos"]} vazio="Nenhum cliente do Simples Nacional nesta situação." />
        </Bloco>

        <Bloco
          titulo="Desvios de padrão: o mesmo NCM com tributação diferente"
          leitura="Mesmo produto, carga diferente conforme o destino (CFOP 5 dentro do estado, 6 fora, 7 exterior) e o regime do cliente. Cada linha é uma pergunta a responder: a diferença é legítima ou é cadastro, benefício ou preço a corrigir?"
        >
          {dados.desvios.length === 0 ? (
            <p className="cap-vazio">Nenhum NCM com carga diferente entre destinos e regimes.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="cap-tabela">
                <thead>
                  <tr>
                    <th>NCM</th>
                    <th className="num">Vendas DR</th>
                    <th>Menor carga</th>
                    <th>Maior carga</th>
                    <th className="num">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.desvios.map((d) => (
                    <tr key={d.ncm}>
                      <td>
                        <b>{d.ncm}</b>
                      </td>
                      <td className="num">{fmtBRL(d.valor)}</td>
                      <td>
                        {fmtPct(d.min.carga)}
                        <span className="cap-sub">
                          CFOP {d.min.cfop ?? "n/d"} · {d.min.regime}
                        </span>
                      </td>
                      <td>
                        {fmtPct(d.max.carga)}
                        <span className="cap-sub">
                          CFOP {d.max.cfop ?? "n/d"} · {d.max.regime}
                        </span>
                      </td>
                      <td className="num">
                        <b>{(d.amplitude * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="cap-nota">Ordenado por diferença de carga vezes o valor vendido. A API traz a UF de origem; o destino é lido pelo CFOP.</p>
        </Bloco>

        <Bloco titulo="Pareto 80/20: onde o preço mais muda" leitura="Poucos clientes, NCMs ou grupos concentram a maior parte da variação de preço.">
          <Alternar opcoes={{ cliente: "Por cliente", ncm: "Por NCM", grupo: "Por grupo (capítulo NCM)" }} valor={pareto} onChange={setPareto} />
          <div className="grade-2" style={{ marginTop: 12 }}>
            <div>
              <h4 className="cap-subtitulo">Aumento de preço</h4>
              <Pareto dados={pareto === "cliente" ? p.precoSobeCliente : pareto === "ncm" ? p.precoSobeNcm : p.precoSobeGrupo} medida="o aumento de preço" parceiros={pareto === "cliente"} />
            </div>
            <div>
              <h4 className="cap-subtitulo">Redução de preço</h4>
              {pareto === "grupo" ? (
                <p className="cap-vazio">Use “Por cliente” ou “Por NCM” para ver as reduções.</p>
              ) : (
                <Pareto dados={pareto === "cliente" ? p.precoCaiCliente : p.precoCaiNcm} medida="a redução de preço" parceiros={pareto === "cliente"} />
              )}
            </div>
          </div>
        </Bloco>

        <Bloco
          titulo="Monte a sua visão"
          leitura={`Nasce por item e cliente, no cenário ${dados.cenario.rotulo}. Troque os agrupadores (NCM, CFOP, regime do cliente…), abra impostos e débitos por tributo e baixe em CSV.`}
        >
          <Explorador calculoId={calculoId} regime={regime} ano={ano} sentido="saida" cenario={dados.cenario.id} />
        </Bloco>

        <Bloco titulo="Plano comercial" leitura="Do ponto de vista da empresa que vende. Comece pelos clientes do Pareto.">
          <div className="grade-2">
            <Plano
              titulo="Com quem vai pagar mais"
              passos={[
                {
                  acao: "Separe os clientes pelo regime",
                  porque: "Para o cliente do regime regular, o IBS e a CBS voltam como crédito: o custo dele pode até cair. Mostre o custo efetivo, não o total da nota.",
                },
                {
                  acao: "Trate o Simples Nacional à parte",
                  porque: "Para ele o tributo vira custo. Avalie reajuste escalonado, mix de produtos ou condição comercial específica para não perder o cliente.",
                },
                {
                  acao: "Avise antes da primeira nota",
                  porque: "Comunique o novo preço com a explicação da reforma e a data de cada degrau. Reajuste explicado é aceito; reajuste surpresa vira cotação na concorrência.",
                },
                {
                  acao: "Reajuste por degrau, não de uma vez",
                  porque: "Acompanhe a transição de 2027, 2029 a 2032 e 2033 com revisões programadas na tabela.",
                },
              ]}
            />
            <Plano
              titulo="Com quem vai pagar menos"
              passos={[
                {
                  acao: "Decida o que fazer com a redução",
                  porque: "Repassar tudo, parte ou nada é uma escolha comercial. Onde a concorrência permite, segurar parte da redução recompõe a margem perdida em outros itens.",
                },
                {
                  acao: "Use a redução como argumento",
                  porque: "Em contas estratégicas, o preço menor ajuda a ampliar volume, alongar contrato ou entrar em novas linhas de produto.",
                },
                {
                  acao: "Revise os desvios de padrão",
                  porque: "Se o mesmo NCM tem carga diferente sem motivo, corrija o cadastro antes de mexer no preço.",
                },
              ]}
            />
          </div>
        </Bloco>

        <Premissa>
          Fonte: cálculo da Pricetax, ano {dados.ano}, cenário de venda {dados.cenario.nome}, compras no Ajustado.
          {dados.parcial && " As listas consideram os 2.000 maiores grupos por valor de venda."}
        </Premissa>
      </Capitulo>
    </div>
    </ProvedorFicha>
  )
}
