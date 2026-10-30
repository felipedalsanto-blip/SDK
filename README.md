# Painel da Reforma Tributária (Pricetax)

Visão executiva dos efeitos da Reforma Tributária na empresa, feita para o contador apresentar ao
cliente, a partir dos cálculos da Pricetax via [`@pricetax/sdk`](https://developers-rho-seven.vercel.app/calculos/sdk/).
Padrão visual Vitória (Montserrat, amarelo `#FFD700`, preto `#1A1A1A`, cinza `#6B6B6B`), com modo
claro e escuro.

**Aba A Reforma na empresa**, uma história em 4 passos, um ano por vez (2027, transição, ou
2033, reforma completa):

1. **Quanto muda?** O imposto sobre o consumo a pagar no ano escolhido contra hoje, em um número.
2. **Por que muda?** Imposto sobre as vendas e crédito nas compras, cada um com a sua variação.
3. **Onde a empresa está perdendo dinheiro?** O DJF e as quatro causas, que levam à Auditoria.
4. **O que fazer?** As três ações de maior valor, com o primeiro fornecedor ou item de cada uma.

Tabelas e o ano a ano ficam em "ver detalhes"; premissas (cenários de preço) e o download do CSV, no fim.

**Aba Auditoria de IBS e CBS:** o indicador **DJF, Dinheiro Jogado Fora**, por causa, do total ao
fornecedor, ao item e ao cliente:

1. fornecedores cobrando a mais (repassam o novo imposto sobre o preço cheio: Sem Reajuste × Ajustado);
2. preço de venda desatualizado (Ajustado × Sem Reajuste, nas vendas);
3. crédito que ficou para trás (cClassTrib da nota de compra × calculado);
4. imposto pago a mais nas vendas (cClassTrib da nota de venda × calculado).

O risco fiscal (tributo a menor, crédito a maior) aparece à parte: é passivo, não DJF.

Todo cenário traz a **raiz da informação** (cálculo, competências e meses) e a **data de geração do
relatório**. A visão não traz DRE nem fluxo de caixa: a API de cálculos não informa despesas, IR e CSLL.

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

## Classificação CST / cClassTrib (ramos 3 e 4 do DJF)

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
