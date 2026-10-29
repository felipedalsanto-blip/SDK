# Painel de cálculos PriceTax

Interface web (Next.js) para visualizar os cálculos da PriceTax antes e depois da reforma
tributária, usando o [`@pricetax/sdk`](https://developers-rho-seven.vercel.app/calculos/sdk/).

- **Totais do recorte**: tributos, carga efetiva, valor, débito e crédito, antes × depois.
- **Ano a ano da transição** (2026–2033): carga efetiva ou tributos em R$. Clique num ano para abrir o recorte.
- **Ranking** por NCM, CFOP, CNPJ, UF, tipo de item, operação, segmento ou produto. Clique num grupo para filtrar o painel inteiro.
- **Itens de nota** paginados e **download do CSV** do recorte (formato das planilhas do app).

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
