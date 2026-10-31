"use client"
import { Banknote, Calculator, PackagePlus, Receipt, Scale } from "lucide-react"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { CCLASS, CST, fator } from "@/lib/cclass"
import type { Classificacao, Opcao } from "@/lib/receita"
import {
  ATUAIS,
  baseCliente,
  nominais,
  precoLiquido,
  simular,
  type Atual,
  type Destino,
  type Entrada,
  type Metodo,
  type Nota,
  type Precificacao,
  type RefNcm,
  type Tipo,
} from "@/lib/precificacao-calculo"
import { Erro } from "../comum"
import { api, fmtBRL, fmtInt, fmtPct, useBusca } from "../util"
import { PERFIS, Resumo, custo } from "./CustoCliente"
import { Alternar, Bloco, Capitulo, Carregando, Diferenca, Indicador, LinhasAno, Premissa } from "./ui"

const TIPOS: Record<Tipo, string> = { produto: "Produto", servico: "Serviço", locacao: "Locação" }
const NOME_ATUAL: Record<Atual, string> = { icms: "ICMS", iss: "ISS", pis_cofins: "PIS/COFINS", ipi: "IPI" }
const DESTINOS: Record<Destino, string> = {
  revenda: "Contribuinte · revenda ou industrialização",
  consumo: "Contribuinte · uso, consumo ou ativo",
  final: "Consumidor final não contribuinte",
}
const METODOS: Record<Metodo, string> = { transicao: "Transição completa", novos: "Só os novos tributos" }
const MODOS = { margem: "Margem sobre o preço líquido (%)", markup: "Markup sobre o custo (%)", preco: "Preço líquido informado (R$)" }

/** O cClassTrib agrupado por CST, para o seletor. */
const CLASSES_POR_CST = Object.entries(CCLASS).reduce<Record<string, [string, string][]>>((acc, [codigo, c]) => {
  ;(acc[c.cst] ??= []).push([codigo, c.nome])
  return acc
}, {})

const digitos = (s: string) => s.replace(/\D/g, "")
/** Da opção da lista ("101011100 · Serviços de…") fica só o código; texto livre segue como está, para a busca. */
const nbsDe = (v: string) => (/^\d{9}\s·/.test(v) ? v.slice(0, 9) : v)
const pct2 = (v: number) => Math.round(v * 10000) / 100

function padrao(d: Precificacao): Entrada {
  return {
    tipo: "produto",
    descricao: "",
    ncm: "",
    nbs: "",
    metodo: "transicao",
    custo: 100,
    margemModo: "margem",
    margem: 30,
    despesas: 0,
    ano: d.anos[0],
    destino: "revenda",
    interestadual: false,
    hoje: nominais(d.media.ar),
    tema69: true,
    st: { ativo: d.media.ar.icms_st > 0, mva: 0, aliqDestino: 0 },
    difal: { ativo: false, aliqDestino: 0 },
    ipiZfm: false,
    cclass: "000001",
    cheias: cheiasDe(d),
    manual: { ibs: 0, cbs: 0 },
  }
}

function cheiasDe(d: Precificacao): Entrada["cheias"] {
  return Object.fromEntries(d.anos.map((a) => [String(a), { ibs: pct2(d.cheias[a]?.ibs ?? 0), cbs: pct2(d.cheias[a]?.cbs ?? 0) }]))
}

export function NovoProduto({ calculoId, regime, ano }: { calculoId: string; regime: string; ano: number }) {
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
    const junto: Entrada = { ...base, ...salvo, st: { ...base.st, ...salvo.st }, difal: { ...base.difal, ...salvo.difal }, hoje: { ...base.hoje, ...salvo.hoje } }
    if (!dados.anos.includes(junto.ano)) junto.ano = base.ano
    setE(junto)
  }, [dados, chave])

  // Trocar o ano no topo do painel leva a simulação junto (dá para mudar de novo aqui dentro).
  useEffect(() => {
    if (dados?.anos.includes(ano)) setE((atual) => (atual && atual.ano !== ano ? { ...atual, ano } : atual))
  }, [ano, dados])

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
  if (!dados || !e) return <Carregando mensagem="Lendo as alíquotas das suas vendas, ano a ano…" />
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

  // Classificação oficial (calculadora da Receita): NCM para produto, NBS para serviço e locação.
  const produto = e.tipo === "produto"
  const codigo = produto ? digitos(e.ncm) : digitos(e.nbs)
  const pronto = produto ? codigo.length === 8 : codigo.length === 9
  const oficial = useBusca(
    pronto ? (s) => api<Classificacao>(`/api/receita?tipo=${produto ? "ncm" : "nbs"}&codigo=${codigo}&ano=${e.ano}`, undefined, s) : null,
    [pronto, produto, codigo, e.ano],
  )
  const classif = oficial.dados && oficial.dados.codigo === codigo ? oficial.dados : null
  const listaNbs = useBusca(produto ? null : (s) => api<{ codigo: string; descricao: string }[]>(`/api/receita?tipo=nbs-lista&ano=${e.ano}`, undefined, s), [produto, e.ano])
  // Ao chegar a classificação de um código novo, já escolhe o cClassTrib. NCM: o benefício do anexo
  // com maior redução; sem benefício, o que a Pricetax calculou no histórico; senão, a regra geral.
  // NBS: só quando há uma classificação própria (com várias, cada uma depende da operação).
  const aplicado = useRef<string | null>(null)
  useEffect(() => {
    if (!classif) return
    const chaveCod = `${classif.tipo}:${classif.codigo}`
    if (aplicado.current === chaveCod) return
    aplicado.current = chaveCod
    const sugerido =
      classif.tipo === "ncm"
        ? (classif.especificas[0]?.cclass ?? ref?.classes[0]?.cclass ?? "000001")
        : classif.especificas.length === 1
          ? classif.especificas[0].cclass
          : "000001"
    if (sugerido !== e.cclass) mudar({ cclass: sugerido })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classif])

  const hoje = simular(e, "ar")
  const nota = simular(e, e.ano)
  const porAno = d.anos.map((a) => simular(e, a))
  const pl = precoLiquido(e)
  const liquido = pl + e.despesas

  const aplicarRef = (r: RefNcm) =>
    mudar({
      ncm: r.ncm,
      hoje: nominais(r.ar),
      cclass: r.classes[0]?.cclass ?? e.cclass,
      st: { ...e.st, ativo: e.st.ativo || r.ar.icms_st > 0 },
      difal: { ...e.difal, ativo: e.difal.ativo || r.ar.icms_difal > 0 },
      interestadual: e.interestadual || r.ar.icms_difal > 0,
    })
  const mudarTipo = (tipo: Tipo) => {
    const hojeTipo =
      tipo === "produto" ? e.hoje : tipo === "servico" ? { ...e.hoje, icms: 0, ipi: 0 } : { ...e.hoje, icms: 0, iss: 0, ipi: 0 }
    mudar({ tipo, hoje: hojeTipo, ipiZfm: tipo === "produto" && e.ipiZfm })
  }

  return (
    <Capitulo
      numero="05"
      icone={PackagePlus}
      titulo="Novo produto · formação de preço"
      sub="Do valor líquido até a nota fiscal: margem, tributos de hoje, IBS e CBS, para um produto, serviço ou locação que ainda não está no histórico."
    >
      {regime === "simplesNacional" && (
        <p className="cap-nota np-aviso">
          Regime simulado: Simples Nacional. Aqui a nota é montada pelo regime regular (tributos destacados); no Simples, os tributos atuais estão no DAS.
        </p>
      )}

      <Bloco
        titulo="1. O que você vai vender"
        leitura={
          produto
            ? "Informe o NCM: a calculadora oficial da Receita diz se ele tem redução (anexos da LC 214) e já escolhemos o cClassTrib. Se o NCM aparece nas suas vendas, trazemos também as alíquotas que você pratica hoje."
            : "Informe a NBS (código ou parte da descrição): a calculadora oficial da Receita traz as classificações do serviço e já escolhemos o cClassTrib. Sem redução específica, fica a regra geral."
        }
      >
        <div className="np-campos">
          <div className="np-rotulo">
            Tipo
            <Alternar opcoes={TIPOS} valor={e.tipo} onChange={mudarTipo} />
          </div>
          <label className="np-largo">
            Descrição
            <input value={e.descricao} placeholder="Ex.: válvula de controle 2 polegadas" onChange={(x) => mudar({ descricao: x.target.value })} />
          </label>
          {!produto && (
            <label className="np-largo">
              NBS
              <input value={e.nbs} list="np-nbs" placeholder="9 dígitos ou descrição" onChange={(x) => mudar({ nbs: nbsDe(x.target.value) })} />
              <datalist id="np-nbs">
                {(listaNbs.dados ?? []).map((n) => (
                  <option key={n.codigo} value={`${n.codigo} · ${n.descricao}`} />
                ))}
              </datalist>
            </label>
          )}
          {produto && (
          <label>
            NCM
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
          )}
        </div>
        <Oficial carregando={oficial.carregando} erro={pronto ? oficial.erro : null} c={classif} atual={e.cclass} escolher={(cclass) => mudar({ cclass })} />
        {produto && <Referencia e={e} ref_={ref} vizinhos={vizinhos} aplicar={aplicarRef} mudar={mudar} d={d} />}
      </Bloco>

      <Bloco titulo="2. Custo, margem e metodologia" leitura="O custo é o valor líquido, já sem os tributos que você recupera como crédito.">
        <div className="np-rotulo">
          Metodologia
          <Alternar opcoes={METODOS} valor={e.metodo} onChange={(metodo) => mudar({ metodo })} />
          <span className="cap-sub">
            {e.metodo === "transicao"
              ? "Do preço líquido, inclui os tributos atuais que ainda restam no ano (por dentro) e soma IBS e CBS por fora: a nota real da transição."
              : "Do preço líquido sem impostos, soma só IBS e CBS, sem desonerar nem incluir os tributos atuais. Os tributos de hoje servem só para comparar."}
          </span>
        </div>
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
          <Numero rotulo="Outras despesas na nota (R$)" valor={e.despesas} passo={1} onChange={(v) => mudar({ despesas: v })} />
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
          <b>Valor líquido {fmtBRL(liquido)}</b> (custo + margem + outras despesas: é a base do IBS e da CBS e o que a empresa recebe livre de tributos) ·
          preço líquido {fmtBRL(pl)} · margem de {pl > 0 ? fmtPct((pl - e.custo) / pl) : "n/d"} sobre o preço líquido · markup de{" "}
          {e.custo > 0 ? fmtPct((pl - e.custo) / e.custo) : "n/d"} sobre o custo.
        </p>
      </Bloco>

      <Bloco
        titulo="3. Operação e tributos de hoje"
        leitura={
          e.metodo === "transicao"
            ? "Para quem você vende define se o IPI entra na base do ICMS e se há DIFAL. As alíquotas são as de hoje; nos anos da reforma elas seguem o cronograma da EC 132."
            : "Na metodologia só dos novos tributos, estas alíquotas não entram no preço da reforma: servem só para montar a nota de hoje e comparar."
        }
      >
        {produto && (
          <div className="np-campos">
            <label className="np-largo">
              Destinatário
              <select value={e.destino} onChange={(x) => mudar({ destino: x.target.value as Destino })}>
                {Object.entries(DESTINOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="np-check">
              <input type="checkbox" checked={e.interestadual} onChange={(x) => mudar({ interestadual: x.target.checked })} />
              Venda interestadual
            </label>
          </div>
        )}
        <div className="np-campos">
          {produto && (
            <Numero
              rotulo={e.interestadual ? "ICMS interestadual (%)" : "ICMS da operação (%)"}
              valor={e.hoje.icms}
              passo={0.5}
              onChange={(v) => mudar({ hoje: { ...e.hoje, icms: v } })}
            />
          )}
          {e.tipo === "servico" && <Numero rotulo="ISS (%)" valor={e.hoje.iss} passo={0.5} onChange={(v) => mudar({ hoje: { ...e.hoje, iss: v } })} />}
          <Numero rotulo="PIS/COFINS (%)" valor={e.hoje.pis_cofins} passo={0.05} onChange={(v) => mudar({ hoje: { ...e.hoje, pis_cofins: v } })} />
          {produto && <Numero rotulo="IPI (%)" valor={e.hoje.ipi} passo={0.5} onChange={(v) => mudar({ hoje: { ...e.hoje, ipi: v } })} />}
          {produto && (
            <label className="np-check">
              <input type="checkbox" checked={e.tema69} onChange={(x) => mudar({ tema69: x.target.checked })} />
              ICMS fora da base do PIS e da COFINS (Tema 69)
            </label>
          )}
          {produto && (
            <label className="np-check">
              <input type="checkbox" checked={e.ipiZfm} onChange={(x) => mudar({ ipiZfm: x.target.checked })} />
              Mantém IPI depois de 2027 (concorre com a Zona Franca)
            </label>
          )}
        </div>
        <p className="cap-nota">
          PIS/COFINS: 9,25% no não cumulativo (Lucro Real) ou 3,65% no cumulativo (Lucro Presumido).
          {produto && e.destino !== "revenda" ? " Destinatário que não revende: o IPI entra na base do ICMS." : ""}
          {e.tipo === "servico" ? " Serviço: sem ICMS e sem IPI; ISS do município de 2% a 5%." : ""}
          {e.tipo === "locacao" ? " Locação de bens: sem ICMS, sem IPI e sem ISS (Súmula Vinculante 31)." : ""}
        </p>

        {produto && (
          <div className="np-especiais">
            <label className="np-check">
              <input type="checkbox" checked={e.st.ativo} onChange={(x) => mudar({ st: { ...e.st, ativo: x.target.checked } })} />
              <b>Produto com ICMS-ST</b>
              {ref && ref.ar.icms_st > 0 && <span className="np-selo">identificado nas suas vendas deste NCM</span>}
            </label>
            {e.st.ativo && (
              <div className="np-campos">
                <Numero rotulo="MVA original (%)" valor={e.st.mva} passo={1} onChange={(v) => mudar({ st: { ...e.st, mva: v } })} />
                <Numero rotulo="Alíquota interna do destino (%)" valor={e.st.aliqDestino} passo={0.5} onChange={(v) => mudar({ st: { ...e.st, aliqDestino: v } })} />
                <span className="cap-sub">
                  {e.interestadual
                    ? "Interestadual: a MVA é ajustada pela diferença entre a alíquota interestadual e a interna do destino."
                    : "Operação interna: MVA original."}{" "}
                  Inclua o FCP na alíquota do destino, se houver.
                </span>
              </div>
            )}
            <label className="np-check">
              <input
                type="checkbox"
                checked={e.difal.ativo}
                disabled={!e.interestadual || e.destino === "revenda"}
                onChange={(x) => mudar({ difal: { ...e.difal, ativo: x.target.checked } })}
              />
              <b>ICMS DIFAL</b>
              {ref && ref.ar.icms_difal > 0 && <span className="np-selo">identificado nas suas vendas deste NCM</span>}
              {(!e.interestadual || e.destino === "revenda") && <span className="cap-sub">só em venda interestadual a quem não revende</span>}
            </label>
            {e.difal.ativo && e.interestadual && e.destino !== "revenda" && (
              <div className="np-campos">
                <Numero rotulo="Alíquota interna do destino (%)" valor={e.difal.aliqDestino} passo={0.5} onChange={(v) => mudar({ difal: { ...e.difal, aliqDestino: v } })} />
                <span className="cap-sub">
                  {e.destino === "final"
                    ? "Não contribuinte: o remetente recolhe, base única (entra no seu preço)."
                    : "Contribuinte (uso e consumo): o destinatário recolhe, base dupla (custo do cliente, fora da nota)."}{" "}
                  Inclua o FCP, se houver.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="np-acoes">
          <button onClick={() => mudar({ hoje: nominais(d.media.ar) })}>Usar as alíquotas médias das suas vendas</button>
          {ref && <button onClick={() => mudar({ hoje: nominais(ref.ar) })}>Usar as do NCM {ref.ncm}</button>}
        </div>
      </Bloco>

      <Bloco titulo="4. cClassTrib e benefício" leitura="A classificação define o CST do IBS e da CBS e a redução de alíquota. A alíquota cheia de cada ano vem das suas vendas no cálculo; dá para ajustar.">
        <Classificacao e={e} mudar={mudar} d={d} />
      </Bloco>

      <div className="cap-kpis">
        <Indicador icone={Banknote} rotulo="Valor líquido" valor={fmtBRL(liquido)} contexto="o que a empresa recebe livre de tributos" />
        <Indicador icone={Receipt} rotulo="Cliente paga hoje (AR)" valor={fmtBRL(hoje.total)} contexto={`tributos ${fmtPct(hoje.total ? (hoje.total - liquido) / hoje.total : 0)} do total`} />
        <Indicador icone={Calculator} rotulo={`Cliente paga em ${e.ano}`} valor={fmtBRL(nota.total)} contexto={`tributos ${fmtPct(nota.total ? (nota.total - liquido) / nota.total : 0)} do total`} />
        <Indicador
          icone={Scale}
          rotulo="Diferença para o cliente"
          valor={fmtBRL(nota.total - hoje.total)}
          contexto={<>{hoje.total ? fmtPct((nota.total - hoje.total) / hoje.total) : ""} para manter o mesmo valor líquido</>}
        />
      </div>

      <Bloco titulo={`Formação do preço · hoje × ${e.ano}`} leitura="O mesmo valor líquido, com a base de cada tributo e o gross-up de quem vai por dentro. Ao lado de cada tributo, a alíquota e a base.">
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

      <Bloco titulo="Total pago pelo cliente, ano a ano" leitura="O valor líquido fica igual; muda só o que vai para os tributos. A linha tracejada é o total de hoje.">
        <LinhasAno anos={d.anos} ar={hoje.total} series={[{ nome: "Total pago pelo cliente", cor: "var(--pt-amarelo)", valores: porAno.map((x) => x.total) }]} />
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="cap-tabela">
            <thead>
              <tr>
                <th>Ano</th>
                <th className="num">Tributos atuais</th>
                <th className="num">IBS</th>
                <th className="num">CBS</th>
                <th className="num">Total pago</th>
                <th className="num">Contra hoje</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hoje (AR)</td>
                <td className="num">{fmtBRL(atuais(hoje))}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{fmtBRL(hoje.total)}</td>
                <td className="num">—</td>
              </tr>
              {porAno.map((x) => (
                <tr key={String(x.periodo)} className={x.periodo === e.ano ? "np-atual" : undefined}>
                  <td>{x.periodo}</td>
                  <td className="num">{fmtBRL(atuais(x))}</td>
                  <td className="num">{fmtBRL(x.valores.ibs)}</td>
                  <td className="num">{fmtBRL(x.valores.cbs)}</td>
                  <td className="num">{fmtBRL(x.total)}</td>
                  <td className="num">
                    <Diferenca valor={x.total - hoje.total} />
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
        Metodologia: {e.metodo === "transicao" ? "transição completa (tributos atuais que restam + IBS e CBS)" : "só os novos tributos (valor líquido + IBS e CBS)"}.
        Bases: IBS e CBS sobre o valor líquido (custo + margem + outras despesas); ICMS sobre o valor da operação + IBS + CBS (+ IPI para quem não
        revende), com gross-up do próprio ICMS; ISS da mesma forma, com gross-up do ISS; PIS/COFINS de hoje sobre a receita (sem o ICMS, se marcado o
        Tema 69); IPI sobre o valor da operação; ICMS-ST e DIFAL só quando informados. Cronograma da EC 132/2023: PIS e COFINS extintos e IPI zerado em
        2027 (fora a Zona Franca); ICMS e ISS a 90%, 80%, 70% e 60% de 2029 a 2032 e extintos em 2033. Classificação pela calculadora oficial da Receita;
        a escolha final do cClassTrib é sua. Não considera Imposto Seletivo nem regimes específicos. Nada é gravado na Pricetax (fica só neste navegador).
        {d.parcial ? " Parte dos NCMs ficou fora da leitura por limite de grupos." : ""}
      </Premissa>
    </Capitulo>
  )
}

/** ICMS, ST, DIFAL do remetente, ISS, PIS/COFINS e IPI: o que ainda é tributo atual na nota. */
const atuais = (n: Nota) =>
  n.valores.icms + n.valores.icms_st + (n.difalPagoPor === "remetente" ? n.valores.icms_difal : 0) + n.valores.iss + n.valores.pis_cofins + n.valores.ipi

function Numero({ rotulo, valor, passo, onChange }: { rotulo: string; valor: number; passo: number; onChange: (v: number) => void }) {
  return (
    <label>
      {rotulo}
      <input type="number" min={0} step={passo} value={valor} onChange={(x) => onChange(Math.max(0, Number(x.target.value) || 0))} />
    </label>
  )
}

function Oficial({
  carregando,
  erro,
  c,
  atual,
  escolher,
}: {
  carregando: boolean
  erro: unknown
  c: Classificacao | null
  atual: string
  escolher: (cclass: string) => void
}) {
  if (erro) return <Erro erro={erro} />
  if (!c) return carregando ? <p className="cap-nota">Consultando a calculadora oficial da Receita…</p> : null
  const chip = (o: Opcao) => (
    <button key={o.cclass} aria-pressed={atual === o.cclass} onClick={() => escolher(o.cclass)} title={o.nome}>
      {o.cclass} · {o.nome.length > 60 ? `${o.nome.slice(0, 60)}…` : o.nome}
      {o.reducaoCbs || o.reducaoIbs ? ` · −${o.reducaoCbs === o.reducaoIbs ? o.reducaoCbs : `${o.reducaoIbs}/${o.reducaoCbs}`}%` : ""}
    </button>
  )
  return (
    <div className={`np-ref${c.especificas.length ? " ok" : ""}`}>
      <b>
        {c.tipo === "ncm" ? "NCM" : "NBS"} {c.codigo}
      </b>{" "}
      · {c.descricao}
      <span className="np-chips">
        {c.especificas.length ? (c.tipo === "ncm" ? "Redução pelo NCM (anexos da LC 214):" : "Classificações próprias desta NBS:") : "Sem redução vinculada a este código:"}
        {c.especificas.map(chip)}
        {chip({ cclass: "000001", cst: "000", nome: "Regra geral (tributação integral)", reducaoCbs: 0, reducaoIbs: 0 })}
      </span>
      {c.gerais.length > 0 && (
        <details className="np-gerais">
          <summary>Outras {c.gerais.length} reduções que dependem de quem presta ou da operação</summary>
          <span className="np-chips">{c.gerais.map(chip)}</span>
        </details>
      )}
      <span className="cap-sub">
        Fonte: {c.fonte}.{" "}
        {c.especificas.length > 1
          ? c.tipo === "ncm"
            ? "Mais de uma opção: sugerimos a de maior redução; escolha a que corresponde à operação."
            : "Mais de uma opção: ficou a regra geral até você escolher a que corresponde à operação."
          : ""}
      </span>
    </div>
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
        <b>NCM {ref_.ncm} encontrado nas suas vendas</b> ({fmtInt(ref_.itens)} itens, {fmtBRL(ref_.valorAr)}). Trouxemos as alíquotas que você pratica hoje e, se a
        Receita não indicar redução, o cClassTrib calculado pela Pricetax.
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
      <b>NCM sem histórico neste cálculo.</b> As alíquotas de hoje partem da média das suas vendas; ajuste no passo 3.
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
  const linha = (nome: string, valor: number, detalhe?: string, classe?: string) =>
    Math.abs(valor) < 0.005 && !classe ? null : (
      <div key={nome} className={`memoria-linha${classe ? ` ${classe}` : ""}`}>
        <span>
          {nome}
          {detalhe ? <span className="memoria-aliq"> {detalhe}</span> : null}
        </span>
        <span className="num">{fmtBRL(valor)}</span>
      </div>
    )
  const sobre = (aliq: number, base: number) => `${fmtPct(aliq)} × ${fmtBRL(base)}`
  const v = n.valores
  return (
    <div className={`memoria-coluna${destaque ? " destaque" : ""}`}>
      <h4>{titulo}</h4>
      {linha("Custo líquido", e.custo)}
      {linha("(+) Margem", n.precoLiquido - e.custo)}
      {linha("(+) Outras despesas (frete, seguro…)", n.despesas)}
      {linha("= Valor líquido", n.liquido, n.periodo === "ar" ? undefined : "base do IBS e da CBS", "total")}
      {linha("(+) IBS", v.ibs, n.periodo === "ar" ? undefined : sobre(n.efetiva.ibs, n.bases.ibsCbs))}
      {linha("(+) CBS", v.cbs, n.periodo === "ar" ? undefined : sobre(n.efetiva.cbs, n.bases.ibsCbs))}
      {linha("(+) ICMS por dentro (gross-up)", v.icms, sobre(n.aliq.icms, n.bases.icms))}
      {linha("(+) ISS por dentro (gross-up)", v.iss, sobre(n.aliq.iss, n.bases.iss))}
      {linha("(+) PIS/COFINS", v.pis_cofins, sobre(n.aliq.pisCofins, n.bases.pisCofins))}
      {n.difalPagoPor === "remetente" && linha("(+) DIFAL pago por você", v.icms_difal, sobre(n.aliq.difalDestino - n.aliq.icms, n.bases.difal))}
      {linha("(+) IPI", v.ipi, sobre(n.aliq.ipi, n.bases.ipi))}
      {linha("(+) ICMS-ST", v.icms_st, `${fmtPct(n.aliq.stDestino)} × ${fmtBRL(n.bases.st)} (MVA ${fmtPct(n.aliq.mva)}) − ICMS próprio`)}
      {linha("= Total pago pelo cliente", n.total, undefined, "resultado")}
      {n.difalPagoPor === "destinatario" && linha("DIFAL pago pelo cliente (fora da nota)", v.icms_difal, sobre(n.aliq.difalDestino, n.bases.difal), "ajuste")}
      <div className="memoria-linha ajuste">
        <span>Tributos sobre o valor líquido</span>
        <span className="num">{n.liquido ? fmtPct((n.total - n.liquido) / n.liquido) : "n/d"}</span>
      </div>
    </div>
  )
}

function CamposNota({ n, e }: { n: Nota; e: Entrada }) {
  const c = CCLASS[e.cclass]
  const red = (f: number | null) => (f === null ? "regra própria" : fmtPct(1 - f))
  const v = n.valores
  const trio = (base: number, aliq: number, valor: number) => `${fmtBRL(base)} · ${fmtPct(aliq)} · ${fmtBRL(valor)}`
  const linhas: [string, string, string][] = [
    [e.tipo === "produto" ? "Valor do produto (com ICMS dentro)" : "Valor do serviço (com ISS dentro)", "vProd", fmtBRL(n.vProd)],
  ]
  const se = (cond: boolean, l: [string, string, string]) => cond && linhas.push(l)
  se(n.despesas > 0.005, ["Frete, seguro e outras despesas", "vFrete + vSeg + vOutro", fmtBRL(n.despesas)])
  se(v.icms > 0.005, ["ICMS · base, alíquota e valor", "vBC · pICMS · vICMS", trio(n.bases.icms, n.aliq.icms, v.icms)])
  se(v.icms_st > 0.005, ["ICMS-ST · base, MVA, alíquota e valor", "vBCST · pMVAST · pICMSST · vICMSST", `${fmtBRL(n.bases.st)} · ${fmtPct(n.aliq.mva)} · ${fmtPct(n.aliq.stDestino)} · ${fmtBRL(v.icms_st)}`])
  se(n.difalPagoPor === "remetente", ["DIFAL · base, alíquotas e valor", "vBCUFDest · pICMSUFDest · pICMSInter · vICMSUFDest", `${fmtBRL(n.bases.difal)} · ${fmtPct(n.aliq.difalDestino)} · ${fmtPct(n.aliq.icms)} · ${fmtBRL(v.icms_difal)}`])
  se(v.iss > 0.005, ["ISS · base, alíquota e valor", "vBC · vAliq · vISSQN", trio(n.bases.iss, n.aliq.iss, v.iss)])
  se(v.pis_cofins > 0.005, ["PIS/COFINS · base, alíquota e valor", "vBC · pPIS+pCOFINS · vPIS+vCOFINS", trio(n.bases.pisCofins, n.aliq.pisCofins, v.pis_cofins)])
  se(v.ipi > 0.005, ["IPI · base, alíquota e valor", "vBC · pIPI · vIPI", trio(n.bases.ipi, n.aliq.ipi, v.ipi)])
  linhas.push(
    ["CST do IBS e da CBS", "CST", c ? `${c.cst} · ${CST[c.cst]?.nome ?? ""}` : "—"],
    ["Classificação tributária", "cClassTrib", c ? `${e.cclass} · ${c.nome}` : e.cclass],
    ["Base do IBS e da CBS (valor líquido)", "vBC", fmtBRL(n.bases.ibsCbs)],
    ["IBS · alíquota cheia (UF + município)", "pIBSUF + pIBSMun", n.cheia.ibs === null ? "—" : fmtPct(n.cheia.ibs)],
    ["IBS · redução e alíquota efetiva", "pRedAliq · pAliqEfet", `${red(n.fator.ibs)} · ${fmtPct(n.efetiva.ibs)}`],
    ["IBS · valor", "vIBS", fmtBRL(v.ibs)],
    ["CBS · alíquota cheia", "pCBS", n.cheia.cbs === null ? "—" : fmtPct(n.cheia.cbs)],
    ["CBS · redução e alíquota efetiva", "pRedAliq · pAliqEfet", `${red(n.fator.cbs)} · ${fmtPct(n.efetiva.cbs)}`],
    ["CBS · valor", "vCBS", fmtBRL(v.cbs)],
    ["Total pago pelo cliente (produto + despesas + IPI + ST + IBS + CBS)", "vNF", fmtBRL(n.total)],
  )
  return (
    <div className="tabela-rolagem" tabIndex={0}>
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
        O IBS aparece somado (estado + município): o cálculo não separa as duas parcelas.
        {n.difalPagoPor === "destinatario" ? ` DIFAL de ${fmtBRL(v.icms_difal)} recolhido pelo destinatário, fora da nota.` : ""} Confira as tags com o leiaute
        vigente da NF-e ou da NFS-e.
      </p>
    </div>
  )
}

function CustoPorPerfil({ base, ano }: { base: Record<string, number>; ano: number }) {
  const [aberto, setAberto] = useState<string | null>(null)
  return (
    <div className="tabela-rolagem" tabIndex={0}>
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
