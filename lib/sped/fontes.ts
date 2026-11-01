/*
 * Fontes oficiais citadas nos achados. Só links oficiais (Planalto, Receita Federal). O trecho literal
 * fica vazio até ser copiado da fonte oficial: o painel não escreve texto de lei de memória.
 */

export type Fonte = { id: string; titulo: string; url: string; trecho?: string }

export const FONTES: Record<string, Fonte> = {
  lc214: { id: "lc214", titulo: "Lei Complementar 214/2025 (IBS, CBS e Imposto Seletivo)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm" },
  ec132: { id: "ec132", titulo: "Emenda Constitucional 132/2023 (Reforma Tributária)", url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm" },
  l10637: { id: "l10637", titulo: "Lei 10.637/2002 (PIS não cumulativo)", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm" },
  l10833: { id: "l10833", titulo: "Lei 10.833/2003 (COFINS não cumulativa)", url: "https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm" },
  l10147: { id: "l10147", titulo: "Lei 10.147/2000 (incidência monofásica: farmacêuticos, perfumaria e higiene)", url: "https://www.planalto.gov.br/ccivil_03/leis/l10147.htm" },
  l10485: { id: "l10485", titulo: "Lei 10.485/2002 (incidência monofásica: veículos e autopeças)", url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10485.htm" },
  l10925: { id: "l10925", titulo: "Lei 10.925/2004 (alíquota zero de insumos agropecuários e crédito presumido da agroindústria)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.925.htm" },
  l10865: { id: "l10865", titulo: "Lei 10.865/2004 (PIS/COFINS-Importação e casos de alíquota zero)", url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.865.htm" },
  l9718: { id: "l9718", titulo: "Lei 9.718/1998 (base de cálculo; combustíveis)", url: "https://www.planalto.gov.br/ccivil_03/leis/l9718compilada.htm" },
  lc87: { id: "lc87", titulo: "Lei Complementar 87/1996 (ICMS, Lei Kandir)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm" },
  ec87: { id: "ec87", titulo: "Emenda Constitucional 87/2015 (DIFAL para não contribuinte)", url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc87.htm" },
  lc190: { id: "lc190", titulo: "Lei Complementar 190/2022 (DIFAL)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp190.htm" },
  lc123: { id: "lc123", titulo: "Lei Complementar 123/2006 (Simples Nacional; crédito de ICMS no art. 23)", url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm" },
  dl288: { id: "dl288", titulo: "Decreto-Lei 288/1967 (Zona Franca de Manaus)", url: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del0288.htm" },
  sped: { id: "sped", titulo: "Portal SPED da Receita Federal (Guias Práticos da EFD ICMS/IPI e da EFD Contribuições)", url: "http://sped.rfb.gov.br/" },
}
