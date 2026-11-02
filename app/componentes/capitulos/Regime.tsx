"use client"
/*
 * Melhor regime tributário: a mesma DRE (trilha da API + premissas de IRPJ e CSLL) montada em cada
 * regime que o cálculo simulou, lado a lado, ano a ano. Não há número novo: é a DRE de cada regime.
 */
import { AlertTriangle, Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import type { CalculoDetalhe } from "@pricetax/sdk"
import type { Trilha } from "@/lib/capitulos"
import { REGIMES } from "@/lib/catalogo"
import { acharLinha, colunas, montarDre, type PremissasIr } from "@/lib/demonstrativos"
import { Erro } from "../comum"
import { buscarMemo, fmtBRL, fmtPct, useProgresso } from "../util"
import { FormPremissas, usePremissasIr } from "./Dre"
import { Alternar, Bloco, Capitulo, Carregando, LinhasAno, Premissa } from "./ui"

const COR_REGIME: Record<string, string> = {
  lucroReal: "var(--pt-amarelo)",
  lucroPresumido: "var(--pt-preto)",
  simplesNacional: "var(--pt-cinza-medio)",
}
/** Limites de receita bruta anual: LC 123/2006, art. 3º, II (Simples) e Lei 9.718/1998, art. 13 (Presumido). */
const LIMITE: Record<string, { valor: number; fonte: string; url: string }> = {
  simplesNacional: { valor: 4_800_000, fonte: "LC 123/2006, art. 3º, II", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm#art3" },
  lucroPresumido: { valor: 78_000_000, fonte: "Lei 9.718/1998, art. 13", url: "https://www.planalto.gov.br/ccivil_03/leis/l9718compilada.htm#art13" },
}

type Resultado = {
  regime: string
  /** Por coluna: [hoje, ...anos]. */
  faturamento: number[]
  tributosConsumo: number[]
  lucroBruto: number[]
  ir: (number | null)[]
  lucroLiquido: number[]
  carga: (number | null)[]
}

function resultado(t: Trilha, regime: string, rotulo: string, p: PremissasIr): Resultado {
  const cen = t.cenarios.find((c) => c.rotulo === rotulo) ?? t.cenarios[0]
  const pr = { ...p, regime }
  const dre = montarDre(t, cen.id, pr)
  const linha = (id: string) => acharLinha(dre, id)?.valores ?? []
  const cols = colunas(t, cen.id)
  const v = (s: Record<string, number>, k: string) => s[k] ?? 0
  const faturamento = cols.map((c) => v(c.vendas, "valor"))
  const tributosConsumo = cols.map((c) => v(c.vendas, "debito") - v(c.compras, "credito"))
  const lb = linha("lb").map((x) => x ?? 0)
  const rl = linha("rl").map((x) => x ?? 0)
  const simples = regime === "simplesNacional"
  const despesas = rl.map((r) => (p.despesas.modo === "percentual" ? (p.despesas.valor / 100) * r : p.despesas.valor))
  const irpj = linha("irpj")
  const csll = linha("csll")
  const ir = cols.map((_, i) => (simples ? null : -((irpj[i] ?? 0) + (csll[i] ?? 0))))
  const lucroLiquido = simples ? lb.map((x, i) => x - despesas[i]) : linha("ll").map((x) => x ?? 0)
  const carga = cols.map((_, i) => (faturamento[i] ? (tributosConsumo[i] + (ir[i] ?? 0)) / faturamento[i] : null))
  return { regime, faturamento, tributosConsumo, lucroBruto: lb, ir, lucroLiquido, carga }
}

/** Carrega a trilha de cada regime em sequência (a API limita as chamadas por minuto). */
function useTrilhas(calculoId: string, regimes: string[], semEstimados: boolean) {
  const [trilhas, setTrilhas] = useState<Record<string, Trilha>>({})
  const [erro, setErro] = useState<unknown>(null)
  const chave = `${calculoId}|${regimes.join(",")}|${semEstimados}`
  useEffect(() => {
    const ctl = new AbortController()
    setTrilhas({})
    setErro(null)
    ;(async () => {
      for (const r of regimes) {
        try {
          const t = await buscarMemo<Trilha>(`/api/calculos/${calculoId}/capitulos/trilha`, { regime: r, semEstimados }, ctl.signal)
          if (ctl.signal.aborted) return
          setTrilhas((x) => ({ ...x, [r]: t }))
        } catch (e) {
          if (!ctl.signal.aborted) setErro(e)
          return
        }
      }
    })()
    return () => ctl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return { trilhas, erro }
}

export function MelhorRegime({ calculo, ano, semEstimados }: { calculo: CalculoDetalhe; ano: number; semEstimados: boolean }) {
  const regimes = calculo.regimes
  const { trilhas, erro } = useTrilhas(calculo.id, regimes, semEstimados)
  const atual = calculo.regime_tributario && regimes.includes(calculo.regime_tributario) ? calculo.regime_tributario : regimes[0]
  const [premissas, mudarPremissas] = usePremissasIr(calculo.id, atual, calculo.periodo_meses)
  const [rotulo, setRotulo] = useState<string | null>(null)
  const [anualizar, setAnualizar] = useState(true)

  if (regimes.length < 2) {
    return (
      <div className="cartao aviso">
        Este cálculo simulou só um regime ({REGIMES[regimes[0]] ?? regimes[0]}). Para comparar, refaça o cálculo no app da PriceTax com os outros
        regimes marcados.
      </div>
    )
  }
  if (erro) return <Erro erro={erro} />
  const prontos = regimes.filter((r) => trilhas[r])
  if (prontos.length < regimes.length) {
    return <CarregandoRegimes calculoId={calculo.id} regimes={regimes} prontos={prontos.length} semEstimados={semEstimados} />
  }

  const base = trilhas[regimes[0]]
  const anos = base.anos
  const rotulos = [...new Set(base.cenarios.map((c) => c.rotulo))]
  const cen = rotulo && rotulos.includes(rotulo as never) ? rotulo : rotulos.includes("Com Reajuste") ? "Com Reajuste" : rotulos[0]
  const meses = calculo.periodo_meses && calculo.periodo_meses > 0 ? calculo.periodo_meses : null
  const fator = anualizar && meses ? 12 / meses : 1
  const res = regimes.map((r) => resultado(trilhas[r], r, cen, premissas))
  const iAno = Math.max(0, anos.indexOf(ano)) + 1
  const anoVisto = anos[iAno - 1]
  const doAtual = res.find((r) => r.regime === atual)!
  // Trava de faturamento: regime cujo limite anual a empresa passa não pode ser recomendado.
  const faturamentoAnual = (doAtual.faturamento[0] ?? 0) * (meses ? 12 / meses : 1)
  const elegivel = (r: string) => !(LIMITE[r] && faturamentoAnual > LIMITE[r].valor)
  const candidatos = res.filter((r) => elegivel(r.regime))
  const ordem = [...(candidatos.length ? candidatos : res)].sort((a, b) => b.lucroLiquido[iAno] - a.lucroLiquido[iAno])
  const melhor = ordem[0]
  const ganhoTroca = (melhor.lucroLiquido[iAno] - doAtual.lucroLiquido[iAno]) * fator
  const nome = (r: string) => REGIMES[r] ?? r
  const vencedorPorAno = anos.map((_, k) => [...ordem].sort((a, b) => b.lucroLiquido[k + 1] - a.lucroLiquido[k + 1])[0].regime)

  const linhas: { rot: string; valor: (r: Resultado) => number | null; pct?: boolean; melhorMaior?: boolean; dica?: string }[] = [
    { rot: "Faturamento (valor das notas)", valor: (r) => r.faturamento[iAno] * fator },
    { rot: "Tributos sobre consumo (débitos − créditos)", valor: (r) => r.tributosConsumo[iAno] * fator, melhorMaior: false },
    { rot: "Lucro bruto", valor: (r) => r.lucroBruto[iAno] * fator, melhorMaior: true },
    { rot: "IRPJ + CSLL", valor: (r) => (r.ir[iAno] === null ? null : r.ir[iAno]! * fator), melhorMaior: false, dica: "No Simples, dentro do DAS" },
    { rot: "Lucro líquido", valor: (r) => r.lucroLiquido[iAno] * fator, melhorMaior: true },
    { rot: "Carga total sobre o faturamento", valor: (r) => r.carga[iAno], pct: true, melhorMaior: false },
  ]

  return (
    <Capitulo numero="06" icone={Trophy} titulo={`Melhor regime tributário · ${anoVisto}`} sub="A DRE de cada regime simulado, lado a lado, com as mesmas premissas.">
      <Bloco titulo="Recomendação">
        <div className="rg-destaque">
          <div>
            <span className="rg-rotulo">Melhor regime em {anoVisto}</span>
            <strong className="rg-nome">{nome(melhor.regime)}</strong>
            <span className="sub">
              Lucro líquido de {fmtBRL(melhor.lucroLiquido[iAno] * fator)} {anualizar && meses ? "por ano" : `no período (${meses ?? "?"} meses)`}, cenário {cen}.
            </span>
          </div>
          <div className="rg-comparacao">
            {melhor.regime === atual ? (
              <span>
                O regime atual (<b>{nome(atual)}</b>) já é o melhor em {anoVisto}
                {ordem[1] ? (
                  <>
                    . Diferença para o 2º colocado ({nome(ordem[1].regime)}):{" "}
                    <b className="oport">{fmtBRL((melhor.lucroLiquido[iAno] - ordem[1].lucroLiquido[iAno]) * fator)}</b>.
                  </>
                ) : (
                  ": os outros regimes simulados não são permitidos pelo faturamento."
                )}
              </span>
            ) : (
              <span>
                Trocar <b>{nome(atual)}</b> (atual) por <b>{nome(melhor.regime)}</b> melhora o lucro líquido em{" "}
                <b className="oport">{fmtBRL(ganhoTroca)}</b> {anualizar && meses ? "por ano" : "no período"}.
              </span>
            )}
          </div>
        </div>
        {Object.entries(LIMITE)
          .filter(([r, l]) => regimes.includes(r) && faturamentoAnual > l.valor)
          .map(([r, l]) => (
            <p key={r} className="aviso rg-aviso">
              <AlertTriangle size={14} aria-hidden /> O faturamento anualizado ({fmtBRL(faturamentoAnual)}) passa do limite de {fmtBRL(l.valor)} do{" "}
              {nome(r)} (
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.fonte}
              </a>
              ): a empresa não pode optar por ele. Ele fica fora da recomendação, mesmo que o lucro pareça maior.
            </p>
          ))}
      </Bloco>

      <Bloco titulo="Premissas da comparação" leitura="As mesmas despesas valem para todos os regimes. A atividade só muda a presunção do Lucro Presumido.">
        <FormPremissas p={{ ...premissas, regime: regimes.includes("lucroPresumido") ? "lucroPresumido" : premissas.regime }} mudar={mudarPremissas} />
        {premissas.despesas.valor === 0 && regimes.includes("lucroReal") && (
          <p className="aviso rg-aviso">
            <AlertTriangle size={14} aria-hidden /> As despesas operacionais estão em zero. Sem elas, o Lucro Real paga IRPJ e CSLL sobre todo o lucro
            bruto e tende a parecer pior do que é. Informe as despesas do cliente antes de concluir.
          </p>
        )}
        <div className="rg-controles">
          <Alternar opcoes={Object.fromEntries(rotulos.map((r) => [r, r]))} valor={cen} onChange={(x) => setRotulo(x)} />
          {meses && (
            <div className="segmentos" role="group" aria-label="Período">
              <button aria-pressed={!anualizar} onClick={() => setAnualizar(false)}>
                Período do cálculo ({meses} meses)
              </button>
              <button aria-pressed={anualizar} onClick={() => setAnualizar(true)}>
                12 meses
              </button>
            </div>
          )}
        </div>
      </Bloco>

      <Bloco titulo={`Lado a lado em ${anoVisto}`} leitura="Em destaque, o melhor valor de cada linha. Tributos e carga: menor é melhor.">
        <div className="tabela-rolagem" tabIndex={0}>
          <table className="rg-tabela">
            <thead>
              <tr>
                <th scope="col">Linha</th>
                {res.map((r) => (
                  <th key={r.regime} scope="col" className="num">
                    {nome(r.regime)}
                    {r.regime === atual && <span className="etiqueta"> atual</span>}
                    {r.regime === melhor.regime && <span className="etiqueta rg-selo"> melhor</span>}
                    {!elegivel(r.regime) && <span className="etiqueta rg-inelegivel" title={`Faturamento anual acima do limite de ${fmtBRL(LIMITE[r.regime].valor)}`}> não permitido</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const vs = res.map((r) => l.valor(r))
                const validos = res.filter((r) => elegivel(r.regime) || !candidatos.length).map((r) => l.valor(r)).filter((x): x is number => x !== null)
                const alvo = l.melhorMaior === undefined ? null : l.melhorMaior ? Math.max(...validos) : Math.min(...validos)
                return (
                  <tr key={l.rot} className={l.rot === "Lucro líquido" ? "rg-total" : undefined}>
                    <th scope="row">{l.rot}</th>
                    {vs.map((x, i) => (
                      <td key={i} className={`num${alvo !== null && x === alvo && (elegivel(res[i].regime) || !candidatos.length) ? " rg-melhor" : ""}${elegivel(res[i].regime) ? "" : " rg-fora"}`}>
                        {x === null ? <span className="iva-sem">{l.dica ?? "—"}</span> : l.pct ? fmtPct(x) : fmtBRL(x)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Bloco titulo="Quem vence a cada ano" leitura="O melhor regime pode mudar ao longo da transição, conforme o IBS e a CBS substituem os tributos atuais.">
        <ol className="rg-anos">
          {anos.map((a, k) => (
            <li key={a} className={a === anoVisto ? "rg-ano-atual" : undefined}>
              <span className="rg-ano">{a}</span>
              <span className="rg-chip" style={{ borderColor: COR_REGIME[vencedorPorAno[k]] }}>
                {nome(vencedorPorAno[k])}
              </span>
            </li>
          ))}
        </ol>
        <LinhasAno
          anos={anos}
          ar={doAtual.lucroLiquido[0] * fator}
          rotuloAr={`Hoje no ${nome(atual)}`}
          series={res.map((r) => ({ nome: nome(r.regime), cor: COR_REGIME[r.regime] ?? "var(--text-secondary)", valores: r.lucroLiquido.slice(1).map((x) => x * fator) }))}
        />
      </Bloco>

      <Premissa>
        Compara a DRE de cada regime simulado pela PriceTax: tributos sobre consumo (ICMS, ISS, IPI, PIS/COFINS, IBS e CBS) vêm do cálculo; IRPJ e
        CSLL pelas alíquotas gerais (15% + 10% de adicional e 9%), sobre o lucro (Real) ou a base presumida (Presumido), com as despesas que você
        informar. No Simples Nacional, IRPJ e CSLL estão dentro do DAS: o lucro líquido do Simples é o lucro bruto menos as despesas, e o DAS vem da
        simulação do Simples no cálculo. Não entram: folha e encargos (INSS patronal, que pesa diferente em cada regime), JCP, incentivos de IRPJ,
        compensação de prejuízos, fator R e sublimites do Simples. É uma estimativa para orientar a decisão, não um parecer.
      </Premissa>
    </Capitulo>
  )
}

function CarregandoRegimes({ calculoId, regimes, prontos, semEstimados }: { calculoId: string; regimes: string[]; prontos: number; semEstimados: boolean }) {
  const atual = regimes[prontos]
  const progresso = useProgresso(`/api/calculos/${calculoId}/capitulos/trilha`, atual ? { regime: atual, semEstimados } : null)
  return (
    <Carregando
      mensagem={`Montando a DRE de cada regime: ${REGIMES[atual] ?? atual} (${prontos + 1} de ${regimes.length})…`}
      indicadores={3}
      progresso={progresso}
    />
  )
}
