"use client"
/*
 * Auditor IVA: visões de ganho e perda da classificação CST / cClassTrib. Tudo é derivado da mesma
 * análise que a aba já recebe (resumo, pares, itens e fornecedores): nada de número novo inventado.
 */
import { ArrowDownRight, ArrowUpRight, CircleCheck, Lightbulb, Target, TrendingDown, TrendingUp } from "lucide-react"
import { SITUACOES, type AnaliseClassificacao, type ParDivergente } from "@/lib/classificacao"
import { fmtBRL, fmtBRLCurto, fmtCnpj, fmtInt, fmtPct, useLargura } from "./util"

const SENTIDO = { entrada: "Compra", saida: "Venda" } as const

export type Quadrantes = { ganhoVenda: number; ganhoCompra: number; perdaVenda: number; perdaCompra: number }

/** Separa ganho e perda por sentido (compra × venda) a partir dos pares estimados. */
export function quadrantes(pares: ParDivergente[]): Quadrantes {
  const q: Quadrantes = { ganhoVenda: 0, ganhoCompra: 0, perdaVenda: 0, perdaCompra: 0 }
  for (const p of pares) {
    const v = p.estimativa?.impacto ?? 0
    if (v > 0) p.sentido === "saida" ? (q.ganhoVenda += v) : (q.ganhoCompra += v)
    else if (v < 0) p.sentido === "saida" ? (q.perdaVenda -= v) : (q.perdaCompra -= v)
  }
  return q
}

function rotuloPar(p: ParDivergente) {
  return `${p.nota.codigo ?? "sem código"} → ${p.calculado.codigo ?? "sem código"}`
}

/** Placar: saldo líquido, balança perda × ganho e os quatro quadrantes. */
export function Placar({ a }: { a: AnaliseClassificacao }) {
  const r = a.resumo
  const q = quadrantes(a.pares)
  const liquido = r.ganho - r.perda
  const soma = r.ganho + r.perda
  const pctPerda = soma > 0 ? (r.perda / soma) * 100 : 50
  const classificados = r.porSituacao.conforme.valor + r.porSituacao.divergente.valor
  const acerto = classificados > 0 ? r.porSituacao.conforme.valor / classificados : null

  return (
    <section className="cartao iva-placar" aria-labelledby="iva-placar-titulo">
      <div className="iva-placar-topo">
        <div>
          <div className="rotulo" id="iva-placar-titulo">
            Saldo do Auditor IVA · {a.ano}
          </div>
          <div className={`iva-saldo ${liquido < 0 ? "perda" : liquido > 0 ? "ganho" : ""}`}>
            {liquido < 0 ? "▼ " : liquido > 0 ? "▲ " : ""}
            {fmtBRL(Math.abs(liquido))}
          </div>
          <p className="sub">
            {liquido < 0
              ? "As classificações das notas custam mais do que rendem: há tributo a recolher ou crédito a glosar acima do que se recupera."
              : liquido > 0
                ? "As classificações das notas deixam dinheiro na mesa: há tributo pago a mais ou crédito a recuperar acima do risco."
                : "Ganhos e perdas se compensam neste recorte."}
          </p>
        </div>
        <div className="iva-acerto" title="Valor dos itens com cClassTrib igual ao calculado, sobre o valor dos itens com cClassTrib na nota">
          <CircleCheck size={18} aria-hidden />
          <div>
            <div className="rotulo">Acerto de classificação</div>
            <strong>{acerto === null ? "—" : fmtPct(acerto)}</strong>
            <span className="sub"> do valor classificado</span>
          </div>
        </div>
      </div>

      <div className="iva-balanca" role="img" aria-label={`Perda potencial ${fmtBRL(r.perda)}, ganho potencial ${fmtBRL(r.ganho)}`}>
        <div className="iva-balanca-perda" style={{ width: `${pctPerda}%` }}>
          {pctPerda >= 14 && <span>Perda {fmtBRLCurto(r.perda)}</span>}
        </div>
        <div className="iva-balanca-ganho" style={{ width: `${100 - pctPerda}%` }}>
          {100 - pctPerda >= 14 && <span>Ganho {fmtBRLCurto(r.ganho)}</span>}
        </div>
      </div>

      <div className="iva-quadrantes">
        <Quadrante icone="ganho" titulo="Ganho em vendas" valor={q.ganhoVenda} nota="Tributo destacado a mais: recuperável e argumento de preço." />
        <Quadrante icone="ganho" titulo="Ganho em compras" valor={q.ganhoCompra} nota="Crédito de IBS/CBS que a nota deixou de dar." />
        <Quadrante icone="perda" titulo="Perda em vendas" valor={q.perdaVenda} nota="Tributo destacado a menor: a recolher, com risco de autuação." />
        <Quadrante icone="perda" titulo="Perda em compras" valor={q.perdaCompra} nota="Crédito tomado acima do correto: risco de glosa." />
      </div>

      <div className="iva-rodape">
        <span>
          <strong>{fmtInt(r.porSituacao.divergente.itens)}</strong> itens divergentes ({fmtBRL(r.porSituacao.divergente.valor)})
        </span>
        <span>
          <strong>{fmtInt(r.porSituacao.sem_nota.itens)}</strong> {SITUACOES.sem_nota.toLowerCase()} ({fmtBRL(r.porSituacao.sem_nota.valor)})
        </span>
        {r.naoEstimado.itens > 0 && (
          <span>
            <strong>{fmtInt(r.naoEstimado.itens)}</strong> divergentes com regra própria, sem estimativa em R$
          </span>
        )}
      </div>
    </section>
  )
}

function Quadrante({ icone, titulo, valor, nota }: { icone: "ganho" | "perda"; titulo: string; valor: number; nota: string }) {
  const Icone = icone === "ganho" ? ArrowUpRight : ArrowDownRight
  return (
    <div className={`iva-quadrante iva-${icone}`}>
      <div className="rotulo">
        <Icone size={16} aria-hidden /> {titulo}
      </div>
      <div className={`iva-quadrante-valor ${valor ? icone : ""}`}>{fmtBRL(valor)}</div>
      <p className="sub">{nota}</p>
    </div>
  )
}

const ALTURA = 240
const M = { topo: 24, dir: 12, base: 44, esq: 64 }

/** Cascata: dos ganhos às perdas, até o saldo líquido. */
export function Cascata({ a }: { a: AnaliseClassificacao }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const q = quadrantes(a.pares)
  const passos = [
    { rotulo: "Ganho vendas", delta: q.ganhoVenda },
    { rotulo: "Ganho compras", delta: q.ganhoCompra },
    { rotulo: "Perda vendas", delta: -q.perdaVenda },
    { rotulo: "Perda compras", delta: -q.perdaCompra },
  ]
  let corrente = 0
  const barras = passos.map((p) => {
    const de = corrente
    corrente += p.delta
    return { ...p, de, ate: corrente }
  })
  const liquido = corrente
  const valores = [0, ...barras.flatMap((b) => [b.de, b.ate])]
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const span = max - min || 1
  const w = Math.max(largura, 300)
  const iw = w - M.esq - M.dir
  const ih = ALTURA - M.topo - M.base
  const y = (v: number) => M.topo + ((max - v) / span) * ih
  const n = barras.length + 1
  const banda = iw / n
  const bw = Math.min(56, banda * 0.56)
  const xc = (i: number) => M.esq + banda * (i + 0.5)

  if (a.pares.every((p) => !p.estimativa)) return null

  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2>Do ganho à perda: a cascata do saldo</h2>
          <p className="sub">Como cada lado das divergências soma ou tira do resultado de IBS + CBS em {a.ano}.</p>
        </div>
      </div>
      <div className="grafico" ref={ref}>
        <svg height={ALTURA} role="img" aria-label={`Cascata: saldo líquido ${fmtBRL(liquido)}`}>
          <line x1={M.esq} x2={w - M.dir} y1={y(0)} y2={y(0)} stroke="var(--text-muted)" />
          <text x={M.esq - 8} y={y(0)} dy="0.32em" textAnchor="end" className="iva-eixo">
            {fmtBRLCurto(0)}
          </text>
          {barras.map((b, i) => {
            const topo = y(Math.max(b.de, b.ate))
            const alt = Math.max(1, Math.abs(y(b.de) - y(b.ate)))
            const cor = b.delta >= 0 ? "var(--div-ganho)" : "var(--div-perda)"
            return (
              <g key={b.rotulo}>
                {i > 0 && <line x1={xc(i - 1) + bw / 2} x2={xc(i) - bw / 2} y1={y(b.de)} y2={y(b.de)} stroke="var(--border)" strokeDasharray="3 3" />}
                <rect x={xc(i) - bw / 2} y={topo} width={bw} height={alt} rx={3} fill={cor} />
                <text x={xc(i)} y={topo - 6} textAnchor="middle" className="iva-valor-barra">
                  {b.delta >= 0 ? "+" : "−"}
                  {fmtBRLCurto(Math.abs(b.delta))}
                </text>
                <text x={xc(i)} y={ALTURA - M.base + 18} textAnchor="middle" className="iva-eixo">
                  {b.rotulo}
                </text>
              </g>
            )
          })}
          <g>
            <line x1={xc(n - 2) + bw / 2} x2={xc(n - 1) - bw / 2} y1={y(liquido)} y2={y(liquido)} stroke="var(--border)" strokeDasharray="3 3" />
            <rect
              x={xc(n - 1) - bw / 2}
              y={y(Math.max(0, liquido))}
              width={bw}
              height={Math.max(1, Math.abs(y(0) - y(liquido)))}
              rx={3}
              fill={liquido >= 0 ? "var(--div-ganho)" : "var(--div-perda)"}
              stroke="var(--text-primary)"
              strokeWidth={1.5}
            />
            <text x={xc(n - 1)} y={y(Math.max(0, liquido)) - 6} textAnchor="middle" className="iva-valor-barra" style={{ fontWeight: 700 }}>
              {liquido < 0 ? "−" : ""}
              {fmtBRLCurto(Math.abs(liquido))}
            </text>
            <text x={xc(n - 1)} y={ALTURA - M.base + 18} textAnchor="middle" className="iva-eixo" style={{ fontWeight: 600 }}>
              Saldo
            </text>
          </g>
        </svg>
      </div>
    </section>
  )
}

/** Os maiores ganhos e as maiores perdas, lado a lado, por par nota → calculado. */
export function Movimentos({ a }: { a: AnaliseClassificacao }) {
  const estimados = a.pares.filter((p) => p.estimativa && Math.abs(p.estimativa.impacto) >= 0.005)
  const ganhos = estimados.filter((p) => p.estimativa!.impacto > 0).sort((x, y) => y.estimativa!.impacto - x.estimativa!.impacto).slice(0, 6)
  const perdas = estimados.filter((p) => p.estimativa!.impacto < 0).sort((x, y) => x.estimativa!.impacto - y.estimativa!.impacto).slice(0, 6)
  const max = Math.max(1, ...[...ganhos, ...perdas].map((p) => Math.abs(p.estimativa!.impacto)))
  return (
    <div className="grade-2">
      <ListaMovimento titulo="Maiores perdas" tipo="perda" pares={perdas} max={max} vazio="Nenhuma perda estimada neste recorte." />
      <ListaMovimento titulo="Maiores ganhos" tipo="ganho" pares={ganhos} max={max} vazio="Nenhum ganho estimado neste recorte." />
    </div>
  )
}

function ListaMovimento({
  titulo,
  tipo,
  pares,
  max,
  vazio,
}: {
  titulo: string
  tipo: "ganho" | "perda"
  pares: ParDivergente[]
  max: number
  vazio: string
}) {
  const Icone = tipo === "ganho" ? TrendingUp : TrendingDown
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2 className="iva-titulo-icone">
            <Icone size={18} aria-hidden className={tipo} /> {titulo}
          </h2>
          <p className="sub">Por par de cClassTrib (nota → calculado). A barra compara com o maior movimento dos dois lados.</p>
        </div>
      </div>
      {pares.length === 0 ? (
        <div className="vazio">{vazio}</div>
      ) : (
        <ol className="iva-movimentos">
          {pares.map((p, i) => {
            const v = Math.abs(p.estimativa!.impacto)
            return (
              <li key={i} title={`${p.nota.nome ?? ""}\n→ ${p.calculado.nome ?? ""}`}>
                <div className="iva-mov-linha">
                  <span className="etiqueta">{SENTIDO[p.sentido]}</span>
                  <span className="codigo">{rotuloPar(p)}</span>
                  <span className={`iva-mov-valor ${tipo}`}>{fmtBRL(v)}</span>
                </div>
                <div className="iva-trilho">
                  <div className={`iva-barra iva-barra-${tipo}`} style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <div className="sub">
                  {fmtInt(p.itens)} itens · {fmtBRL(p.valor)} em notas · pela nota {fmtBRL(p.estimativa!.pelaNota)}, correto{" "}
                  {fmtBRL(p.estimativa!.correto)}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** Plano de ação: o que recuperar, o que corrigir e quem acionar, a partir dos rankings da análise. */
export function PlanoAcao({ a }: { a: AnaliseClassificacao }) {
  const r = a.resumo
  const recuperar = [...a.itens].filter((i) => i.ganho > 0).sort((x, y) => y.ganho - x.ganho).slice(0, 3)
  const corrigir = [...a.itens].filter((i) => i.perda > 0).sort((x, y) => y.perda - x.perda).slice(0, 3)
  const paresGanho = a.pares
    .filter((p) => (p.estimativa?.impacto ?? 0) > 0)
    .sort((x, y) => y.estimativa!.impacto - x.estimativa!.impacto)
    .slice(0, 3)
  const fornecedores = (a.fornecedores ?? []).filter((f) => f.perda > 0).sort((x, y) => y.perda - x.perda).slice(0, 3)
  return (
    <section className="cartao">
      <div className="cabeca">
        <div>
          <h2 className="iva-titulo-icone">
            <Target size={18} aria-hidden /> Plano de ação
          </h2>
          <p className="sub">Por onde começar, ordenado pelo dinheiro em jogo em {a.ano}.</p>
        </div>
      </div>
      <div className="iva-plano">
        <Passo n={1} titulo="Corrigir o que gera perda" valor={r.perda} tipo="perda">
          {corrigir.length ? (
            corrigir.map((i, k) => (
              <li key={k}>
                <span className="texto">{i.descricao ?? "—"}</span> <span className="perda">{fmtBRL(i.perda)}</span>
              </li>
            ))
          ) : (
            <li className="sub">Nenhum item com perda.</li>
          )}
        </Passo>
        <Passo n={2} titulo="Recuperar o que foi pago a mais" valor={r.ganho} tipo="ganho">
          {recuperar.length ? (
            recuperar.map((i, k) => (
              <li key={k}>
                <span className="texto">{i.descricao ?? "—"}</span> <span className="ganho">{fmtBRL(i.ganho)}</span>
              </li>
            ))
          ) : paresGanho.length ? (
            paresGanho.map((p, k) => (
              <li key={k}>
                <span className="texto">
                  {SENTIDO[p.sentido]} <span className="codigo">{rotuloPar(p)}</span> · {fmtInt(p.itens)} itens
                </span>{" "}
                <span className="ganho">{fmtBRL(p.estimativa!.impacto)}</span>
              </li>
            ))
          ) : (
            <li className="sub">Nenhum ganho estimado.</li>
          )}
        </Passo>
        <Passo n={3} titulo="Acionar fornecedores" valor={fornecedores.reduce((s, f) => s + f.perda, 0)} tipo="perda">
          {a.fornecedores === null ? (
            <li className="sub">Escolha “Todas” ou “Compras” em Notas para ver os fornecedores.</li>
          ) : fornecedores.length ? (
            fornecedores.map((f, k) => (
              <li key={k}>
                <span className="texto">{f.razaoSocial ?? (f.cnpj ? fmtCnpj(f.cnpj) : "—")}</span> <span className="perda">{fmtBRL(f.perda)}</span>
              </li>
            ))
          ) : (
            <li className="sub">Nenhum fornecedor com perda.</li>
          )}
        </Passo>
        <Passo n={4} titulo="Completar o cClassTrib nas notas" valor={r.porSituacao.sem_nota.valor} tipo="neutro" rotuloValor="em notas sem código">
          <li className="sub">
            {fmtInt(r.porSituacao.sem_nota.itens)} itens sem cClassTrib ficam fora da comparação. Enquanto não vierem classificados, o
            ganho e a perda deles não aparecem aqui.
          </li>
        </Passo>
      </div>
      <p className="sub iva-dica">
        <Lightbulb size={14} aria-hidden /> Estimativas para priorizar a revisão, não um parecer. A metodologia está no fim da página.
      </p>
    </section>
  )
}

function Passo({
  n,
  titulo,
  valor,
  tipo,
  rotuloValor,
  children,
}: {
  n: number
  titulo: string
  valor: number
  tipo: "ganho" | "perda" | "neutro"
  rotuloValor?: string
  children: React.ReactNode
}) {
  return (
    <div className={`iva-passo iva-${tipo}`}>
      <div className="iva-passo-n" aria-hidden>
        {n}
      </div>
      <div>
        <h3>{titulo}</h3>
        <div className={`iva-passo-valor ${tipo !== "neutro" && valor ? tipo : ""}`}>
          {fmtBRL(valor)} {rotuloValor && <span className="sub">{rotuloValor}</span>}
        </div>
        <ul>{children}</ul>
      </div>
    </div>
  )
}

export type Ordem = "perda" | "ganho" | "saldo"

export function SeletorOrdem({ ordem, onOrdem }: { ordem: Ordem; onOrdem: (o: Ordem) => void }) {
  return (
    <div className="segmentos" role="group" aria-label="Ordenar por">
      {(["perda", "ganho", "saldo"] as const).map((o) => (
        <button key={o} aria-pressed={ordem === o} onClick={() => onOrdem(o)}>
          {o === "perda" ? "Perdas" : o === "ganho" ? "Ganhos" : "Saldo"}
        </button>
      ))}
    </div>
  )
}

export function ordenar<T extends { perda: number; ganho: number }>(lista: T[], ordem: Ordem): T[] {
  const chave = (x: T) => (ordem === "perda" ? x.perda : ordem === "ganho" ? x.ganho : Math.abs(x.ganho - x.perda))
  return [...lista].sort((x, y) => chave(y) - chave(x))
}

/** Barra de saldo dentro de uma célula: perda à esquerda do zero, ganho à direita. */
export function BarraSaldo({ perda, ganho, max }: { perda: number; ganho: number; max: number }) {
  const s = ganho - perda
  const pct = max > 0 ? Math.min(50, (Math.abs(s) / max) * 50) : 0
  return (
    <span className="iva-saldo-celula">
      <span className="iva-saldo-trilho" aria-hidden>
        <span className={`iva-barra iva-barra-${s < 0 ? "perda" : "ganho"}`} style={s < 0 ? { right: "50%", width: `${pct}%` } : { left: "50%", width: `${pct}%` }} />
      </span>
      <span className={s < 0 ? "perda" : s > 0 ? "ganho" : undefined}>
        {s < 0 ? "▼ " : s > 0 ? "▲ " : ""}
        {fmtBRL(Math.abs(s))}
      </span>
    </span>
  )
}
