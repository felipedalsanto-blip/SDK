"use client"
import { useEffect, useState } from "react"
import type { Trilha } from "@/lib/capitulos"
import { acharLinha, montarDre, type Linha, type PremissasIr } from "@/lib/demonstrativos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtPct, useBusca } from "../util"
import { Alternar, Bloco, COR_CENARIO, Capitulo, Demonstrativo, Diferenca, Indicador, LinhasAno, Premissa } from "./ui"

export function useTrilha(calculoId: string, regime: string) {
  return useBusca((s) => api<Trilha>(`/api/calculos/${calculoId}/capitulos/trilha`, { regime }, s), [calculoId, regime])
}

/** Os valores de uma linha do demonstrativo em cada cenário: [AR, ...anos]. */
export function porCenario(t: Trilha, montar: (t: Trilha, cenarioId: string) => Linha[], id: string) {
  return t.cenarios.map((c) => ({ c, valores: acharLinha(montar(t, c.id), id)?.valores ?? [] }))
}

type Entrada = Omit<PremissasIr, "regime" | "meses">
const PADRAO: Entrada = { despesas: { modo: "percentual", valor: 0 }, atividade: "comercio" }

/** As premissas de IR e CSLL do cálculo, guardadas neste navegador e usadas na DRE e no fluxo. */
export function usePremissasIr(calculoId: string, regime: string, meses: number | null): [PremissasIr, (e: Entrada) => void] {
  const chave = `pricetax-premissas-ir:${calculoId}`
  const [entrada, setEntrada] = useState<Entrada>(PADRAO)
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(chave)
      if (salvo) setEntrada({ ...PADRAO, ...JSON.parse(salvo) })
    } catch {}
  }, [chave])
  const mudar = (e: Entrada) => {
    setEntrada(e)
    try {
      localStorage.setItem(chave, JSON.stringify(e))
    } catch {}
  }
  return [{ ...entrada, regime, meses: meses && meses > 0 ? meses : 12 }, mudar]
}

const NOME_REGIME: Record<string, string> = { simplesNacional: "Simples Nacional", lucroReal: "Lucro Real", lucroPresumido: "Lucro Presumido" }

export function FormPremissas({ p, mudar }: { p: PremissasIr; mudar: (e: Entrada) => void }) {
  const simples = p.regime === "simplesNacional"
  return (
    <div className="cap-premissas-ir">
      <span className="cap-kpi-rotulo">Premissas para o IRPJ e a CSLL · {NOME_REGIME[p.regime] ?? p.regime}</span>
      {simples ? (
        <span className="cap-sub">No Simples Nacional, IRPJ e CSLL estão dentro do DAS e não são calculados à parte.</span>
      ) : (
        <div className="cap-premissas-campos">
          <label>
            Despesas operacionais
            <span className="cap-premissas-linha">
              <input
                type="number"
                min={0}
                step={p.despesas.modo === "percentual" ? 0.5 : 1000}
                value={p.despesas.valor}
                onChange={(e) => mudar({ despesas: { ...p.despesas, valor: Math.max(0, Number(e.target.value) || 0) }, atividade: p.atividade })}
              />
              <select value={p.despesas.modo} onChange={(e) => mudar({ despesas: { modo: e.target.value as "percentual" | "valor", valor: p.despesas.valor }, atividade: p.atividade })}>
                <option value="percentual">% da receita líquida</option>
                <option value="valor">R$ no período</option>
              </select>
            </span>
          </label>
          {p.regime === "lucroPresumido" && (
            <label>
              Atividade (presunção)
              <select value={p.atividade} onChange={(e) => mudar({ despesas: p.despesas, atividade: e.target.value as "comercio" | "servicos" })}>
                <option value="comercio">Comércio e indústria (8% IRPJ, 12% CSLL)</option>
                <option value="servicos">Serviços (32% IRPJ, 32% CSLL)</option>
              </select>
            </label>
          )}
          <span className="cap-sub">
            {p.regime === "lucroPresumido"
              ? "IRPJ de 15% e CSLL de 9% sobre a base presumida da receita bruta, mais 10% de adicional de IRPJ acima de R$ 20 mil por mês."
              : "IRPJ de 15% e CSLL de 9% sobre o lucro antes do IR e da CSLL, mais 10% de adicional de IRPJ acima de R$ 20 mil por mês."}{" "}
            Período de {p.meses} meses. As despesas não vêm da API: informe as do cliente.
          </span>
        </div>
      )}
    </div>
  )
}

export function Dre({ calculoId, regime, periodoMeses }: { calculoId: string; regime: string; periodoMeses: number | null }) {
  const { dados, erro, carregando } = useTrilha(calculoId, regime)
  const [cenario, setCenario] = useState<string | null>(null)
  const [premissas, mudarPremissas] = usePremissasIr(calculoId, regime, periodoMeses)
  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Montando a DRE de 2027 a 2033 nos três cenários…</div>

  const anos = dados.anos
  const escolhido = dados.cenarios.find((c) => c.id === cenario) ?? dados.cenarios.find((c) => c.rotulo === "Com Reajuste") ?? dados.cenarios[0]
  const montar = (t: Trilha, c: string) => montarDre(t, c, premissas)
  const linhas = montar(dados, escolhido.id)
  const v = (id: string) => acharLinha(linhas, id)?.valores ?? []
  const series = (id: string) =>
    porCenario(dados, montar, id).map(({ c, valores }) => ({ nome: c.rotulo, cor: COR_CENARIO[c.rotulo], valores: valores.slice(1) }))
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
          <FormPremissas p={premissas} mudar={mudarPremissas} />
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

        {regime !== "simplesNacional" && (
          <Bloco
            titulo="Lucro líquido no tempo"
            leitura="Depois das despesas informadas, do IRPJ e da CSLL. A linha tracejada é o resultado de hoje."
          >
            <LinhasAno anos={anos} ar={ar("ll")} series={series("ll")} />
          </Bloco>
        )}

        <div className="grade-2">
          <Bloco titulo="Margem bruta" leitura="Lucro bruto sobre a receita líquida.">
            <LinhasAno anos={anos} ar={ar("mb")} series={series("mb")} formatar={(x) => fmtPct(x)} />
          </Bloco>
          <Bloco titulo="Receita bruta" leitura="A queda não é venda a menos: é o IBS e a CBS saindo de dentro do preço.">
            <LinhasAno anos={anos} ar={ar("rb")} series={series("rb")} />
          </Bloco>
        </div>

        <Premissa>
          Despesas operacionais são informadas por você (a API de cálculos não as traz); o IRPJ e a CSLL são calculados a partir delas, pelas
          alíquotas gerais do regime. Custos = compras do período (custos e despesas
          adquiridos), sem IBS e CBS no DR. Compras no cenário Ajustado em todos os cenários de venda.
        </Premissa>
      </Capitulo>
    </div>
  )
}
