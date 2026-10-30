"use client"
import { useState } from "react"
import type { Trilha } from "@/lib/capitulos"
import { acharLinha, montarDre } from "@/lib/demonstrativos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtPct, useBusca } from "../util"
import { Alternar, Bloco, COR_CENARIO, Capitulo, Demonstrativo, Diferenca, Indicador, LinhasAno, Premissa } from "./ui"

export function useTrilha(calculoId: string, regime: string) {
  return useBusca((s) => api<Trilha>(`/api/calculos/${calculoId}/capitulos/trilha`, { regime }, s), [calculoId, regime])
}

/** Os valores de uma linha do demonstrativo em cada cenário: [AR, ...anos]. */
export function porCenario(t: Trilha, montar: typeof montarDre, id: string) {
  return t.cenarios.map((c) => ({ c, valores: acharLinha(montar(t, c.id), id)?.valores ?? [] }))
}

export function Dre({ calculoId, regime }: { calculoId: string; regime: string }) {
  const { dados, erro, carregando } = useTrilha(calculoId, regime)
  const [cenario, setCenario] = useState<string | null>(null)
  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Montando a DRE de 2027 a 2033 nos três cenários…</div>

  const anos = dados.anos
  const escolhido = dados.cenarios.find((c) => c.id === cenario) ?? dados.cenarios.find((c) => c.rotulo === "Com Reajuste") ?? dados.cenarios[0]
  const linhas = montarDre(dados, escolhido.id)
  const v = (id: string) => acharLinha(linhas, id)?.valores ?? []
  const series = (id: string) =>
    porCenario(dados, montarDre, id).map(({ c, valores }) => ({ nome: c.rotulo, cor: COR_CENARIO[c.rotulo], valores: valores.slice(1) }))
  const ar = (id: string) => v(id)[0] ?? null

  // Receita bruta de hoje − a do primeiro ano = tributos atuais que saem + mudança no preço líquido.
  const rb = v("rb")
  const ded = v("ded")
  const rl = v("rl")
  const saemTributos = -(ded[0] ?? 0) + (ded[1] ?? 0)
  const mudaPreco = (rl[0] ?? 0) - (rl[1] ?? 0)
  const lb = v("lb")

  return (
    <div className={carregando ? "carregando" : undefined}>
      <Capitulo numero="03" titulo="DRE · 2027 a 2033" sub="O efeito do IBS e da CBS na DRE, ano a ano, nos três cenários de preço.">
        <Bloco titulo="Como ler a DRE da reforma">
          <div className="cap-didatico">
            <div>
              <span className="cap-didatico-n">1</span>
              <b>Hoje (AR), os tributos estão dentro do preço.</b> ICMS, ISS, PIS, COFINS e IPI entram na receita bruta e saem na linha de deduções.
              Por isso a receita bruta de hoje parece maior.
            </div>
            <div>
              <span className="cap-didatico-n">2</span>
              <b>Depois (DR), o IBS e a CBS ficam fora da receita bruta.</b> São cobrados por fora. A receita bruta cai por dois motivos: o reajuste
              de preço de cada cenário e a saída do tributo de dentro do preço.
            </div>
            <div>
              <span className="cap-didatico-n">3</span>
              <b>Custos e despesas nunca levam IBS e CBS.</b> No DR, o tributo das compras vira crédito e não entra no custo. Hoje, só ficam fora os
              tributos que já são creditáveis.
            </div>
            <div>
              <span className="cap-didatico-n">4</span>
              <b>Os tributos atuais vão saindo de cena.</b> A linha de deduções encolhe a cada ano e, em {anos[anos.length - 1]}, a DRE fica limpa
              de tributos.
            </div>
          </div>
        </Bloco>

        <Bloco
          titulo="DRE"
          leitura="No formato da DRE: clique numa linha com ▸ para abrir até o tributo (deduções por tributo, créditos por tributo). Valores negativos são saídas."
        >
          <Alternar opcoes={Object.fromEntries(dados.cenarios.map((c) => [c.id, c.rotulo]))} valor={escolhido.id} onChange={(x) => setCenario(x)} />
          <Demonstrativo colunas={["Hoje (AR)", ...anos.map(String)]} linhas={linhas} />
          <p className="cap-nota">
            Lucro bruto em {anos[anos.length - 1]} contra hoje, no cenário {escolhido.rotulo}:{" "}
            <Diferenca valor={(lb[lb.length - 1] ?? 0) - (lb[0] ?? 0)} subirEhBom />.
          </p>
        </Bloco>

        <Bloco titulo={`Por que a receita bruta muda em ${anos[0]} · ${escolhido.rotulo}`}>
          <div className="cap-kpis">
            <Indicador rotulo="Receita bruta hoje" valor={fmtBRL(rb[0] ?? 0)} contexto="com os tributos atuais dentro do preço" />
            <Indicador rotulo={`Receita bruta ${anos[0]}`} valor={fmtBRL(rb[1] ?? 0)} contexto="sem IBS e CBS" />
            <Indicador rotulo="Tributos atuais que saem da receita" valor={fmtBRL(saemTributos)} contexto="deduções de hoje menos as que restam" />
            <Indicador rotulo="Mudança no preço líquido" valor={fmtBRL(mudaPreco)} contexto="receita líquida de hoje menos a nova" />
          </div>
        </Bloco>

        <Bloco
          titulo="Lucro bruto no tempo"
          leitura="A linha tracejada é o resultado de hoje. Cada linha é um caminho de preço: a distância entre elas é o que a decisão de preço vale, ano a ano."
        >
          <LinhasAno anos={anos} ar={ar("lb")} series={series("lb")} />
        </Bloco>

        <div className="grade-2">
          <Bloco titulo="Margem bruta" leitura="Lucro bruto sobre a receita líquida.">
            <LinhasAno anos={anos} ar={ar("mb")} series={series("mb")} formatar={(x) => fmtPct(x)} />
          </Bloco>
          <Bloco titulo="Receita bruta" leitura="A queda não é venda a menos: é o IBS e a CBS saindo de dentro do preço.">
            <LinhasAno anos={anos} ar={ar("rb")} series={series("rb")} />
          </Bloco>
        </div>

        <Premissa>
          A DRE vai até o lucro bruto: a API de cálculos não traz despesas operacionais, IR e CSLL. Custos = compras do período (custos e despesas
          adquiridos), sem IBS e CBS no DR. Compras no cenário Ajustado em todos os cenários de venda.
        </Premissa>
      </Capitulo>
    </div>
  )
}
