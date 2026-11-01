"use client"
import { Wallet } from "lucide-react"
import { useState } from "react"
import type { Estorno } from "@/lib/capitulos"
import { acharLinha, montarFluxo } from "@/lib/demonstrativos"
import { Erro } from "../comum"
import { api, useApi, fmtBRL, fmtPct, useBusca } from "../util"
import type { Trilha } from "@/lib/capitulos"
import { FormPremissas, porCenario, usePremissasIr, useTrilha } from "./Dre"
import { EstimadosAnos } from "./Estimados"
import { Alternar, Bloco, Capitulo, Carregando, COR_CENARIO, Demonstrativo, Indicador, LinhasAno, Premissa } from "./ui"

export function Fluxo({
  calculoId,
  regime,
  periodoMeses,
  ano,
  semEstimados,
}: {
  calculoId: string
  regime: string
  periodoMeses: number | null
  ano: number
  semEstimados: boolean
}) {
  const { dados, erro, carregando, progresso } = useTrilha(calculoId, regime, semEstimados)
  const [premissas, mudarPremissas] = usePremissasIr(calculoId, regime, periodoMeses)
  const estorno = useApi<Estorno>(`/api/calculos/${calculoId}/capitulos/estorno`, { regime })
  const [cenario, setCenario] = useState<string | null>(null)

  if (erro) return <Erro erro={erro} />
  if (!dados) return <Carregando mensagem="Montando o fluxo de caixa de 2027 a 2033…" progresso={progresso} />

  const anos = dados.anos
  const escolhido = dados.cenarios.find((c) => c.id === cenario) ?? dados.cenarios.find((c) => c.rotulo === "Com Reajuste") ?? dados.cenarios[0]
  const montar = (t: Trilha, c: string) => montarFluxo(t, c, premissas)
  const linhas = montar(dados, escolhido.id)
  const v = (id: string) => acharLinha(linhas, id)?.valores ?? []
  const series = (id: string, sinal = 1) =>
    porCenario(dados, montar, id).map(({ c, valores }) => ({
      nome: c.rotulo,
      cor: COR_CENARIO[c.rotulo],
      valores: valores.slice(1).map((x) => (x === null ? null : sinal * x)),
    }))
  const ar = (id: string, sinal = 1) => (v(id)[0] === null || v(id)[0] === undefined ? null : sinal * v(id)[0]!)

  return (
    <div className={carregando ? "carregando" : undefined} aria-busy={carregando}>
      <Capitulo numero="05" icone={Wallet} titulo="Fluxo de caixa · 2027 a 2033" sub="Quanto entra dos clientes, sai para fornecedores e vai para o governo, ano a ano.">
        <Bloco
          titulo="Fluxo de caixa operacional"
          leitura="No formato que o financeiro usa: entradas positivas, saídas negativas. Clique numa linha com ▸ para abrir até o tributo."
        >
          <FormPremissas p={premissas} mudar={mudarPremissas} />
          <Alternar opcoes={Object.fromEntries(dados.cenarios.map((c) => [c.id, c.rotulo]))} valor={escolhido.id} onChange={(x) => setCenario(x)} />
          <Demonstrativo colunas={["Hoje (AR)", ...anos.map(String)]} linhas={linhas} destaque={Math.max(0, anos.indexOf(ano)) + 1} />
          <EstimadosAnos anos={dados.estimados.anos} excluidos={dados.estimados.excluidos} />
        </Bloco>

        <Bloco
          titulo="Recebimento de clientes: o preço de venda, já com IBS e CBS"
          leitura="Aqui os cenários se separam: a distância de cada linha até a tracejada mostra quanto o preço precisa subir (ou pode cair) em cada caminho."
        >
          <LinhasAno anos={anos} ar={ar("cli")} series={series("cli")} />
        </Bloco>

        <div className="grade-2">
          <Bloco titulo="Pagamento a fornecedores" leitura="Igual em todos os cenários de venda: as compras não mudam com o preço de venda.">
            <LinhasAno
              anos={anos}
              ar={ar("forn", -1)}
              series={[{ nome: "Fornecedores", cor: "var(--pt-preto)", valores: v("forn").slice(1).map((x) => (x === null ? null : -x)) }]}
            />
          </Bloco>
          <Bloco titulo="Tributos recolhidos" leitura="Débitos das vendas menos créditos das compras: o que sai do caixa para o governo.">
            <LinhasAno anos={anos} ar={ar("trib", -1)} series={series("trib", -1)} />
          </Bloco>
        </div>

        <Bloco titulo="Geração de caixa operacional" leitura="Recebimentos menos pagamentos a fornecedores menos tributos recolhidos, em cada cenário.">
          <LinhasAno anos={anos} ar={ar("ger")} series={series("ger")} />
        </Bloco>

        {regime !== "simplesNacional" && (
          <Bloco titulo="Geração de caixa depois do IR e da CSLL" leitura="O mesmo caixa, descontados o IRPJ e a CSLL calculados na DRE com as premissas informadas.">
            <LinhasAno anos={anos} ar={ar("ger-ir")} series={series("ger-ir")} />
          </Bloco>
        )}

        <Bloco
          titulo="Estorno de débito: o benefício na saída que se perde"
          leitura="Hoje a empresa destaca um tributo na nota e deve menos por causa de benefícios na saída (por exemplo, destaca 12% e estorna 10%, ficando com 2%). Com os tributos atuais sendo extintos, esse ganho perde força a cada ano."
        >
          {estorno.erro != null && <Erro erro={estorno.erro} />}
          {!estorno.dados && !estorno.erro && <p className="cap-vazio">Somando o tributo destacado e o devido em cada ano…</p>}
          {estorno.dados && <EstornoDebito e={estorno.dados} />}
        </Bloco>

        <Bloco
          titulo="Estorno de crédito: o crédito que hoje não volta"
          leitura="Parte do tributo pago nas compras não vira crédito, por exemplo quando a saída tem incentivo fiscal. Com a extinção dos tributos atuais, esse efeito muda ano a ano."
        >
          <LinhasAno
            anos={anos}
            ar={ar("info-estorno")}
            series={[{ nome: "Tributo das compras sem crédito", cor: "var(--pt-preto)", valores: v("info-estorno").slice(1) }]}
          />
          <p className="cap-nota">
            Aproximação: tributo das compras menos o crédito tomado. A API não separa o estorno de crédito por incentivo das demais compras sem direito a
            crédito.
          </p>
        </Bloco>

        <Premissa>
          Fonte: cálculo da Pricetax, compras no Ajustado. Recebimento = vendas com tributos; pagamento a fornecedores = compras com tributos; tributos
          recolhidos = débitos das vendas menos créditos das compras. IRPJ e CSLL vêm da DRE, com as premissas informadas.
        </Premissa>
      </Capitulo>
    </div>
  )
}

function EstornoDebito({ e }: { e: Estorno }) {
  const anos = e.anos.map((a) => a.ano)
  const perda = (v: number) => Math.max(0, e.ar.estorno - v)
  const ultimo = e.anos[e.anos.length - 1]
  return (
    <>
      <div className="cap-kpis">
        <Indicador rotulo="Estorno de débito hoje" valor={fmtBRL(e.ar.estorno)} contexto={`destacado ${fmtBRL(e.ar.destacado)}, devido ${fmtBRL(e.ar.devido)}`} />
        <Indicador rotulo={`Benefício perdido em ${ultimo?.ano}`} valor={fmtBRL(perda(ultimo?.estorno ?? 0))} contexto="estorno de hoje menos o que resta no ano" />
        <Indicador
          rotulo="Aumento de preço para repor"
          valor={e.ar.vendas ? fmtPct(perda(ultimo?.estorno ?? 0) / e.ar.vendas) : "n/d"}
          contexto="benefício perdido ÷ vendas de hoje"
        />
      </div>
      <LinhasAno
        anos={anos}
        ar={e.ar.estorno}
        series={[
          { nome: "Estorno de débito no ano", cor: "var(--pt-amarelo)", valores: e.anos.map((a) => a.estorno) },
          { nome: "Benefício perdido contra hoje", cor: "var(--pt-preto)", valores: e.anos.map((a) => perda(a.estorno)) },
        ]}
      />
      <Demonstrativo
        colunas={["Hoje (AR)", ...anos.map(String)]}
        linhas={[
          { id: "e-dest", nome: "Tributo destacado na nota", valores: [e.ar.destacado, ...e.anos.map((a) => a.destacado)] },
          { id: "e-dev", nome: "(−) Tributo devido", valores: [-e.ar.devido, ...e.anos.map((a) => -a.devido)] },
          { id: "e-est", nome: "(=) Estorno de débito", tipo: "resultado", valores: [e.ar.estorno, ...e.anos.map((a) => a.estorno)] },
          { id: "e-perda", nome: "Benefício perdido contra hoje", tipo: "info", valores: [null, ...e.anos.map((a) => perda(a.estorno))] },
        ]}
      />
      <p className="cap-nota">Calculado no cenário {e.cenario} (preço de hoje), para isolar o efeito do benefício.</p>
    </>
  )
}
