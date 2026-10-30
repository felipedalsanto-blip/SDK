# Painel de cálculos PriceTax

**Diagnóstico da Reforma Tributária**, em quatro capítulos, direto do SDK:

- **Compras 2027:** fornecedores e compras por regime; top 10 fornecedores e itens (com o fornecedor) que aumentam e que reduzem o preço; top 10 do Simples Nacional por custo; Pareto 80/20 por fornecedor, NCM e grupo; plano de negociação.
- **Vendas 2027:** os cenários Sem Ajuste, Com Reajuste e Preço Alvo; clientes e vendas por regime, com o custo estimado do cliente; top 10 a 50 clientes e itens (com o cliente) e clientes do Simples; desvios de carga no mesmo NCM por destino (CFOP) e regime do cliente; Pareto; plano comercial.
- **DRE 2027 a 2033:** até o lucro bruto, nos três cenários, explicando a saída do IBS e da CBS da receita bruta e dos custos.
- **Fluxo de caixa 2027 a 2033:** fornecedores contra hoje; clientes, tributo recolhido e variação de caixa nos três cenários; estorno de débito (tributo destacado menos devido) e estorno de crédito (aproximado) perdendo força até 2033.

Em todas as tabelas, os grupos **Impostos** e **Créditos** expandem (totais AR × DR e por tributo: ICMS, ICMS-ST, DIFAL, ISS, IPI, PIS/COFINS, IBS e CBS), com "Expandir tudo" e "Recolher tudo" por tabela e por capítulo. Compras e Vendas têm o **Monte a sua visão** (agrupadores e colunas à escolha, ordenação, paginação e CSV). DRE e fluxo de caixa saem no formato de demonstrativo, com linhas que abrem até o tributo, e gráficos em linha.

**Fichas:** clicar num fornecedor, cliente ou item (nas tabelas, no Pareto e no Monte a sua visão) abre uma ficha lateral com a **memória de cálculo AR × DR** (valor da nota → base sem tributos → tributos que restam + IBS + CBS → novo valor; e o custo depois de cada crédito, ou o débito por tributo nas vendas, com as alíquotas efetivas), a lista do outro lado (itens do fornecedor, fornecedores do item) e as primeiras notas. Os cliques dentro da ficha encadeiam, com trilha e botão de voltar.

Fora do alcance da API: despesas operacionais, IR e CSLL (a DRE vai até o lucro bruto) e a UF de destino (o destino é lido pelo CFOP).


Interface web (Next.js) para visualizar os cálculos da PriceTax antes e depois da reforma
tributária, usando o [`@pricetax/sdk`](https://developers-rho-seven.vercel.app/calculos/sdk/).

- **Totais do recorte**: tributos, carga efetiva, valor, débito e crédito, antes × depois.
- **Ano a ano da transição** (2026–2033): carga efetiva ou tributos em R$. Clique num ano para abrir o recorte.
- **Ranking** por NCM, CFOP, CNPJ, UF, tipo de item, operação, segmento ou produto. Clique num grupo para filtrar o painel inteiro.
- **Itens de nota** paginados e **download do CSV** do recorte (formato das planilhas do app).
- **Classificação CST / cClassTrib** (aba própria): CST e cClassTrib da nota × calculados, divergências,
  perda e ganho potenciais estimados (o correto é o calculado), itens e fornecedores críticos e
  projeção ano a ano de 2026 a 2033, por período do cálculo ou anualizada.

## Configurar

1. No app da PriceTax: **Meus Dados → Integrações → Nova conta de serviço → Emitir chave**.
2. Crie o `.env.local` (fica fora do git) a partir do `.env.example`:

   ```
   PRICETAX_API_KEY=ptc_...           # só no servidor; nunca com prefixo NEXT_PUBLIC_
   PRICETAX_CALCULO_ID=               # opcional: cálculo aberto por padrão
   PAINEL_USUARIO= / PAINEL_SENHA=    # opcional, mas recomendado ao publicar
   ```

3. Rode:

   ```bash
   npm install
   npm run dev        # http://localhost:3000
   ```

   Produção: `npm run build && npm start`, ou deploy na Vercel com as mesmas variáveis.

## Como funciona

- O navegador **nunca** recebe a chave: chama as rotas `app/api/calculos/**`, que usam o SDK
  no servidor (`lib/pricetax.ts`, com `server-only`).
- O servidor confere regime, ano e cenário contra `calculos.obter(id)` antes de consultar
  (a API devolve zeros, não erro, para um recorte que o cálculo não tem) e só aceita as
  dimensões e medidas listadas em `lib/catalogo.ts`.
- Totais, ranking e série usam `calculos.consultar` (a API agrega); a tabela usa
  `calculos.pagina` com cursor; o CSV usa `calculos.exportar` em stream.
- Cache em memória no servidor (1–10 min) para respeitar o limite de 60 chamadas/min por chave.
  A série anual faz uma consulta por ano (até 9), em sequência.
- O cálculo vem da URL (`?calculo=<id>`) ou de `PRICETAX_CALCULO_ID`; sem isso, o painel
  mostra a lista para escolher.

**Segurança:** as rotas `/api` leem com a chave da conta, então qualquer pessoa com o endereço
do painel vê todos os cálculos dela. Ao publicar, defina `PAINEL_USUARIO` e `PAINEL_SENHA`
(HTTP Basic, em `middleware.ts`) ou ponha o painel atrás da autenticação que vocês já usam.

## Classificação CST / cClassTrib

`lib/divergencias.ts` compara `cclass_nota` com `cclass_calculado` em cada item e estima o IBS + CBS
que a classificação da nota geraria, usando a redução de cada código na tabela oficial
(`lib/cclasstrib.json`, do Portal DF-e da SVRS):

- **Correto** = IBS + CBS calculado pela PriceTax com o `cclass_calculado`.
- **Pela nota** = o mesmo tributo com o fator do `cclass_nota` (1 − redução; 0 se o CST não exige
  tributo). Se o correto é isento, usa a alíquota cheia tirada do próprio recorte.
- **Vendas:** nota com tributo menor que o correto é perda (a recolher); maior é ganho (recuperável).
  **Compras:** crédito maior que o correto é perda (glosa); menor é ganho (crédito a recuperar).
- Só os CST 000, 200, 222, 400 e 410 entram em R$. Os demais (alíquota fixa, diferimento, suspensão,
  monofásica etc.) e as notas sem cClassTrib aparecem nas contagens, sem valor estimado.

Atualizar a tabela oficial quando ela mudar:

```bash
npm run cclasstrib:atualizar
```

A análise de um ano faz de 3 a 14 consultas (as razões sociais dos 10 fornecedores críticos são lidas
uma a uma) e a projeção, uma por ano. Tudo fica em cache no servidor por 10 minutos.

## Tema, custo do cliente e IRPJ/CSLL

- **Tema**: seletor Claro / Escuro / Sistema no topo; a escolha fica salva no navegador (`pricetax-tema`).
- **Vendas · Custo do seu cliente**: nove perfis de comprador (Simples padrão e híbrido; Lucro Real e Presumido em indústria, comércio e serviços; pessoa física), com os créditos que cada um aproveita hoje e em 2027, detalhe por perfil e régua de % da carteira (começa pela carteira real por regime).
- **DRE e fluxo de caixa**: despesas operacionais informadas pelo usuário (% da receita líquida ou R$), LAIR, IRPJ (15% + adicional de 10%), CSLL (9%), lucro líquido e caixa depois do IR. No Presumido, presunção de 8%/12% (comércio e indústria) ou 32% (serviços). No Simples, IR e CSLL ficam dentro do DAS.

## Novo produto e cenário Custo Neutro

- **Novo produto** (aba): simula o preço de um produto, serviço ou locação que não está no histórico. Parte do custo líquido + margem (ou markup, ou preço líquido informado), aplica os tributos de hoje (ICMS, ISS e PIS/COFINS por dentro; IPI por fora) e, em cada ano de 2027 a 2033, o cronograma da EC 132/2023 mais IBS e CBS por fora, com a redução do cClassTrib escolhido (tabela oficial). Se o NCM já aparece nas vendas do cálculo, traz o cClassTrib calculado pela Pricetax e as alíquotas praticadas; a alíquota cheia de IBS e CBS de cada ano vem das vendas tributadas do cálculo (editável). Mostra a formação do preço, os campos da NF-e, o custo para cada perfil de cliente e o total da nota ano a ano. Fica salvo só no navegador.
- **Custo Neutro** (cenário de venda): derivado no painel, não vem da API. Parte do Com Reajuste e move o preço líquido só pela variação do custo das compras do ano, zerando a diferença do lucro bruto contra hoje, sem considerar despesas. Aparece em Vendas, DRE e fluxo de caixa.

## Novo produto: classificação oficial e metodologia

- **NCM (produto)**: a rota `/api/receita` consulta a calculadora oficial do IBS e da CBS da Receita (dados abertos, sem chave) e testa o NCM contra os cClassTrib que dependem do produto (anexos da LC 214, lista em `lib/ncm-restritos.json`, gerada por `npm run ncm:atualizar`). Havendo redução, o simulador já escolhe a de maior redução e mostra as alternativas; sem redução, usa o cClassTrib do histórico ou a regra geral (000001).
- **NBS (serviço e locação)**: busca por código ou descrição; traz as classificações próprias da NBS e, recolhidas, as reduções gerais que dependem de quem presta ou da operação. Com uma única classificação própria, ela é escolhida; com várias, fica a regra geral até a escolha.
- **Alíquota cheia de IBS e CBS**: a alíquota que a API de cálculos devolve nas vendas de tributação integral do ano (sem elas, tributo ÷ base ajustada pela redução). Editável.
- **Metodologia**: "Transição completa" (tributos atuais que restam no ano, por dentro, + IBS e CBS por fora) ou "Só os novos tributos" (preço líquido + IBS e CBS, sem desonerar nem incluir os atuais).
- Em desenvolvimento atrás de proxy, o Node precisa de `NODE_USE_ENV_PROXY=1` para chegar à calculadora da Receita.

## Ano no topo do painel

O seletor de ano vale para todas as abas: Compras, Vendas, fichas e "Monte a sua visão" passam a ler o ano escolhido (padrão 2027); DRE e fluxo de caixa continuam mostrando todos os anos, com o escolhido em destaque; o Novo produto monta a nota para esse ano.

## Novo produto: fórmulas de formação de preço

O precificador parte do **valor líquido** (custo + margem + outras despesas) que a empresa quer receber livre de tributos e acha o valor da operação que, depois de recolher os tributos por dentro, devolve exatamente esse valor:

- **IBS e CBS**: base = valor líquido; alíquota cheia × (1 − redução do cClassTrib).
- **ICMS**: base = valor da operação + IBS + CBS (+ IPI quando o destinatário não revende nem industrializa), com gross-up do próprio ICMS.
- **ISS**: mesma regra do ICMS, com gross-up do ISS.
- **PIS/COFINS** (hoje): sobre a receita, com o ICMS fora da base (Tema 69, desmarcável).
- **IPI**: sobre o valor da operação.
- **ICMS-ST** (só quando ativado ou identificado no histórico do NCM): (operação + IBS + CBS + IPI) × (1 + MVA) × alíquota interna do destino − ICMS próprio; MVA ajustada na venda interestadual.
- **DIFAL** (venda interestadual a quem não revende): não contribuinte, recolhido pelo remetente, base única, dentro do preço; contribuinte (uso e consumo), recolhido pelo destinatário, base dupla, fora da nota.
