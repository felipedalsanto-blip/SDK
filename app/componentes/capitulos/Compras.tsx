"use client"
import { useState } from "react"
import type { Compras as Dados } from "@/lib/capitulos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtInt, fmtPct, useBusca } from "../util"
import { Explorador } from "./Explorador"
import { ProvedorFicha } from "./Ficha"
import { Alternar, Bloco, Capitulo, Diferenca, Indicador, Pareto, Plano, Premissa, Seta, TabelaItens, TabelaParceiros } from "./ui"

type Sentido = "aumento" | "reducao"
const SENTIDOS: Record<Sentido, string> = { aumento: "Quem aumenta", reducao: "Quem reduz" }

export function Compras({ calculoId, regime }: { calculoId: string; regime: string }) {
  const { dados, erro, carregando } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculoId}/capitulos/compras`, { regime }, s),
    [calculoId, regime],
  )
  const [sentido, setSentido] = useState<Sentido>("aumento")
  const [pareto, setPareto] = useState<"fornecedor" | "ncm" | "grupo">("fornecedor")

  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Lendo as compras de 2027…</div>
  const t = dados.totais
  const sobe = sentido === "aumento"
  const p = dados.pareto

  return (
    <ProvedorFicha calculoId={calculoId} regime={regime} sentido="entrada">
    <div className={carregando ? "carregando" : undefined}>
      <Capitulo
        numero="01"
        titulo={`Compras · ${dados.ano}`}
        sub={`O ano das ações. Cenário de compras ${dados.cenario}: o fornecedor tira os tributos atuais do preço e soma o IBS e a CBS.`}
      >
        <div className="cap-kpis">
          <Indicador rotulo="Fornecedores" valor={fmtInt(t.fornecedores)} contexto={`${fmtInt(t.itens)} itens de compra`} />
          <Indicador
            rotulo="Valor das compras"
            valor={fmtBRL(t.valorDr)}
            contexto={
              <>
                hoje {fmtBRL(t.valorAr)} <Seta antes={t.valorAr} depois={t.valorDr} />
              </>
            }
          />
          <Indicador
            rotulo="Custo efetivo"
            valor={fmtBRL(t.custoDr)}
            contexto={
              <>
                hoje {fmtBRL(t.custoAr)} <Seta antes={t.custoAr} depois={t.custoDr} />
              </>
            }
          />
          <Indicador
            rotulo="Crédito recuperável"
            valor={fmtBRL(t.creditoDr)}
            contexto={
              <>
                hoje {fmtBRL(t.creditoAr)} <Seta antes={t.creditoAr} depois={t.creditoDr} />
              </>
            }
          />
        </div>

        <Bloco
          titulo="Compras por regime tributário do fornecedor"
          leitura="O regime do fornecedor define quanto crédito volta para a empresa. Fornecedor do Simples Nacional, em regra, gera menos crédito de IBS e CBS do que um do regime regular."
        >
          <div className="tabela-rolagem">
            <table className="cap-tabela">
              <thead>
                <tr>
                  <th>Regime</th>
                  <th className="num">Fornecedores</th>
                  <th className="num">Compras AR</th>
                  <th className="num">Compras DR</th>
                  <th className="num">Custo AR</th>
                  <th className="num">Custo DR</th>
                  <th className="num">Dif. custo</th>
                  <th className="num">% das compras</th>
                </tr>
              </thead>
              <tbody>
                {dados.porRegime.map((r) => (
                  <tr key={String(r.regime)}>
                    <td>
                      <b>{r.nome}</b>
                    </td>
                    <td className="num">{fmtInt(r.parceiros)}</td>
                    <td className="num">{fmtBRL(r.valorAr)}</td>
                    <td className="num">{fmtBRL(r.valorDr)}</td>
                    <td className="num">{fmtBRL(r.custoAr)}</td>
                    <td className="num">{fmtBRL(r.custoDr)}</td>
                    <td className="num">
                      <Diferenca valor={r.custoDr - r.custoAr} />
                    </td>
                    <td className="num">{t.valorAr ? fmtPct(r.valorAr / t.valorAr) : "n/d"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>

        <div className="cap-alternar-linha">
          <Alternar opcoes={SENTIDOS} valor={sentido} onChange={setSentido} />
          <span className="cap-sub">Preço = valor da nota (AR × DR). Custo = valor menos o crédito recuperado.</span>
        </div>

        <Bloco
          titulo={`Top 10 fornecedores que ${sobe ? "aumentam" : "reduzem"} o preço de compra`}
          leitura={sobe ? "Onde a negociação rende mais: o aumento de preço destes fornecedores entra direto no custo." : "Onde capturar ganho: confirme por escrito que a redução vai chegar ao preço."}
        >
          <TabelaParceiros lista={dados.fornecedores[sentido]} vazio={`Nenhum fornecedor ${sobe ? "aumenta" : "reduz"} o preço em ${dados.ano}.`} />
        </Bloco>

        <Bloco titulo={`Top 10 itens que ${sobe ? "aumentam" : "reduzem"} o preço de compra`} leitura="Cada item vem com o fornecedor que o vende, para a conversa já começar pelo produto certo.">
          <TabelaItens lista={dados.itens[sentido]} parceiro="Fornecedor" vazio="Nenhum item nesta situação." />
        </Bloco>

        <Bloco
          titulo={`Top 10 fornecedores do Simples Nacional que ${sobe ? "aumentam" : "reduzem"} o custo`}
          leitura="Ordenados pela diferença de custo (valor menos crédito), que é o que pesa no resultado. No Simples o crédito é menor: um preço que parece estável pode virar custo maior."
        >
          <TabelaParceiros lista={dados.simples[sentido]} vazio="Nenhum fornecedor do Simples Nacional nesta situação." />
        </Bloco>

        <Bloco titulo="Pareto 80/20: onde agir primeiro" leitura="Poucos fornecedores, NCMs ou grupos concentram quase todo o efeito. Comece por eles.">
          <Alternar opcoes={{ fornecedor: "Por fornecedor", ncm: "Por NCM", grupo: "Por grupo (capítulo NCM)" }} valor={pareto} onChange={setPareto} />
          <div className="grade-2" style={{ marginTop: 12 }}>
            <div>
              <h4 className="cap-subtitulo">Aumento de custo (negociar)</h4>
              <Pareto
                dados={pareto === "fornecedor" ? p.custoSobeFornecedor : pareto === "ncm" ? p.custoSobeNcm : p.custoSobeGrupo}
                medida="o aumento de custo" parceiros={pareto === "fornecedor"}
              />
            </div>
            <div>
              <h4 className="cap-subtitulo">Redução de custo (garantir o repasse)</h4>
              {pareto === "grupo" ? (
                <p className="cap-vazio">Use “Por fornecedor” ou “Por NCM” para ver as reduções.</p>
              ) : (
                <Pareto dados={pareto === "fornecedor" ? p.custoCaiFornecedor : p.custoCaiNcm} medida="a redução de custo" parceiros={pareto === "fornecedor"} />
              )}
            </div>
          </div>
        </Bloco>

        <Bloco
          titulo="Monte a sua visão"
          leitura="Nasce por item e fornecedor. Troque os agrupadores (NCM, regime, CFOP, competência…), abra impostos e créditos por tributo e baixe em CSV."
        >
          <Explorador calculoId={calculoId} regime={regime} sentido="entrada" />
        </Bloco>

        <Bloco titulo="Plano de negociação com fornecedores" leitura="Do ponto de vista da empresa compradora. Comece pelos fornecedores do Pareto.">
          <div className="grade-2">
            <Plano
              titulo="Com quem aumenta o preço"
              passos={[
                {
                  acao: "Peça a composição do preço",
                  porque: "O fornecedor precisa mostrar que tirou ICMS, PIS, COFINS e IPI do preço base antes de somar o IBS e a CBS. Sem isso, a empresa paga o tributo duas vezes.",
                },
                {
                  acao: "Negocie pelo preço sem IBS e CBS",
                  porque: "Do fornecedor do regime regular, o IBS e a CBS voltam como crédito. A conta que importa é o preço líquido e o custo efetivo, não o total da nota.",
                },
                {
                  acao: "Coloque cláusula de revisão a cada degrau",
                  porque: "As alíquotas mudam em 2027, de 2029 a 2032 e em 2033. Revisar a cada virada evita que o aumento de hoje vire preço fixo até o fim da transição.",
                },
                {
                  acao: "Tenha uma alternativa cotada",
                  porque: "Cote o mesmo item com outro fornecedor, de preferência do regime regular (crédito integral). A alternativa é o que dá força à mesa.",
                },
                {
                  acao: "Troque prazo e volume por preço",
                  porque: "Com o split payment o fornecedor recebe sem o tributo. Ofereça previsibilidade de volume ou prazo em troca de segurar o preço líquido.",
                },
              ]}
            />
            <Plano
              titulo="Com quem reduz o preço"
              passos={[
                {
                  acao: "Formalize a nova tabela",
                  porque: "A redução só vira resultado se estiver no pedido. Fornecedor que “mantém o preço” embolsa a diferença.",
                },
                {
                  acao: "Garanta o repasse integral",
                  porque: "Compare o preço líquido novo com o de hoje sem tributos. A queda tem de ser, no mínimo, a dos tributos que deixaram de existir.",
                },
                {
                  acao: "Use a redução para alongar prazo",
                  porque: "O fornecedor que ganha competitividade com a reforma tem espaço para conceder prazo ou bonificação.",
                },
                {
                  acao: "No Simples, peça o regime híbrido",
                  porque: "Fornecedor do Simples pode recolher IBS e CBS por fora e gerar crédito integral. Se não puder, peça desconto equivalente ao crédito que a empresa perde.",
                },
              ]}
            />
          </div>
        </Bloco>

        <Premissa>
          Fonte: cálculo da Pricetax, ano {dados.ano}, cenário de compras {dados.cenario}. AR = regras de hoje; DR = regras de {dados.ano}.
          {dados.parcial && " As listas consideram os 2.000 maiores grupos por valor de compra."}
        </Premissa>
      </Capitulo>
    </div>
    </ProvedorFicha>
  )
}
