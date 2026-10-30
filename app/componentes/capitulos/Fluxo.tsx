"use client"
import type { Estorno } from "@/lib/capitulos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtPct, useBusca } from "../util"
import { useTrilha } from "./Dre"
import { Bloco, COR_AR, COR_CENARIO, Capitulo, ColunasAno, Diferenca, Indicador, Premissa, TabelaAnos } from "./ui"

export function Fluxo({ calculoId, regime }: { calculoId: string; regime: string }) {
  const { dados, erro, carregando } = useTrilha(calculoId, regime)
  const estorno = useBusca((s) => api<Estorno>(`/api/calculos/${calculoId}/capitulos/estorno`, { regime }, s), [calculoId, regime])

  if (erro) return <Erro erro={erro} />
  if (!dados) return <div className="cartao vazio">Montando o fluxo de caixa de 2027 a 2033…</div>

  const anos = dados.cenarios[0]?.anos.map((p) => p.ano) ?? []
  const ar = dados.ar.fluxo
  const base = dados.cenarios[0]
  const series = (f: (p: (typeof base.anos)[number]) => number) =>
    dados.cenarios.map((c) => ({ nome: c.rotulo, cor: COR_CENARIO[c.rotulo], valores: c.anos.map(f) }))

  return (
    <div className={carregando ? "carregando" : undefined}>
      <Capitulo numero="04" titulo="Fluxo de caixa · 2027 a 2033" sub="Quanto entra dos clientes, sai para fornecedores e vai para o governo, ano a ano.">
        <Bloco
          titulo="Fornecedores: quanto sai para pagar as compras"
          leitura="É igual nos três cenários de venda (as compras não mudam com o preço de venda), por isso aparece uma vez, comparada com hoje."
        >
          <ColunasAno anos={anos} ar={ar.fornecedores} series={[{ nome: "Fornecedores (DR)", cor: "var(--pt-preto)", valores: base.anos.map((p) => p.fluxo.fornecedores) }]} />
          <TabelaAnos
            anos={anos}
            linhas={[
              { nome: "Fornecedores", ar: ar.fornecedores, valores: base.anos.map((p) => p.fluxo.fornecedores) },
              { nome: "Diferença contra hoje", ar: null, valores: base.anos.map((p) => p.fluxo.fornecedores - ar.fornecedores), destaque: true },
            ]}
          />
        </Bloco>

        <Bloco
          titulo="Clientes: o preço de venda, já com IBS e CBS"
          leitura="Aqui os três cenários se separam. A diferença contra hoje mostra, ano a ano, quanto o preço precisa subir (ou pode cair) em cada caminho."
        >
          <ColunasAno anos={anos} ar={ar.clientes} series={series((p) => p.fluxo.clientes)} />
          <TabelaAnos
            anos={anos}
            linhas={dados.cenarios.map((c) => ({
              nome: `${c.rotulo}: diferença contra hoje`,
              ar: null,
              valores: c.anos.map((p) => p.fluxo.clientes - ar.clientes),
            }))}
          />
        </Bloco>

        <Bloco titulo="Tributo recolhido" leitura="Tributos das vendas menos o crédito das compras: o que efetivamente sai do caixa para o governo.">
          <ColunasAno anos={anos} ar={ar.tributos} series={series((p) => p.fluxo.tributos)} />
        </Bloco>

        <Bloco titulo="Variação de caixa" leitura="Clientes menos fornecedores menos tributo recolhido. É o caixa que a operação gera em cada ano e cenário.">
          <ColunasAno anos={anos} ar={ar.variacao} series={series((p) => p.fluxo.variacao)} />
          <TabelaAnos
            anos={anos}
            linhas={dados.cenarios.map((c) => ({ nome: c.rotulo, ar: ar.variacao, valores: c.anos.map((p) => p.fluxo.variacao), destaque: true }))}
          />
        </Bloco>

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
          leitura="Parte do tributo pago nas compras não vira crédito, por exemplo quando a saída tem incentivo fiscal. Com a extinção dos tributos atuais, esse efeito também muda ano a ano."
        >
          <div className="cap-kpis">
            <Indicador rotulo="Hoje" valor={fmtBRL(ar.estornoCredito)} contexto="tributo das compras que não vira crédito" />
            <Indicador
              rotulo={`Em ${base.anos[base.anos.length - 1]?.ano}`}
              valor={fmtBRL(base.anos[base.anos.length - 1]?.fluxo.estornoCredito ?? 0)}
              contexto={
                <>
                  contra hoje: <Diferenca valor={(base.anos[base.anos.length - 1]?.fluxo.estornoCredito ?? 0) - ar.estornoCredito} />
                </>
              }
            />
          </div>
          <TabelaAnos anos={anos} linhas={[{ nome: "Tributo das compras sem crédito", ar: ar.estornoCredito, valores: base.anos.map((p) => p.fluxo.estornoCredito) }]} />
          <p className="cap-nota">
            Aproximação: tributo das compras menos o crédito tomado. A API não separa o estorno de crédito por incentivo das demais compras sem
            direito a crédito.
          </p>
        </Bloco>

        <Premissa>
          Fonte: cálculo da Pricetax, compras no Ajustado. Clientes = vendas com tributos; fornecedores = compras com tributos; tributo recolhido =
          débito das vendas menos crédito das compras. Não inclui IR e CSLL.
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
        <Indicador
          rotulo={`Benefício perdido em ${ultimo?.ano}`}
          valor={fmtBRL(perda(ultimo?.estorno ?? 0))}
          contexto="estorno de hoje menos o que resta no ano"
        />
        <Indicador
          rotulo="Aumento de preço para repor"
          valor={e.ar.vendas ? fmtPct(perda(ultimo?.estorno ?? 0) / e.ar.vendas) : "n/d"}
          contexto="benefício perdido ÷ vendas de hoje"
        />
      </div>
      <ColunasAno anos={anos} ar={e.ar.estorno} series={[{ nome: "Estorno de débito no ano", cor: COR_CENARIO["Sem Ajuste"], valores: e.anos.map((a) => a.estorno) }]} />
      <TabelaAnos
        anos={anos}
        linhas={[
          { nome: "Tributo destacado na nota", ar: e.ar.destacado, valores: e.anos.map((a) => a.destacado) },
          { nome: "Tributo devido", ar: e.ar.devido, valores: e.anos.map((a) => a.devido) },
          { nome: "Estorno de débito", ar: e.ar.estorno, valores: e.anos.map((a) => a.estorno), destaque: true },
          { nome: "Benefício perdido contra hoje", ar: null, valores: e.anos.map((a) => perda(a.estorno)) },
        ]}
      />
      <p className="cap-nota">Calculado no cenário {e.cenario} (preço de hoje), para isolar o efeito do benefício.</p>
    </>
  )
}
