"use client"
import type { ResumoEstimado } from "@/lib/estimados-calculo"
import { fmtBRL, fmtInt } from "../util"

const NOMES = { ipi: "IPI", icms: "ICMS" } as const

/**
 * IPI e ICMS ESTIMADOS: não vieram destacados no documento do fornecedor ou do cliente. A Pricetax
 * extraiu da cadeia o quanto do tributo estava embutido no preço. Este aviso diz quanto é e se o
 * efeito está dentro ou fora dos números da tela (chave no topo do painel).
 */
export function AvisoEstimados({ resumo, excluidos, lado }: { resumo: ResumoEstimado; excluidos: boolean; lado: "compras" | "vendas" }) {
  const tem = (["ipi", "icms"] as const).filter((t) => resumo[t].linhas > 0)
  if (!tem.length) return <p className="cap-nota">Nenhum IPI ou ICMS estimado nas {lado} deste ano: todos os valores vieram dos documentos.</p>
  return (
    <div className={`cap-estimados${excluidos ? " fora" : ""}`}>
      <div className="cap-estimados-cabeca">
        <span className="cap-selo-est">ESTIMADO</span>
        <b>{excluidos ? "Sem o efeito dos tributos estimados na cadeia" : "Inclui tributos estimados na cadeia"}</b>
      </div>
      <div className="cap-estimados-valores">
        {tem.map((t) => (
          <span key={t}>
            <b>{NOMES[t]} estimado</b>: {fmtBRL(resumo[t].valorAr)} hoje
            {resumo[t].valorDr > 0.005 ? `, ${fmtBRL(resumo[t].valorDr)} no ano` : ""} · {fmtInt(resumo[t].linhas)} linhas
            {resumo[t].creditoAr > 0.005 ? ` · crédito de ${fmtBRL(resumo[t].creditoAr)} hoje` : ""}
          </span>
        ))}
      </div>
      <p className="cap-nota">
        Estes valores não vieram no documento do {lado === "compras" ? "fornecedor" : "cliente"}: a Pricetax estimou o tributo embutido no preço ao longo
        da cadeia.{" "}
        {excluidos
          ? "Agora eles estão fora: o tributo estimado voltou a ser preço, e IBS, CBS e créditos foram recalculados na proporção de cada linha (aproximação)."
          : "Nas tabelas, o IPI e o ICMS incluem esses valores. Para ver sem eles, use a chave “Tributos estimados” no topo do painel."}
      </p>
    </div>
  )
}

/** Versão curta para a ficha de um fornecedor, cliente ou item. */
export function EstimadosFicha({ e }: { e: { ipiAr: number; ipiDr: number; icmsAr: number; icmsDr: number; excluidos: boolean } }) {
  const partes = [
    e.ipiAr > 0.005 || e.ipiDr > 0.005 ? `IPI ${fmtBRL(e.ipiAr)} hoje${e.ipiDr > 0.005 ? ` e ${fmtBRL(e.ipiDr)} no ano` : ""}` : null,
    e.icmsAr > 0.005 || e.icmsDr > 0.005 ? `ICMS ${fmtBRL(e.icmsAr)} hoje${e.icmsDr > 0.005 ? ` e ${fmtBRL(e.icmsDr)} no ano` : ""}` : null,
  ].filter(Boolean)
  if (!partes.length) return null
  return (
    <p className={`cap-estimados-curto${e.excluidos ? " fora" : ""}`}>
      <span className="cap-selo-est">ESTIMADO</span> {partes.join(" · ")} estimados na cadeia (não vieram no documento).{" "}
      {e.excluidos ? "Fora dos números abaixo." : "Incluídos nos números abaixo."}
    </p>
  )
}

type PorAno = { ano: number; compras: ResumoEstimado; vendas: ResumoEstimado }

/** Na DRE e no fluxo: o estimado de cada ano, para saber quanto dos números vem da cadeia. */
export function EstimadosAnos({ anos, excluidos }: { anos: PorAno[]; excluidos: boolean }) {
  const linhas = (["compras", "vendas"] as const).flatMap((lado) =>
    (["ipi", "icms"] as const)
      .filter((t) => anos.some((a) => a[lado][t].linhas > 0))
      .map((t) => ({ nome: `${NOMES[t]} estimado nas ${lado}`, hoje: anos[0]?.[lado][t].valorAr ?? 0, valores: anos.map((a) => a[lado][t].valorDr) })),
  )
  if (!linhas.length) return <p className="cap-nota">Nenhum IPI ou ICMS estimado na cadeia: todos os tributos vieram dos documentos.</p>
  return (
    <div className={`cap-estimados${excluidos ? " fora" : ""}`}>
      <div className="cap-estimados-cabeca">
        <span className="cap-selo-est">ESTIMADO</span>
        <b>{excluidos ? "Sem o efeito dos tributos estimados na cadeia" : "Os números incluem tributos estimados na cadeia"}</b>
      </div>
      <div className="tabela-rolagem">
        <table className="cap-tabela">
          <thead>
            <tr>
              <th />
              <th className="num">Hoje (AR)</th>
              {anos.map((a) => (
                <th key={a.ano} className="num">
                  {a.ano}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome}>
                <td>{l.nome}</td>
                <td className="num">{fmtBRL(l.hoje)}</td>
                {l.valores.map((v, i) => (
                  <td key={i} className="num">
                    {fmtBRL(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        Valores que não vieram nos documentos: a Pricetax estimou o tributo embutido no preço ao longo da cadeia.{" "}
        {excluidos
          ? "Estão fora da DRE e do fluxo: o tributo estimado voltou a ser preço (aproximação, medida no cenário Ajustado/Com Reajuste e aplicada a todos)."
          : "Estão dentro das deduções, dos custos e dos tributos recolhidos. Use a chave “Tributos estimados” no topo para ver sem eles."}
      </p>
    </div>
  )
}
