"use client"
import { Fragment, useEffect, useMemo, useState } from "react"
import { CCLASS, CST, fator } from "@/lib/cclass"
import {
  ATUAIS,
  baseCliente,
  nominais,
  precoLiquido,
  simular,
  type Atual,
  type Entrada,
  type Nota,
  type Precificacao,
  type RefNcm,
  type Tipo,
} from "@/lib/precificacao-calculo"
import { Erro } from "../comum"
import { api, fmtBRL, fmtInt, fmtPct, useBusca } from "../util"
import { PERFIS, Resumo, custo } from "./CustoCliente"
import { Alternar, Bloco, Capitulo, Diferenca, Indicador, LinhasAno, Premissa } from "./ui"

const TIPOS: Record<Tipo, string> = { produto: "Produto", servico: "Serviço", locacao: "Locação" }
const NOME_ATUAL: Record<Atual, string> = { icms: "ICMS", iss: "ISS", pis_cofins: "PIS/COFINS", ipi: "IPI" }
const MODOS = { margem: "Margem sobre o preço líquido (%)", markup: "Markup sobre o custo (%)", preco: "Preço líquido informado (R$)" }

/** O cClassTrib agrupado por CST, para o seletor. */
const CLASSES_POR_CST = Object.entries(CCLASS).reduce<Record<string, [string, string][]>>((acc, [codigo, c]) => {
  ;(acc[c.cst] ??= []).push([codigo, c.nome])
  return acc
}, {})

const digitos = (s: string) => s.replace(/\D/g, "")
const pct2 = (v: number) => Math.round(v * 10000) / 100

function padrao(d: Precificacao): Entrada {
  return {
    tipo: "produto",
    descricao: "",
    ncm: "",
    custo: 100,
    margemModo: "margem",
    margem: 30,
    ano: d.anos[0],
    hoje: nominais(d.media.ar),
    ipiZfm: false,
    cclass: "000001",
    cheias: cheiasDe(d),
    manual: { ibs: 0, cbs: 0 },
  }
}

function cheiasDe(d: Precificacao): Entrada["cheias"] {
  return Object.fromEntries(d.anos.map((a) => [String(a), { ibs: pct2(d.cheias[a]?.ibs ?? 0), cbs: pct2(d.cheias[a]?.cbs ?? 0) }]))
}

export function NovoProduto({ calculoId, regime }: { calculoId: string; regime: string }) {
  const { dados, erro } = useBusca(
    (s) => api<Precificacao>(`/api/calculos/${calculoId}/capitulos/precificacao`, { regime }, s),
    [calculoId, regime],
  )
  const chave = `pricetax-novo-produto:${calculoId}`
  const [e, setE] = useState<Entrada | null>(null)

  useEffect(() => {
    if (!dados) return
    let salvo: Partial<Entrada> = {}
    try {
      salvo = JSON.parse(localStorage.getItem(chave) ?? "{}")
    } catch {}
    const base = padrao(dados)
    const junto = { ...base, ...salvo }
    if (!dados.anos.includes(junto.ano)) junto.ano = base.ano
    setE(junto)
  }, [dados, chave])

  const mudar = (parcial: Partial<Entrada>) =>
    setE((atual) => {
      if (!atual) return atual
      const novo = { ...atual, ...parcial }
      try {
        localStorage.setItem(chave, JSON.stringify(novo))
      } catch {}
      return novo
    })

  if (erro) return <Erro erro={erro} />
  if (!dados || !e) return <div className="cartao vazio">Lendo as alíquotas das suas vendas, ano a ano…</div>
  return <Simulador d={dados} e={e} mudar={mudar} regime={regime} reiniciar={() => mudar(padrao(dados))} />
}

function Simulador({
  d,
  e,
  mudar,
  regime,
  reiniciar,
}: {
  d: Precificacao
  e: Entrada
  mudar: (p: Partial<Entrada>) => void
  regime: string
  reiniciar: () => void
}) {
  const ref = useMemo(() => d.ncms.find((r) => digitos(r.ncm) === digitos(e.ncm) && digitos(e.ncm).length >= 4), [d, e.ncm])
  const vizinhos = useMemo(() => {
    const pos = digitos(e.ncm).slice(0, 4)
    return ref || pos.length < 4 ? [] : d.ncms.filter((r) => digitos(r.ncm).startsWith(pos)).slice(0, 6)
  }, [d, e.ncm, ref])

  const hoje = simular(e, "ar")
  const nota = simular(e, e.ano)
  const porAno = d.anos.map((a) => simular(e, a))
  const pl = precoLiquido(e)

  const aplicarRef = (r: RefNcm) => mudar({ ncm: r.ncm, hoje: nominais(r.ar), cclass: r.classes[0]?.cclass ?? e.cclass })
  const mudarTipo = (tipo: Tipo) => {
    const hojeTipo =
      tipo === "produto" ? e.hoje : tipo === "servico" ? { ...e.hoje, icms: 0, ipi: 0 } : { ...e.hoje, icms: 0, iss: 0, ipi: 0 }
    mudar({ tipo, hoje: hojeTipo, ipiZfm: tipo === "produto" && e.ipiZfm })
  }

  return (
    <Capitulo
      numero="05"
      titulo="Novo produto · formação de preço"
      sub="Do valor líquido até a nota fiscal: margem, tributos de hoje, IBS e CBS, para um produto, serviço ou locação que ainda não está no histórico."
    >
      {regime === "simplesNacional" && (
        <p className="cap-nota np-aviso">
          Regime simulado: Simples Nacional. Aqui a nota é montada pelo regime regular (tributos destacados); no Simples, os tributos atuais estão no DAS.
        </p>
      )}

      <Bloco titulo="1. O que você vai vender" leitura="Informe o NCM: se ele já aparece nas suas vendas, trazemos o cClassTrib que a Pricetax calculou e as alíquotas que você pratica hoje.">
        <div className="np-campos">
          <div className="np-rotulo">
            Tipo
            <Alternar opcoes={TIPOS} valor={e.tipo} onChange={mudarTipo} />
          </div>
          <label className="np-largo">
            Descrição
            <input value={e.descricao} placeholder="Ex.: válvula de controle 2 polegadas" onChange={(x) => mudar({ descricao: x.target.value })} />
          </label>
          <label>
            {e.tipo === "produto" ? "NCM" : "NCM / código (opcional)"}
            <input
              value={e.ncm}
              list="np-ncms"
              inputMode="numeric"
              placeholder="8 dígitos"
              onChange={(x) => {
                const valor = x.target.value
                const achado = d.ncms.find((r) => digitos(r.ncm) === digitos(valor) && digitos(valor).length >= 4)
                if (achado) aplicarRef(achado)
                else mudar({ ncm: valor })
              }}
            />
            <datalist id="np-ncms">
              {d.ncms.slice(0, 300).map((r) => (
                <option key={r.ncm} value={r.ncm}>
                  {fmtInt(r.itens)} itens vendidos
                </option>
              ))}
            </datalist>
          </label>
        </div>
        <Referencia e={e} ref_={ref} vizinhos={vizinhos} aplicar={aplicarRef} mudar={mudar} d={d} />
      </Bloco>

      <Bloco titulo="2. Custo e margem" leitura="O custo é o valor líquido, já sem os tributos que você recupera como crédito.">
        <div className="np-campos">
          <Numero rotulo="Custo líquido (R$)" valor={e.custo} passo={1} onChange={(v) => mudar({ custo: v })} />
          <label>
            Como formar o preço
            <select value={e.margemModo} onChange={(x) => mudar({ margemModo: x.target.value as Entrada["margemModo"] })}>
              {Object.entries(MODOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Numero rotulo={e.margemModo === "preco" ? "Preço líquido (R$)" : e.margemModo === "markup" ? "Markup (%)" : "Margem (%)"} valor={e.margem} passo={e.margemModo === "preco" ? 1 : 0.5} onChange={(v) => mudar({ margem: v })} />
          <label>
            Ano da nota
            <select value={e.ano} onChange={(x) => mudar({ ano: Number(x.target.value) })}>
              {d.anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="cap-nota">
          Preço líquido {fmtBRL(pl)} · margem de {pl > 0 ? fmtPct((pl - e.custo) / pl) : "n/d"} sobre o preço líquido · markup de{" "}
          {e.custo > 0 ? fmtPct((pl - e.custo) / e.custo) : "n/d"} sobre o custo.
        </p>
      </Bloco>

      <Bloco
        titulo="3. Tributos de hoje"
        leitura="Alíquotas nominais, como saem na nota hoje. ICMS, ISS e PIS/COFINS ficam dentro do preço; o IPI vai por fora. Nos anos seguintes elas seguem o cronograma da reforma."
      >
        <div className="np-campos">
          {ATUAIS.map((t) => (
            <Numero key={t} rotulo={`${NOME_ATUAL[t]} (%)`} valor={e.hoje[t]} passo={0.25} onChange={(v) => mudar({ hoje: { ...e.hoje, [t]: v } })} />
          ))}
          {e.tipo === "produto" && (
            <label className="np-check">
              <input type="checkbox" checked={e.ipiZfm} onChange={(x) => mudar({ ipiZfm: x.target.checked })} />
              Mantém IPI depois de 2027 (concorre com produto da Zona Franca)
            </label>
          )}
        </div>
        <div className="np-acoes">
          <button onClick={() => mudar({ hoje: nominais(d.media.ar) })}>Usar a média das suas vendas</button>
          {ref && <button onClick={() => mudar({ hoje: nominais(ref.ar) })}>Usar as do NCM {ref.ncm}</button>}
        </div>
        {e.tipo !== "produto" && (
          <p className="cap-nota">
            {e.tipo === "servico"
              ? "Serviço: sem ICMS e sem IPI. Informe o ISS do município (de 2% a 5%)."
              : "Locação de bens: sem ICMS, sem IPI e sem ISS (Súmula Vinculante 31); hoje só PIS e COFINS."}
          </p>
        )}
      </Bloco>

      <Bloco titulo="4. cClassTrib e benefício" leitura="A classificação define o CST do IBS e da CBS e a redução de alíquota. A alíquota cheia de cada ano vem das suas vendas no cálculo; dá para ajustar.">
        <Classificacao e={e} mudar={mudar} d={d} />
      </Bloco>

      <div className="cap-kpis">
        <Indicador rotulo="Preço líquido" valor={fmtBRL(pl)} contexto="custo + margem, sem tributos" />
        <Indicador rotulo="Nota hoje (AR)" valor={fmtBRL(hoje.vNF)} contexto={`tributos ${fmtPct(hoje.vNF ? (hoje.vNF - pl) / hoje.vNF : 0)} da nota`} />
        <Indicador rotulo={`Nota em ${e.ano}`} valor={fmtBRL(nota.vNF)} contexto={`tributos ${fmtPct(nota.vNF ? (nota.vNF - pl) / nota.vNF : 0)} da nota`} />
        <Indicador
          rotulo="Diferença na nota"
          valor={fmtBRL(nota.vNF - hoje.vNF)}
          contexto={<>{hoje.vNF ? fmtPct((nota.vNF - hoje.vNF) / hoje.vNF) : ""} para manter o mesmo preço líquido</>}
        />
      </div>

      <Bloco titulo={`Formação do preço · hoje × ${e.ano}`} leitura="O mesmo preço líquido, com os tributos de cada momento.">
        <div className="cc-colunas">
          <Formacao titulo="Hoje (AR)" n={hoje} e={e} />
          <Formacao titulo={`Em ${e.ano}`} n={nota} e={e} destaque />
        </div>
      </Bloco>

      <Bloco titulo={`Como a nota fiscal tem que sair em ${e.ano}`} leitura="Os campos do item na NF-e, com as tags do leiaute da reforma.">
        <CamposNota n={nota} e={e} />
      </Bloco>

      <Bloco titulo={`Custo para o seu cliente · hoje × ${e.ano}`} leitura="O que cada tipo de comprador paga de fato, depois dos créditos que aproveita. Clique num perfil para ver a conta.">
        <CustoPorPerfil base={baseCliente(hoje, nota)} ano={e.ano} />
      </Bloco>

      <Bloco titulo="Total da nota, ano a ano" leitura="O preço líquido fica igual; muda só o que vai para os tributos. A linha tracejada é a nota de hoje.">
        <LinhasAno anos={d.anos} ar={hoje.vNF} series={[{ nome: "Total da nota", cor: "var(--pt-amarelo)", valores: porAno.map((x) => x.vNF) }]} />
        <div className="tabela-rolagem">
          <table className="cap-tabela">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Tributos atuais</th>
                <th className="num">IBS</th>
                <th className="num">CBS</th>
                <th className="num">Total da nota</th>
                <th className="num">Contra hoje</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hoje (AR)</td>
                <td className="num">{fmtBRL(atuais(hoje))}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{fmtBRL(hoje.vNF)}</td>
                <td className="num">—</td>
              </tr>
              {porAno.map((x) => (
                <tr key={String(x.periodo)} className={x.periodo === e.ano ? "np-atual" : undefined}>
                  <td>{x.periodo}</td>
                  <td className="num">{fmtBRL(atuais(x))}</td>
                  <td className="num">{fmtBRL(x.valores.ibs)}</td>
                  <td className="num">{fmtBRL(x.valores.cbs)}</td>
                  <td className="num">{fmtBRL(x.vNF)}</td>
                  <td className="num">
                    <Diferenca valor={x.vNF - hoje.vNF} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      <div className="np-acoes">
        <button onClick={reiniciar}>Limpar a simulação</button>
      </div>

      <Premissa>
        Simulação a partir dos dados que você informa; nada é gravado na Pricetax (fica salvo só neste navegador). Alíquotas de referência: as das suas vendas no
        cálculo, medidas sobre o valor sem tributos. Tributos atuais pelo cronograma da EC 132/2023: PIS e COFINS extintos e IPI zerado em 2027 (fora a Zona Franca);
        ICMS e ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033. IBS e CBS por fora, sobre o preço líquido, com a redução do cClassTrib. Não considera
        ICMS-ST, DIFAL, Imposto Seletivo nem regimes específicos.
        {d.parcial ? " Parte dos NCMs ficou fora da leitura por limite de grupos." : ""}
      </Premissa>
    </Capitulo>
  )
}

const atuais = (n: Nota) => n.valores.icms + n.valores.iss + n.valores.pis_cofins + n.valores.ipi

function Numero({ rotulo, valor, passo, onChange }: { rotulo: string; valor: number; passo: number; onChange: (v: number) => void }) {
  return (
    <label>
      {rotulo}
      <input type="number" min={0} step={passo} value={valor} onChange={(x) => onChange(Math.max(0, Number(x.target.value) || 0))} />
    </label>
  )
}

function Referencia({
  e,
  ref_,
  vizinhos,
  aplicar,
  mudar,
  d,
}: {
  e: Entrada
  ref_: RefNcm | undefined
  vizinhos: RefNcm[]
  aplicar: (r: RefNcm) => void
  mudar: (p: Partial<Entrada>) => void
  d: Precificacao
}) {
  if (!digitos(e.ncm)) return <p className="cap-nota">Sem NCM: usamos a média das suas vendas como ponto de partida ({fmtInt(d.ncms.length)} NCMs no histórico).</p>
  if (ref_) {
    return (
      <div className="np-ref ok">
        <b>NCM {ref_.ncm} encontrado nas suas vendas</b> ({fmtInt(ref_.itens)} itens, {fmtBRL(ref_.valorAr)}). Trouxemos as alíquotas de hoje e o cClassTrib
        calculado pela Pricetax.
        {ref_.classes.length > 1 && (
          <span className="np-chips">
            Este NCM sai com mais de uma classificação:
            {ref_.classes.map((c) => (
              <button key={c.cclass} aria-pressed={e.cclass === c.cclass} onClick={() => mudar({ cclass: c.cclass })}>
                {c.cclass} · {fmtInt(c.itens)} itens
              </button>
            ))}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="np-ref">
      <b>NCM sem histórico neste cálculo.</b> A Pricetax ainda não classificou este item: escolha o cClassTrib no passo 4 (começa em tributação integral).
      {vizinhos.length > 0 && (
        <span className="np-chips">
          NCMs da mesma posição que você já vende:
          {vizinhos.map((r) => (
            <button key={r.ncm} onClick={() => aplicar(r)}>
              {r.ncm} · {r.classes[0]?.cclass ?? "sem cClassTrib"}
            </button>
          ))}
        </span>
      )}
    </div>
  )
}

function Classificacao({ e, mudar, d }: { e: Entrada; mudar: (p: Partial<Entrada>) => void; d: Precificacao }) {
  const c = CCLASS[e.cclass]
  const cst = c ? CST[c.cst] : undefined
  const fIbs = fator(e.cclass, "ibs")
  const fCbs = fator(e.cclass, "cbs")
  const beneficio = c && c.cst !== "000"
  const cheia = e.cheias[String(e.ano)] ?? { ibs: 0, cbs: 0 }
  const semDado = !d.cheias[e.ano]?.ibs && !d.cheias[e.ano]?.cbs
  return (
    <>
      <div className="np-campos">
        <label className="np-largo">
          cClassTrib
          <select value={e.cclass} onChange={(x) => mudar({ cclass: x.target.value })}>
            {Object.entries(CLASSES_POR_CST).map(([codigoCst, lista]) => (
              <optgroup key={codigoCst} label={`CST ${codigoCst} · ${CST[codigoCst]?.nome ?? ""}`}>
                {lista.map(([codigo, nome]) => (
                  <option key={codigo} value={codigo}>
                    {codigo} · {nome.length > 90 ? `${nome.slice(0, 90)}…` : nome}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className={`np-beneficio${beneficio ? " sim" : ""}`}>
        <span className="cap-kpi-rotulo">{beneficio ? "Benefício identificado" : "Sem benefício"}</span>
        <b>
          CST {c?.cst} · {cst?.nome}
        </b>
        <span>{c?.nome}</span>
        {fIbs !== null && fCbs !== null ? (
          <span>
            Redução de {fmtPct(1 - fIbs)} no IBS e {fmtPct(1 - fCbs)} na CBS: paga {fmtPct(fIbs)} e {fmtPct(fCbs)} da alíquota cheia.
          </span>
        ) : (
          <span>Este CST tem regra própria (alíquota fixa, diferimento, monofásica…): informe abaixo a alíquota efetiva.</span>
        )}
      </div>
      <div className="np-campos">
        <Numero
          rotulo={`IBS cheio ${e.ano} (%)`}
          valor={cheia.ibs}
          passo={0.05}
          onChange={(v) => mudar({ cheias: { ...e.cheias, [String(e.ano)]: { ...cheia, ibs: v } } })}
        />
        <Numero
          rotulo={`CBS cheia ${e.ano} (%)`}
          valor={cheia.cbs}
          passo={0.05}
          onChange={(v) => mudar({ cheias: { ...e.cheias, [String(e.ano)]: { ...cheia, cbs: v } } })}
        />
        {(fIbs === null || fCbs === null) && (
          <>
            <Numero rotulo="IBS efetivo (%)" valor={e.manual.ibs} passo={0.05} onChange={(v) => mudar({ manual: { ...e.manual, ibs: v } })} />
            <Numero rotulo="CBS efetiva (%)" valor={e.manual.cbs} passo={0.05} onChange={(v) => mudar({ manual: { ...e.manual, cbs: v } })} />
          </>
        )}
      </div>
      <p className="cap-nota">
        {semDado
          ? `Não há vendas tributadas em ${e.ano} no cálculo para medir a alíquota cheia: informe a do ano.`
          : "Alíquota cheia medida nas suas vendas tributadas do ano (tributo ÷ base, descontada a redução de cada classificação)."}{" "}
        <button className="np-link" onClick={() => mudar({ cheias: { ...e.cheias, [String(e.ano)]: { ibs: pct2(d.cheias[e.ano]?.ibs ?? 0), cbs: pct2(d.cheias[e.ano]?.cbs ?? 0) } } })}>
          Voltar ao valor do cálculo
        </button>
      </p>
    </>
  )
}

function Formacao({ titulo, n, e, destaque = false }: { titulo: string; n: Nota; e: Entrada; destaque?: boolean }) {
  const linha = (nome: string, valor: number, aliq?: number, classe?: string) =>
    Math.abs(valor) < 0.005 && !classe ? null : (
      <div className={`memoria-linha${classe ? ` ${classe}` : ""}`}>
        <span>
          {nome}
          {aliq ? <span className="memoria-aliq"> {fmtPct(aliq)}</span> : null}
        </span>
        <span className="num">{fmtBRL(valor)}</span>
      </div>
    )
  return (
    <div className={`memoria-coluna${destaque ? " destaque" : ""}`}>
      <h4>{titulo}</h4>
      {linha("Custo líquido", e.custo, undefined, "total")}
      {linha("(+) Margem", n.pl - e.custo)}
      {linha("= Preço líquido", n.pl, undefined, "total")}
      {linha("(+) ICMS por dentro", n.valores.icms, n.nominal.icms)}
      {linha("(+) ISS por dentro", n.valores.iss, n.nominal.iss)}
      {linha("(+) PIS/COFINS por dentro", n.valores.pis_cofins, n.nominal.pis_cofins)}
      {linha("= Valor do produto (vProd)", n.vProd, undefined, "total")}
      {linha("(+) IPI por fora", n.valores.ipi, n.nominal.ipi)}
      {linha("(+) IBS por fora", n.valores.ibs, n.efetiva.ibs)}
      {linha("(+) CBS por fora", n.valores.cbs, n.efetiva.cbs)}
      {linha("= Total da nota (vNF)", n.vNF, undefined, "resultado")}
      <div className="memoria-linha ajuste">
        <span>Tributos sobre o preço líquido</span>
        <span className="num">{n.pl ? fmtPct((n.vNF - n.pl) / n.pl) : "n/d"}</span>
      </div>
    </div>
  )
}

function CamposNota({ n, e }: { n: Nota; e: Entrada }) {
  const c = CCLASS[e.cclass]
  const red = (f: number | null) => (f === null ? "regra própria" : fmtPct(1 - f))
  const linhas: [string, string, string][] = [
    ["Valor do produto ou serviço", "vProd", fmtBRL(n.vProd)],
    ...(n.valores.icms > 0.005 ? ([["ICMS · base, alíquota e valor", "vBC · pICMS · vICMS", `${fmtBRL(n.vProd)} · ${fmtPct(n.nominal.icms)} · ${fmtBRL(n.valores.icms)}`]] as [string, string, string][]) : []),
    ...(n.valores.iss > 0.005 ? ([["ISS · base, alíquota e valor", "vBC · vAliq · vISSQN", `${fmtBRL(n.vProd)} · ${fmtPct(n.nominal.iss)} · ${fmtBRL(n.valores.iss)}`]] as [string, string, string][]) : []),
    ...(n.valores.pis_cofins > 0.005 ? ([["PIS/COFINS · alíquota e valor", "pPIS+pCOFINS · vPIS+vCOFINS", `${fmtPct(n.nominal.pis_cofins)} · ${fmtBRL(n.valores.pis_cofins)}`]] as [string, string, string][]) : []),
    ...(n.valores.ipi > 0.005 ? ([["IPI · alíquota e valor", "pIPI · vIPI", `${fmtPct(n.nominal.ipi)} · ${fmtBRL(n.valores.ipi)}`]] as [string, string, string][]) : []),
    ["CST do IBS e da CBS", "CST", c ? `${c.cst} · ${CST[c.cst]?.nome ?? ""}` : "—"],
    ["Classificação tributária", "cClassTrib", c ? `${e.cclass} · ${c.nome}` : e.cclass],
    ["Base de cálculo do IBS e da CBS", "vBC", fmtBRL(n.pl)],
    ["IBS · alíquota cheia (UF + município)", "pIBSUF + pIBSMun", n.cheia.ibs === null ? "—" : fmtPct(n.cheia.ibs)],
    ["IBS · redução e alíquota efetiva", "pRedAliq · pAliqEfet", `${red(n.fator.ibs)} · ${fmtPct(n.efetiva.ibs)}`],
    ["IBS · valor", "vIBS", fmtBRL(n.valores.ibs)],
    ["CBS · alíquota cheia", "pCBS", n.cheia.cbs === null ? "—" : fmtPct(n.cheia.cbs)],
    ["CBS · redução e alíquota efetiva", "pRedAliq · pAliqEfet", `${red(n.fator.cbs)} · ${fmtPct(n.efetiva.cbs)}`],
    ["CBS · valor", "vCBS", fmtBRL(n.valores.cbs)],
    ["Total da nota", "vNF", fmtBRL(n.vNF)],
  ]
  return (
    <div className="tabela-rolagem">
      <table className="cap-tabela np-nota">
        <thead>
          <tr>
            <th>Campo</th>
            <th>Tag na NF-e</th>
            <th className="num">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(([nome, tag, valor]) => (
            <tr key={nome} className={tag === "vNF" ? "np-total" : undefined}>
              <td>{nome}</td>
              <td>
                <code>{tag}</code>
              </td>
              <td className="num">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cap-nota">
        O IBS aparece somado (estado + município): o cálculo não separa as duas parcelas. Confira as tags com o leiaute vigente da NF-e ou da NFS-e.
      </p>
    </div>
  )
}

function CustoPorPerfil({ base, ano }: { base: Record<string, number>; ano: number }) {
  const [aberto, setAberto] = useState<string | null>(null)
  return (
    <div className="tabela-rolagem">
      <table className="cap-tabela cc-tabela">
        <thead>
          <tr>
            <th>Perfil do cliente</th>
            <th className="num">Custo hoje</th>
            <th className="num">Custo em {ano}</th>
            <th className="num">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {PERFIS.map((p, i) => {
            const ar = custo(base, "ar", p.ar)
            const dr = custo(base, "dr", p.dr)
            return (
              <Fragment key={p.id}>
                {(i === 0 || PERFIS[i - 1].grupo !== p.grupo) && (
                  <tr className="cc-grupo">
                    <td colSpan={4}>{p.grupo}</td>
                  </tr>
                )}
                <tr>
                  <td>
                    <button className="cap-dem-abrir" aria-expanded={aberto === p.id} onClick={() => setAberto((a) => (a === p.id ? null : p.id))}>
                      <span aria-hidden="true">{aberto === p.id ? "▾" : "▸"}</span> {p.nome}
                    </button>
                  </td>
                  <td className="num">{fmtBRL(ar.liquido)}</td>
                  <td className="num">{fmtBRL(dr.liquido)}</td>
                  <td className="num">
                    <Diferenca valor={dr.liquido - ar.liquido} />
                  </td>
                </tr>
                {aberto === p.id && (
                  <tr className="cc-detalhe">
                    <td colSpan={4}>
                      <div className="cc-colunas">
                        <Resumo titulo="Hoje (AR)" c={ar} explica={p.explica[0]} />
                        <Resumo titulo={`Em ${ano}`} c={dr} explica={p.explica[1]} transicao />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
