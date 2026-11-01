import { fmtCnpj, fmtMes, moeda, pctTexto, rotuloCrit, type Achado, type Resultado } from "./analise"
import { FONTES } from "./fontes"

/*
 * Dossiê da auditoria em um único HTML, que abre em qualquer navegador e sem internet: veredito,
 * etapas 1 a 4, o micro (documento a documento, com busca), ajustes e legislação. Os dados vão
 * embutidos em JSON; o HTML desenha tabelas, filtros e gráficos com JavaScript simples.
 */

export type EntradaDossie = {
  resultado: Resultado
  cruzamento?: { achados: Achado[]; resumo: Record<string, number> }
  logo?: string // data URL do logo da PriceTax
  geradoEm: string
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export function gerarDossie(e: EntradaDossie): string {
  const r = e.resultado
  const achados = [...r.achados, ...(e.cruzamento?.achados ?? [])]
  const contagem = { alta: 0, media: 0, baixa: 0, info: 0, ok: 0 }
  for (const a of achados) contagem[a.criticidade]++
  const fontesUsadas = [...new Set(achados.flatMap((a) => a.fontes ?? []))].map((id) => FONTES[id]).filter(Boolean)
  const dados = {
    resultado: { ...r, achados: undefined },
    achados,
    cruzamento: e.cruzamento?.resumo ?? null,
    fontes: fontesUsadas,
    nomesCrit: { alta: "Alta", media: "Média", baixa: "Baixa", info: "Informativo", ok: "OK" },
  }
  const json = JSON.stringify(dados).replace(/</g, "\\u003c")
  const titulo = `Dossiê de auditoria · ${r.empresa.nome || "empresa"}`
  const veredito =
    contagem.alta > 0
      ? `${contagem.alta} ponto(s) crítico(s) pedem ação antes da análise`
      : contagem.media > 0
        ? "Base utilizável, com pontos de atenção"
        : "Base completa e consistente para a análise"
  const pendencias = r.pendencias.length

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(titulo)}</title>
<style>
:root{--amarelo:#ffd700;--preto:#1a1a1a;--fundo:#f4f4f5;--sup:#fff;--sup2:#f4f4f5;--borda:#e4e4e7;--texto:#09090b;--sec:#52525b;--mut:#5f5f68;--alta:#b42d2d;--media:#b26b00;--baixa:#1c5cab;--ok:#1c6b3a;--info:#52525b;--raio:16px}
@media (prefers-color-scheme:dark){:root{--fundo:#09090b;--sup:#141416;--sup2:#1f1f23;--borda:#2a2a2f;--texto:#fafafa;--sec:#d4d4d8;--mut:#a1a1aa;--alta:#f08a8a;--media:#f5b94d;--baixa:#86b6ef;--ok:#6fcf8f;--info:#a1a1aa}}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
header{background:var(--preto);color:#f5f5f5;border-bottom:3px solid var(--amarelo);padding:16px 28px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;position:sticky;top:0;z-index:5}
header img{height:30px}header .t{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#b8b8b8;font-weight:600}
header .emp{margin-left:auto;text-align:right;font-size:13px}header .emp b{display:block;font-size:15px;color:#fff}
nav{display:flex;gap:4px;overflow-x:auto;padding:12px 28px 0;border-bottom:1px solid var(--borda);background:var(--fundo);position:sticky;top:65px;z-index:4}
nav button{border:0;background:none;color:var(--sec);padding:10px 14px;border-bottom:3px solid transparent;font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
nav button[aria-current=true]{color:var(--texto);border-bottom-color:var(--amarelo)}
main{max-width:1280px;margin:0 auto;padding:24px 28px 64px;display:grid;gap:20px}
section{display:none;gap:20px}section.ativa{display:grid}
.card{background:var(--sup);border:1px solid var(--borda);border-radius:var(--raio);padding:20px 22px;box-shadow:0 1px 3px rgb(0 0 0/.06);min-width:0}
.card h2{margin:0 0 4px;font-size:17px;letter-spacing:-.01em}.card h3{margin:0;font-size:15px}
.hero{background:linear-gradient(135deg,#1a1a1a,#262626);color:#f5f5f5;border-left:6px solid var(--amarelo)}
.hero h1{margin:0;font-size:22px}.hero p{margin:6px 0 0;color:#cfcfcf}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}
.kpi{background:var(--sup);border:1px solid var(--borda);border-top:3px solid var(--amarelo);border-radius:14px;padding:14px 16px}
.kpi span{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--sec)}.kpi b{display:block;font-size:22px;margin-top:4px;letter-spacing:-.02em}
.sub{color:var(--mut);font-size:12.5px}
.selo{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.06em;padding:3px 9px;border-radius:999px;color:#fff}
.alta{background:var(--alta)}.media{background:var(--media)}.baixa{background:var(--baixa)}.ok{background:var(--ok)}.info{background:var(--info)}
.achado{border-left:5px solid var(--borda)}.achado.c-alta{border-left-color:var(--alta)}.achado.c-media{border-left-color:var(--media)}.achado.c-baixa{border-left-color:var(--baixa)}.achado.c-ok{border-left-color:var(--ok)}
.achado header{all:unset;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.achado .item{font-weight:800;color:var(--mut)}
.achado .acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
button.b{border:1px solid var(--borda);background:var(--sup);color:var(--texto);border-radius:10px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}
button.b:hover{border-color:var(--texto)}
.resolver{margin-top:10px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--amarelo) 14%,var(--sup));font-size:13px}
.barra{height:8px;border-radius:99px;background:var(--sup2);overflow:hidden;margin-top:6px}.barra i{display:block;height:100%;background:var(--amarelo)}
.rf{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--sec);margin-top:8px}
.tab{overflow:auto;max-height:520px;margin-top:12px;border:1px solid var(--borda);border-radius:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{padding:8px 10px;border-bottom:1px solid var(--borda);text-align:left;white-space:nowrap}
th{position:sticky;top:0;background:var(--sup2);font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--mut);cursor:pointer}
td.n{text-align:right;font-variant-numeric:tabular-nums}tr:hover td{background:color-mix(in srgb,var(--amarelo) 8%,var(--sup))}
td.longo{white-space:normal;min-width:260px}
.filtro{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}
.filtro input,.filtro select{border:1px solid var(--borda);background:var(--sup);color:var(--texto);border-radius:10px;padding:8px 10px;font:inherit;min-width:200px}
.check{display:grid;gap:8px}.check div{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--sup2)}
.check b.s{font-size:16px;line-height:1}.check .okk{color:var(--ok)}.check .nok{color:var(--alta)}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}
svg text{fill:var(--mut);font-size:11px}
.mapa td.c{text-align:center;font-weight:700}.mapa .s{color:var(--ok)}.mapa .n{color:var(--alta)}
pre.msg{white-space:pre-wrap;background:var(--sup2);border-radius:10px;padding:12px;font:12.5px/1.5 ui-monospace,monospace}
a{color:inherit}
@media print{nav,header{position:static}section{display:grid!important}.tab{max-height:none}}
@media (max-width:640px){main,nav,header{padding-left:16px;padding-right:16px}}
</style>
</head>
<body>
<header>
${e.logo ? `<img src="${e.logo}" alt="PriceTax" />` : "<b>PriceTax</b>"}
<span class="t">Dossiê de auditoria de entrada</span>
<div class="emp"><b>${esc(r.empresa.nome)}</b>${esc(fmtCnpj(r.empresa.cnpj))} · ${esc(r.empresa.regime)} · ${esc(fmtMes(r.periodo.inicio))} a ${esc(fmtMes(r.periodo.fim))}</div>
</header>
<nav id="abas"></nav>
<main>
<section id="s-veredito" class="ativa">
  <div class="card hero"><h1>${esc(veredito)}</h1><p>Gerado em ${esc(e.geradoEm)} · ${r.arquivos.length} arquivo(s) EFD · ${r.estabelecimentos.length} estabelecimento(s) · ${r.periodo.meses.length} mês(es)${e.cruzamento ? ` · cruzado com o relatório da Pricetax` : ""}</p></div>
  <div class="kpis">
    <div class="kpi"><span>Críticos</span><b style="color:var(--alta)">${contagem.alta}</b></div>
    <div class="kpi"><span>Atenção</span><b style="color:var(--media)">${contagem.media}</b></div>
    <div class="kpi"><span>Pendências de arquivos</span><b>${pendencias}</b></div>
    <div class="kpi"><span>Compras no período</span><b>${esc(moeda(r.base.compras))}</b><span class="sub">${esc(pctTexto(r.base.compras ? r.base.comprasReforma / r.base.compras : 0))} em CFOPs da reforma</span></div>
    <div class="kpi"><span>Vendas no período</span><b>${esc(moeda(r.base.vendas))}</b><span class="sub">${esc(pctTexto(r.base.vendas ? r.base.vendasReforma / r.base.vendas : 0))} em CFOPs da reforma</span></div>
  </div>
  <div class="grade">
    <div class="card"><h2>Achados por criticidade</h2><div id="g-crit"></div></div>
    <div class="card"><h2>Apuração mês a mês</h2><p class="sub">Imposto a recolher (barra) e saldo credor (linha) por imposto.</p><select id="g-imp" class="b"></select><div id="g-apur"></div></div>
  </div>
  <div class="card"><h2>O que pedir ao cliente</h2><p class="sub">Tudo o que depende do cliente, em uma lista pronta para enviar.</p><div id="pedidos"></div></div>
  <div class="card"><h2>Pontos críticos e de atenção</h2><div id="top"></div></div>
</section>
<section id="s-1"></section>
<section id="s-2"></section>
<section id="s-3"></section>
<section id="s-4"></section>
<section id="s-micro"><div class="card"><h2>Micro: documento a documento</h2><p class="sub">Todos os casos apontados, com chave, fornecedor/cliente e CFOP. Escolha o achado e busque por qualquer texto.</p>
  <div class="filtro"><select id="m-achado"></select><input id="m-busca" placeholder="Buscar chave, CNPJ, CFOP, NCM, nome…" /><select id="m-reforma"><option value="">Reforma: todos</option><option value="sim">Só CFOPs da reforma</option><option value="não">Só fora da reforma</option></select></div>
  <div id="m-tab"></div></div></section>
<section id="s-ajustes"><div class="card"><h2>Ajustes, estornos, outros créditos e outros débitos</h2><p class="sub">Todos os lançamentos de ajuste lidos nos EFDs (E111, E220, E311, E530, C197, M110, M220, M510, M620, F100), linha a linha.</p>
  <div class="filtro"><input id="a-busca" placeholder="Buscar código, descrição, competência…" /></div><div id="a-tab"></div></div></section>
<section id="s-leis"><div class="card"><h2>Legislação e fontes oficiais</h2><p class="sub">Somente fontes oficiais (Planalto e Receita Federal). O trecho literal fica no espaço abaixo de cada fonte; quando estiver vazio, abra o link oficial.</p><div id="leis"></div></div></section>
</main>
<script type="application/json" id="dados">${json}</script>
<script>
(function(){
var D=JSON.parse(document.getElementById('dados').textContent);
var R=D.resultado, A=D.achados;
var brl=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function fm(v,t){if(v===undefined||v===null||v==='')return '';if(t==='moeda')return brl.format(+v||0);if(t==='pct')return ((+v||0)*100).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';if(t==='num')return (+v||0).toLocaleString('pt-BR');return String(v)}
function el(t,a,h){var e=document.createElement(t);if(a)for(var k in a){if(k==='class')e.className=a[k];else e.setAttribute(k,a[k])}if(h!==undefined)e.innerHTML=h;return e}
function es(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var NOMES={alta:'Alta',media:'Média',baixa:'Baixa',info:'Informativo',ok:'OK'};
function selo(c){return '<span class="selo '+c+'">'+NOMES[c]+'</span>'}
/* tabela com ordenação e filtro */
function tabela(t,filtro,reforma){
  var linhas=t.linhas.filter(function(l){
    if(reforma&&l.reforma!==undefined&&l.reforma!==reforma)return false;
    if(!filtro)return true;var s=JSON.stringify(l).toLowerCase();return s.indexOf(filtro.toLowerCase())>=0});
  var h='<div class="tab"><table><thead><tr>'+t.colunas.map(function(c,i){return '<th data-i="'+i+'">'+es(c.nome)+'</th>'}).join('')+'</tr></thead><tbody>';
  var max=Math.min(linhas.length,2000);
  for(var i=0;i<max;i++){var l=linhas[i];h+='<tr>'+t.colunas.map(function(c){var v=l[c.id];var cls=(c.tipo==='texto'?(String(v||'').length>60?'longo':''):'n');return '<td class="'+cls+'">'+es(fm(v,c.tipo))+'</td>'}).join('')+'</tr>'}
  h+='</tbody></table></div><p class="sub">'+linhas.length+' linha(s)'+(linhas.length>max?' (mostrando as '+max+' primeiras; use a busca)':'')+'</p>';
  return h}
function cartao(a){
  var c=el('div',{class:'card achado c-'+a.criticidade});
  var h='<header><span class="item">'+es(a.item)+'</span>'+selo(a.criticidade)+'<h3>'+es(a.titulo)+'</h3></header><p>'+es(a.resumo)+'</p>';
  if(a.representatividade!==undefined&&a.representatividade>0)h+='<div class="sub">Representatividade: '+fm(a.representatividade,'pct')+'</div><div class="barra"><i style="width:'+Math.min(100,a.representatividade*100)+'%"></i></div>';
  if(a.reforma)h+='<div class="rf"><span>CFOPs da reforma: <b>'+fm(a.reforma.dentro,'moeda')+'</b></span><span>Fora da reforma: <b>'+fm(a.reforma.fora,'moeda')+'</b></span></div>';
  if(a.comoResolver)h+='<div class="resolver"><b>Como resolver:</b> '+es(a.comoResolver)+'</div>';
  h+='<div class="acoes">';
  if(a.tabela&&a.tabela.linhas.length)h+='<button class="b" data-t="tabela">Ver totalização ('+a.tabela.linhas.length+')</button>';
  if(a.detalhe&&a.detalhe.linhas.length)h+='<button class="b" data-t="micro">Abrir no micro ('+a.detalhe.linhas.length+' documento(s))</button>';
  if(a.fontes&&a.fontes.length)h+='<button class="b" data-t="leis">Legislação</button>';
  h+='</div><div class="corpo"></div>';
  c.innerHTML=h;
  c.querySelectorAll('button[data-t]').forEach(function(b){b.onclick=function(){
    var t=b.getAttribute('data-t');var corpo=c.querySelector('.corpo');
    if(t==='tabela'){corpo.innerHTML=corpo.innerHTML?'':tabela(a.tabela,'','')}
    if(t==='micro'){document.getElementById('m-achado').value=a.id;mostrar('micro');desenharMicro()}
    if(t==='leis'){mostrar('leis')}
  }});
  return c}
/* abas */
var ABAS=[['veredito','Veredito'],['1','1 · Documentos enviados'],['2','2 · Acurácia'],['3','3 · Consolidação'],['4','4 · Divergências com a Pricetax'],['micro','Micro (documentos)'],['ajustes','Ajustes e estornos'],['leis','Legislação']];
var nav=document.getElementById('abas');
function mostrar(id){document.querySelectorAll('section').forEach(function(s){s.classList.toggle('ativa',s.id==='s-'+id)});nav.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-current',b.getAttribute('data-a')===id)});window.scrollTo(0,0)}
ABAS.forEach(function(x){var b=el('button',{'data-a':x[0]},x[1]);b.onclick=function(){mostrar(x[0])};nav.appendChild(b)});
nav.querySelector('button').setAttribute('aria-current','true');
/* etapa 1 */
(function(){var s=document.getElementById('s-1');
  var c=el('div',{class:'card'},'<h2>Checklist dos documentos</h2><p class="sub">EFD ICMS/IPI e EFD Contribuições: estabelecimentos, meses, duplicidades e versões.</p>');
  var ck='<div class="check">'+R.checklist.map(function(i){return '<div><b class="s '+(i.ok?'okk':'nok')+'">'+(i.ok?'✓':'✗')+'</b><span><b>'+es(i.item)+'</b> '+es(i.descricao)+'<br><span class="sub">'+es(i.detalhe)+'</span></span></div>'}).join('')+'</div>';
  c.innerHTML+=ck;s.appendChild(c);
  var mapa=el('div',{class:'card'},'<h2>Mapa de entregas</h2><p class="sub">F = EFD ICMS/IPI · C = EFD Contribuições. Verde recebido, vermelho faltando.</p>');
  var h='<div class="tab mapa"><table><thead><tr><th>Estabelecimento</th><th>IE</th>'+R.periodo.meses.map(function(m){return '<th>'+m.slice(5,7)+'/'+m.slice(0,4)+'</th>'}).join('')+'</tr></thead><tbody>';
  R.estabelecimentos.forEach(function(e){h+='<tr><td>'+es(e.nome||'')+'<br><span class="sub">'+es(e.cnpj)+'</span></td><td>'+es(e.ie||'—')+'</td>'+R.periodo.meses.map(function(m){
    var f=e.fiscal[m],ct=e.contribuicoes[m];var precisaF=!!e.ie||Object.keys(e.fiscal).length>0;
    return '<td class="c">'+(precisaF?'<span class="'+(f?'s':'n')+'">F'+(f>1?'×'+f:'')+'</span> ':'')+'<span class="'+(ct?'s':'n')+'">C</span></td>'}).join('')+'</tr>'});
  mapa.innerHTML+=h+'</tbody></table></div>';s.appendChild(mapa);
  var p=el('div',{class:'card'},'<h2>Pendências para o cliente</h2>');
  if(!R.pendencias.length)p.innerHTML+='<p>Nenhuma pendência: todos os arquivos estão completos.</p>';
  else{p.innerHTML+=tabela({colunas:[{id:'tipo',nome:'EFD',tipo:'texto'},{id:'cnpj',nome:'CNPJ',tipo:'texto'},{id:'estabelecimento',nome:'Estabelecimento',tipo:'texto'},{id:'competencia',nome:'Competência',tipo:'texto'},{id:'problema',nome:'O que encontramos',tipo:'texto'},{id:'acao',nome:'O que pedir',tipo:'texto'}],linhas:R.pendencias},'','');}
  s.appendChild(p);
  var arq=el('div',{class:'card'},'<h2>Arquivos recebidos</h2>'+tabela({colunas:[{id:'nome',nome:'Arquivo',tipo:'texto'},{id:'tipo',nome:'Tipo',tipo:'texto'},{id:'cnpj',nome:'CNPJ',tipo:'texto'},{id:'periodo',nome:'Competência',tipo:'texto'},{id:'finalidade',nome:'Versão',tipo:'texto'},{id:'linhas',nome:'Linhas',tipo:'num'},{id:'erros',nome:'Linhas com erro',tipo:'num'}],linhas:R.arquivos},'',''));
  s.appendChild(arq)})();
/* etapas 2, 3 e 4 */
['2','3','4'].forEach(function(et){var s=document.getElementById('s-'+et);var lista=A.filter(function(a){return a.etapa===et});
  if(et==='4'&&!lista.length){s.appendChild(el('div',{class:'card'},'<h2>Divergências com o relatório da Pricetax</h2><p>O relatório da Pricetax não foi carregado no painel. Carregue a planilha na aba Auditoria para incluir esta etapa.</p>'));return}
  if(et==='4'&&D.cruzamento){var c=D.cruzamento;s.appendChild(el('div',{class:'kpis'},'<div class="kpi"><span>Documentos no EFD</span><b>'+fm(c.documentosEfd,'num')+'</b><span class="sub">'+fm(c.duplicadosRemovidos,'num')+' em duplicidade Fiscal × Contribuições, unificados</span></div><div class="kpi"><span>Documentos na planilha</span><b>'+fm(c.documentosPricetax,'num')+'</b></div><div class="kpi"><span>Conferem</span><b style="color:var(--ok)">'+fm(c.conferem,'num')+'</b></div><div class="kpi"><span>Total EFD × Pricetax</span><b>'+fm(c.totalPricetax-c.totalEfd,'moeda')+'</b><span class="sub">'+fm(c.totalEfd,'moeda')+' × '+fm(c.totalPricetax,'moeda')+'</span></div>'))}
  lista.forEach(function(a){s.appendChild(cartao(a))})});
/* gráfico de criticidade */
(function(){var cont={alta:0,media:0,baixa:0,info:0,ok:0};A.forEach(function(a){cont[a.criticidade]++});var tot=A.length||1;var cores={alta:'var(--alta)',media:'var(--media)',baixa:'var(--baixa)',info:'var(--info)',ok:'var(--ok)'};
  var x=0,h='<svg viewBox="0 0 400 60" width="100%" height="60" role="img" aria-label="Achados por criticidade">';
  Object.keys(cont).forEach(function(k){var w=cont[k]/tot*400;if(w>0){h+='<rect x="'+x+'" y="10" width="'+w+'" height="26" rx="4" fill="'+cores[k]+'"></rect>';x+=w}});
  h+='</svg><div class="rf">'+Object.keys(cont).map(function(k){return selo(k)+' '+cont[k]}).join(' ')+'</div>';document.getElementById('g-crit').innerHTML=h})();
/* gráfico da apuração */
(function(){var ls=R.consolidacao.linhas;var imps=[];ls.forEach(function(l){if(imps.indexOf(l.imposto)<0)imps.push(l.imposto)});var sel=document.getElementById('g-imp');
  imps.forEach(function(i){sel.appendChild(el('option',{value:i},i))});
  function desenhar(){var xs=ls.filter(function(l){return l.imposto===sel.value});var max=Math.max.apply(null,xs.map(function(l){return Math.max(l.aRecolher,l.saldoCredor)}).concat([1]));
    var W=560,H=200,p=30,bw=(W-p*2)/Math.max(xs.length,1);var h='<svg viewBox="0 0 '+W+' '+(H+30)+'" width="100%" role="img" aria-label="Apuração mensal">';
    xs.forEach(function(l,i){var bh=l.aRecolher/max*H;h+='<rect x="'+(p+i*bw+bw*.2)+'" y="'+(H-bh+5)+'" width="'+bw*.6+'" height="'+bh+'" rx="4" fill="var(--amarelo)"><title>'+l.periodo+': a recolher '+fm(l.aRecolher,'moeda')+'</title></rect><text x="'+(p+i*bw+bw/2)+'" y="'+(H+22)+'" text-anchor="middle">'+l.periodo.slice(5,7)+'/'+l.periodo.slice(2,4)+'</text>'});
    var pts=xs.map(function(l,i){return (p+i*bw+bw/2)+','+(H-l.saldoCredor/max*H+5)}).join(' ');h+='<polyline points="'+pts+'" fill="none" stroke="var(--texto)" stroke-width="2"></polyline>';
    xs.forEach(function(l,i){h+='<circle cx="'+(p+i*bw+bw/2)+'" cy="'+(H-l.saldoCredor/max*H+5)+'" r="3.5" fill="var(--texto)"><title>'+l.periodo+': saldo credor '+fm(l.saldoCredor,'moeda')+'</title></circle>'});
    document.getElementById('g-apur').innerHTML=h+'</svg>'}
  sel.onchange=desenhar;if(imps.length)desenhar()})();
/* o que pedir e principais pontos */
(function(){var pedidos=[];R.pendencias.forEach(function(p){pedidos.push(p.tipo+' · '+p.cnpj+' · '+p.competencia+': '+p.acao)});
  A.filter(function(a){return (a.criticidade==='alta'||a.criticidade==='media')&&a.comoResolver}).forEach(function(a){pedidos.push(a.item+' '+a.titulo+': '+a.comoResolver)});
  document.getElementById('pedidos').innerHTML=pedidos.length?'<pre class="msg">'+es(pedidos.map(function(x,i){return (i+1)+'. '+x}).join('\\n'))+'</pre><button class="b" id="copiar">Copiar lista</button>':'<p>Nada a pedir ao cliente.</p>';
  var cp=document.getElementById('copiar');if(cp)cp.onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(pedidos.map(function(x,i){return (i+1)+'. '+x}).join('\\n'));cp.textContent='Copiado'};
  var top=document.getElementById('top');A.filter(function(a){return a.criticidade==='alta'||a.criticidade==='media'}).forEach(function(a){top.appendChild(cartao(a))});if(!top.children.length)top.innerHTML='<p>Nenhum ponto crítico ou de atenção.</p>'})();
/* micro */
var mSel=document.getElementById('m-achado');A.filter(function(a){return a.detalhe&&a.detalhe.linhas.length}).forEach(function(a){mSel.appendChild(el('option',{value:a.id},a.item+' · '+a.titulo+' ('+a.detalhe.linhas.length+')'))});
function desenharMicro(){var a=A.filter(function(x){return x.id===mSel.value})[0];document.getElementById('m-tab').innerHTML=a?tabela(a.detalhe,document.getElementById('m-busca').value,document.getElementById('m-reforma').value):'<p>Nenhum documento apontado.</p>'}
mSel.onchange=desenharMicro;document.getElementById('m-busca').oninput=desenharMicro;document.getElementById('m-reforma').onchange=desenharMicro;desenharMicro();
/* ajustes */
(function(){var linhas=[];A.forEach(function(a){if((a.id==='2.1.4'||a.id==='3.1-aj')&&a.detalhe)linhas=linhas.concat(a.detalhe.linhas.map(function(l){return Object.assign({origem:a.id==='2.1.4'?'EFD Contribuições':'EFD ICMS/IPI'},l)}))});
  var t={colunas:[{id:'origem',nome:'EFD',tipo:'texto'},{id:'periodo',nome:'Competência',tipo:'texto'},{id:'estab',nome:'Estabelecimento',tipo:'texto'},{id:'reg',nome:'Registro',tipo:'texto'},{id:'imposto',nome:'Imposto',tipo:'texto'},{id:'tipo',nome:'Natureza',tipo:'texto'},{id:'codigo',nome:'Código',tipo:'texto'},{id:'descricao',nome:'Descrição',tipo:'texto'},{id:'doc',nome:'Documento',tipo:'texto'},{id:'valor',nome:'Valor',tipo:'moeda'}],linhas:linhas};
  function d(){document.getElementById('a-tab').innerHTML=linhas.length?tabela(t,document.getElementById('a-busca').value,''):'<p>Nenhum ajuste nos arquivos.</p>'}document.getElementById('a-busca').oninput=d;d()})();
/* legislação */
document.getElementById('leis').innerHTML=D.fontes.map(function(f){return '<div class="card" style="margin-top:12px"><h3>'+es(f.titulo)+'</h3><p><a href="'+es(f.url)+'" target="_blank" rel="noopener">'+es(f.url)+'</a></p><p class="sub">Achados que citam esta fonte: '+A.filter(function(a){return (a.fontes||[]).indexOf(f.id)>=0}).map(function(a){return a.item}).join(', ')+'</p><div class="resolver"><b>Trecho literal:</b> '+(f.trecho?es(f.trecho):'não incluído nesta versão; consulte o texto oficial no link acima.')+'</div></div>'}).join('');
})();
</script>
</body>
</html>`
}

export const nomeDossie = (r: Resultado) => `dossie-auditoria-${(r.empresa.cnpj || "empresa").replace(/\D/g, "")}-${r.periodo.inicio}-${r.periodo.fim}.html`
export { rotuloCrit }
