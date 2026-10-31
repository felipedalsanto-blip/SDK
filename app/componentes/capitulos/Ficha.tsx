"use client"
import { EstimadosFicha } from "./Estimados"
import { useEffect, useState } from "react"
import type { Ficha as Dados, Memoria as DadosMemoria } from "@/lib/capitulos"
import { TRIBUTOS } from "@/lib/tributos"
import { Erro } from "../comum"
import { api, fmtBRL, fmtCnpj, fmtData, fmtInt, fmtPct, useBusca } from "../util"
import { FichaCtx, type Alvo } from "./ficha-contexto"
import { Diferenca, Indicador, TabelaItens, TabelaParceiros } from "./ui"


const NOME_REGIME: Record<string, string> = { simplesNacional: "Simples Nacional", lucroReal: "Lucro Real", lucroPresumido: "Lucro Presumido" }

/**
 * Envolve um capítulo (Compras ou Vendas): qualquer fornecedor, cliente ou item clicado abre uma
 * ficha lateral. Dentro da ficha, os cliques empilham (fornecedor → item → outro fornecedor…).
 */
export function ProvedorFicha({
  calculoId,
  regime,
  ano,
  semEstimados = false,
  sentido,
  cenario,
  children,
}: {
  calculoId: string
  regime: string
  ano: number
  semEstimados?: boolean
  sentido: "entrada" | "saida"
  cenario?: string
  children: React.ReactNode
}) {
  const [pilha, setPilha] = useState<Alvo[]>([])
  const abrir = (a: Alvo) => setPilha((p) => (p.length && p[p.length - 1].tipo === a.tipo && p[p.length - 1].valor === a.valor ? p : [...p, a]))
  const fechar = () => setPilha([])
  useEffect(() => {
    if (!pilha.length) return
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar()
    window.addEventListener("keydown", tecla)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", tecla)
      document.body.style.overflow = ""
    }
  }, [pilha.length])
  const atual = pilha[pilha.length - 1]
  return (
    <FichaCtx.Provider value={abrir}>
      {children}
      {atual && (
        <div className="ficha-fundo" onClick={fechar}>
          <aside className="ficha" role="dialog" aria-modal="true" aria-label={atual.rotulo} onClick={(e) => e.stopPropagation()}>
            <header className="ficha-topo">
              <nav className="ficha-trilha" aria-label="Caminho">
                {pilha.map((a, i) => (
                  <span key={i}>
                    {i > 0 && <span className="ficha-sep">›</span>}
                    <button onClick={() => setPilha((p) => p.slice(0, i + 1))} aria-current={i === pilha.length - 1 ? "page" : undefined}>
                      {a.tipo === "item" ? "Item" : sentido === "entrada" ? "Fornecedor" : "Cliente"}: {a.rotulo}
                    </button>
                  </span>
                ))}
              </nav>
              <span className="ficha-botoes">
                {pilha.length > 1 && <button onClick={() => setPilha((p) => p.slice(0, -1))}>← Voltar</button>}
                <button onClick={fechar} aria-label="Fechar">
                  ✕
                </button>
              </span>
            </header>
            <ConteudoFicha key={`${atual.tipo}:${atual.valor}`} calculoId={calculoId} regime={regime} ano={ano} semEstimados={semEstimados} sentido={sentido} cenario={cenario} alvo={atual} />
          </aside>
        </div>
      )}
    </FichaCtx.Provider>
  )
}

function ConteudoFicha({ calculoId, regime, ano, semEstimados, sentido, cenario, alvo }: { calculoId: string; regime: string; ano: number; semEstimados: boolean; sentido: "entrada" | "saida"; cenario?: string; alvo: Alvo }) {
  const { dados, erro } = useBusca(
    (s) => api<Dados>(`/api/calculos/${calculoId}/capitulos/ficha`, { regime, ano, semEstimados, sentido, cenario, tipo: alvo.tipo, valor: alvo.valor }, s),
    [calculoId, regime, ano, semEstimados, sentido, cenario, alvo.tipo, alvo.valor],
  )
  if (erro) return <div className="ficha-corpo"><Erro erro={erro} /></div>
  if (!dados) return <div className="ficha-corpo"><p className="cap-vazio">Abrindo a ficha…</p></div>
  const m = dados.memoria
  const compras = sentido === "entrada"
  const outro = compras ? "fornecedor" : "cliente"

  return (
    <div className="ficha-corpo">
      <div className="ficha-titulo">
        <span className="cap-kpi-rotulo">{dados.tipo === "item" ? "Item" : compras ? "Fornecedor" : "Cliente"}</span>
        <h2>{dados.titulo}</h2>
        <span className="cap-sub">
          {[dados.tipo === "parceiro" && dados.sub ? fmtCnpj(dados.sub) : dados.sub, dados.regime && (NOME_REGIME[dados.regime] ?? dados.regime), `${dados.ano}`, !compras && `cenário ${dados.cenario}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="cap-kpis">
        <Indicador rotulo="Itens de nota" valor={fmtInt(m.itens)} contexto={m.quantidade ? `${fmtInt(m.quantidade)} unidades` : undefined} />
        <Indicador rotulo="Valor AR → DR" valor={fmtBRL(m.valor_dr)} contexto={<>hoje {fmtBRL(m.valor_ar)} · <Diferenca valor={m.valor_dr - m.valor_ar} /></>} />
        {compras ? (
          <Indicador rotulo="Custo AR → DR" valor={fmtBRL(m.custo_dr)} contexto={<>hoje {fmtBRL(m.custo_ar)} · <Diferenca valor={m.custo_dr - m.custo_ar} /></>} />
        ) : (
          <Indicador rotulo="Débito AR → DR" valor={fmtBRL(m.debito_dr)} contexto={<>hoje {fmtBRL(m.debito_ar)} · <Diferenca valor={m.debito_dr - m.debito_ar} /></>} />
        )}
        <Indicador rotulo="Carga efetiva" valor={fmtPct(m.carga_efetiva_dr)} contexto={`hoje ${fmtPct(m.carga_efetiva_ar)}`} />
      </div>

      <section className="ficha-secao">
        <h3>Como recompomos o cálculo</h3>
        <p className="cap-leitura">
          À esquerda, a nota como é hoje: do valor com tributos até a base sem tributos{compras ? " e o custo depois do crédito" : ""}. À direita, a mesma base
          recalculada com as regras de {dados.ano}: os tributos atuais que ainda restam, mais o IBS e a CBS{compras ? ", e o novo crédito" : ""}.
        </p>
        <EstimadosFicha e={dados.estimados} />
        <Memoria m={m} compras={compras} ano={dados.ano} />
      </section>

      <section className="ficha-secao">
        <h3>{dados.tipo === "parceiro" ? `Itens deste ${outro}` : `${compras ? "Fornecedores" : "Clientes"} deste item`}</h3>
        <p className="cap-leitura">Clique numa linha para abrir a ficha. As colunas de impostos{compras ? " e créditos" : ""} expandem como nas outras tabelas.</p>
        {dados.tipo === "parceiro" ? (
          <TabelaItens lista={dados.itens} parceiro={compras ? "Fornecedor" : "Cliente"} mostrarCusto={compras} grupos={compras ? ["impostos", "creditos"] : ["impostos"]} vazio="Nenhum item." />
        ) : (
          <TabelaParceiros lista={dados.parceiros} mostrarCusto={compras} grupos={compras ? ["impostos", "creditos"] : ["impostos"]} vazio={`Nenhum ${outro}.`} />
        )}
        {dados.parcial && <p className="cap-nota">Mostrando os 2.000 maiores por valor.</p>}
      </section>

      <section className="ficha-secao">
        <h3>Primeiras notas</h3>
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="cap-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>{compras ? "Fornecedor" : "Cliente"}</th>
                <th>CFOP</th>
                <th className="num">Qtd.</th>
                <th className="num">Valor AR</th>
                <th className="num">Valor DR</th>
                {compras && <th className="num">Custo AR</th>}
                {compras && <th className="num">Custo DR</th>}
              </tr>
            </thead>
            <tbody>
              {dados.notas.map((n, i) => (
                <tr key={i}>
                  <td>{fmtData(n.data)}</td>
                  <td className="texto">{n.nome ?? (n.cnpj ? fmtCnpj(n.cnpj) : "n/d")}</td>
                  <td>{n.cfop ?? "n/d"}</td>
                  <td className="num">{fmtInt(n.quantidade)}</td>
                  <td className="num">{fmtBRL(n.valorAr)}</td>
                  <td className="num">{fmtBRL(n.valorDr)}</td>
                  {compras && <td className="num">{fmtBRL(n.custoAr)}</td>}
                  {compras && <td className="num">{fmtBRL(n.custoDr)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

type Passo = { nome: string; valor: number; tipo?: "total" | "resultado" | "ajuste"; aliq?: number }

/** Memória de cálculo em duas colunas: a nota de hoje e a mesma base recalculada no ano. */
function Memoria({ m, compras, ano }: { m: DadosMemoria; compras: boolean; ano: number }) {
  const v = (k: string) => m[k] ?? 0
  const atuais = TRIBUTOS.filter((t) => t.id !== "ibs" && t.id !== "cbs")
  /** Fecha a conta: se início + passos não chegar ao fim, a diferença vira uma linha de ajuste. */
  const fechar = (inicio: Passo, passos: Passo[], fim: Passo, nomeAjuste: string): Passo[] => {
    const soma = inicio.valor + passos.reduce((s, p) => s + p.valor, 0)
    const resto = fim.valor - soma
    return [inicio, ...passos, ...(Math.abs(resto) > 1 ? [{ nome: nomeAjuste, valor: resto, tipo: "ajuste" as const }] : []), fim]
  }

  // Hoje: valor da nota menos cada tributo = base sem tributos.
  const baseAr = v("valor_desonerado_ar") || v("valor_ar") - v("valor_impostos_ar")
  const ar = fechar(
    { nome: "Valor da nota (com tributos)", valor: v("valor_ar"), tipo: "total" },
    TRIBUTOS.filter((t) => Math.abs(v(`valor_${t.id}_ar`)) > 0.005).map((t) => ({ nome: `(−) ${t.nome}`, valor: -v(`valor_${t.id}_ar`), aliq: v(`aliq_${t.id}_ar`) })),
    { nome: "= Base sem tributos", valor: baseAr, tipo: "resultado" },
    "Outros e ajustes",
  )

  // Depois: base sem tributos atuais + o que resta deles + IBS + CBS = novo valor da nota.
  const baseDr = v("valor_desonerado_dr") || baseAr
  const dr = fechar(
    { nome: "Base sem tributos atuais", valor: baseDr, tipo: "total" },
    [
      ...atuais
        .filter((t) => Math.abs(v(`valor_${t.id}_dr`)) > 0.005)
        .map((t) => ({ nome: `(+) ${t.nome} que ainda resta`, valor: v(`valor_${t.id}_dr`), aliq: v(`aliq_${t.id}_dr`) })),
      { nome: "(+) IBS", valor: v("valor_ibs_dr"), aliq: v("aliq_ibs_dr") },
      { nome: "(+) CBS", valor: v("valor_cbs_dr"), aliq: v("aliq_cbs_dr") },
    ],
    { nome: `= Valor da nota em ${ano}`, valor: v("valor_dr"), tipo: "resultado" },
    compras ? "Outros e ajustes" : "Ajuste de preço do cenário",
  )

  const creditos = (l: "ar" | "dr"): Passo[] => {
    const linhas: Passo[] = TRIBUTOS.filter((t) => Math.abs(v(`credito_${t.id}_${l}`)) > 0.005).map((t) => ({ nome: `(−) Crédito de ${t.nome}`, valor: -v(`credito_${t.id}_${l}`) }))
    const total = -v(`credito_${l}`)
    const soma = linhas.reduce((s, p) => s + p.valor, 0)
    if (Math.abs(total - soma) > 1) linhas.push({ nome: "(−) Outros créditos", valor: total - soma, tipo: "ajuste" })
    return [{ nome: "Valor da nota", valor: v(`valor_${l}`), tipo: "total" }, ...linhas, { nome: "= Custo efetivo", valor: v(`custo_${l}`), tipo: "resultado" }]
  }
  const debitos = (l: "ar" | "dr"): Passo[] => {
    const linhas: Passo[] = TRIBUTOS.filter((t) => Math.abs(v(`debito_${t.id}_${l}`)) > 0.005).map((t) => ({ nome: t.nome, valor: v(`debito_${t.id}_${l}`) }))
    return [...linhas, { nome: "= Tributo devido na venda", valor: v(`debito_${l}`), tipo: "resultado" }]
  }

  return (
    <div className="memoria">
      <Coluna titulo="Hoje (AR)" passos={ar} />
      <Coluna titulo={`Depois (DR) · ${ano}`} passos={dr} destaque />
      {compras ? (
        <>
          <Coluna titulo="Custo hoje (AR)" passos={creditos("ar")} />
          <Coluna titulo={`Custo em ${ano} (DR)`} passos={creditos("dr")} destaque />
        </>
      ) : (
        <>
          <Coluna titulo="Tributo devido hoje (AR)" passos={debitos("ar")} />
          <Coluna titulo={`Tributo devido em ${ano} (DR)`} passos={debitos("dr")} destaque />
        </>
      )}
    </div>
  )
}

function Coluna({ titulo, passos, destaque = false }: { titulo: string; passos: Passo[]; destaque?: boolean }) {
  return (
    <div className={`memoria-coluna${destaque ? " destaque" : ""}`}>
      <h4>{titulo}</h4>
      {passos.map((p, i) => (
        <div key={i} className={`memoria-linha ${p.tipo ?? ""}`}>
          <span>
            {p.nome}
            {p.aliq ? <span className="memoria-aliq"> {fmtPct(p.aliq)}</span> : null}
          </span>
          <span className="num">{fmtBRL(p.valor)}</span>
        </div>
      ))}
    </div>
  )
}
