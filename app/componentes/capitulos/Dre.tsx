"use client"
import { useState } from "react"
import type { Dre as LinhaDre, Trilha } from "@/lib/capitulos"
import { Erro } from "../comum"
import { api, fmtBRL, useBusca } from "../util"
import { Alternar, Bloco, COR_CENARIO, Capitulo, ColunasAno, Diferenca, Indicador, Premissa, TabelaAnos } from "./ui"

export function useTrilha(calculoId: string, regime: string) {
  return useBusca((s) => api<Trilha>(`/api/calculos/${calculoId}/capitulos/trilha`, { regime }, s), [calculoId, regime])
}

const LINHAS: { chave: keyof LinhaDre; nome: string; destaque?: boolean }[] = [
  { chave: "receitaBruta", nome: "Receita bruta" },
  { chave: "deducoes", nome: "(−) Deduções de tributos" },
  { chave: "receitaLiquida", nome: "Receita líquida" },
  { chave: "custos", nome: "(−) Custos e despesas de compra" },
  { chave: "lucroBruto", nome: "Lucro bruto", destaque: true },
  { chave: "ibsCbs", nome: "IBS e CBS (por fora, fora da receita)" },
]

export function Dre({ calculoId, regime }: { calculoId: string; regime: string }) {
  const { dados, erro, carregando } = useTrilha(calculoId, regime)
  const [cenario, setCenario] = useState<string | null>(null)
  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Montando a DRE de 2027 a 2033 nos três cenários…</div>

  const anos = dados.cenarios[0]?.anos.map((p) => p.ano) ?? []
  const escolhido = dados.cenarios.find((c) => c.id === cenario) ?? dados.cenarios.find((c) => c.rotulo === "Com Reajuste") ?? dados.cenarios[0]
  const primeiro = escolhido.anos[0]
  const ultimo = escolhido.anos[escolhido.anos.length - 1]
  const ar = dados.ar.dre
  // Receita bruta AR − DR = tributos atuais que saem da receita + mudança no preço líquido.
  const saemTributos = ar.deducoes - primeiro.dre.deducoes
  const mudaPreco = ar.receitaLiquida - primeiro.dre.receitaLiquida

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
              <b>Depois (DR), o IBS e a CBS ficam fora da receita bruta.</b> São cobrados por fora, como o IPI. A receita bruta cai por dois motivos: o
              reajuste de preço de cada cenário e a saída do tributo de dentro do preço.
            </div>
            <div>
              <span className="cap-didatico-n">3</span>
              <b>Custos e despesas nunca levam IBS e CBS.</b> No DR, o tributo das compras vira crédito e não entra no custo. Hoje, só ficam fora os
              tributos que já são creditáveis.
            </div>
            <div>
              <span className="cap-didatico-n">4</span>
              <b>Os tributos atuais vão saindo de cena.</b> A linha de deduções encolhe a cada ano e, em {ultimo.ano}, a DRE fica limpa de tributos.
            </div>
          </div>
        </Bloco>

        <Bloco titulo={`Por que a receita bruta muda em ${primeiro.ano} · ${escolhido.rotulo}`}>
          <div className="cap-kpis">
            <Indicador rotulo="Receita bruta hoje" valor={fmtBRL(ar.receitaBruta)} contexto="com os tributos atuais dentro do preço" />
            <Indicador rotulo={`Receita bruta ${primeiro.ano}`} valor={fmtBRL(primeiro.dre.receitaBruta)} contexto="sem IBS e CBS" />
            <Indicador
              rotulo="Tributos atuais que saem da receita"
              valor={fmtBRL(saemTributos)}
              contexto="deduções de hoje menos as que restam"
            />
            <Indicador rotulo="Mudança no preço líquido" valor={fmtBRL(mudaPreco)} contexto="receita líquida de hoje menos a nova" />
          </div>
          <p className="cap-nota">Receita bruta de hoje − receita bruta de {primeiro.ano} = tributos que saem + mudança no preço líquido.</p>
        </Bloco>

        <Bloco
          titulo="Lucro bruto ano a ano, nos três cenários"
          leitura="A coluna cinza é o resultado de hoje. Cada ano mostra os três caminhos de preço lado a lado: a distância entre eles é o que a decisão de preço vale."
        >
          <ColunasAno
            anos={anos}
            ar={ar.lucroBruto}
            series={dados.cenarios.map((c) => ({ nome: c.rotulo, cor: COR_CENARIO[c.rotulo], valores: c.anos.map((p) => p.dre.lucroBruto) }))}
          />
        </Bloco>

        <Bloco titulo="Receita bruta ano a ano" leitura="A queda de 2027 em diante não é venda a menos: é o IBS e a CBS saindo de dentro do preço.">
          <ColunasAno
            anos={anos}
            ar={ar.receitaBruta}
            series={dados.cenarios.map((c) => ({ nome: c.rotulo, cor: COR_CENARIO[c.rotulo], valores: c.anos.map((p) => p.dre.receitaBruta) }))}
          />
        </Bloco>

        <Bloco titulo="DRE completa por cenário">
          <Alternar
            opcoes={Object.fromEntries(dados.cenarios.map((c) => [c.id, c.rotulo]))}
            valor={escolhido.id}
            onChange={(v) => setCenario(v)}
          />
          <div style={{ marginTop: 12 }}>
            <TabelaAnos
              anos={anos}
              linhas={LINHAS.map((l) => ({
                nome: l.nome,
                ar: l.chave === "ibsCbs" ? null : ar[l.chave],
                valores: escolhido.anos.map((p) => p.dre[l.chave]),
                destaque: l.destaque,
              }))}
            />
          </div>
          <p className="cap-nota">
            Lucro bruto em {ultimo.ano} contra hoje: <Diferenca valor={ultimo.dre.lucroBruto - ar.lucroBruto} subirEhBom />.
          </p>
        </Bloco>

        <Premissa>
          A DRE vai até o lucro bruto: a API de cálculos não traz despesas operacionais, IR e CSLL. Custos = compras do período (custos e despesas
          adquiridos), sem IBS e CBS no DR. Compras no cenário Ajustado em todos os cenários de venda.
        </Premissa>
      </Capitulo>
    </div>
  )
}
