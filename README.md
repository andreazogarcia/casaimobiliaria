# Hub de Integração — Casa Imobiliária

Sincroniza imóveis do WordPress/Listivo para a OLX PRO. Sprint 01: publicar, atualizar e remover anúncios, com logs. Leads ficam para uma possível V2.

## Arquitetura

```
src/
  domain/         Modelo de Imovel — agnóstico de WordPress e de OLX
  interfaces/     Contratos (IPropertySource, IPropertyDestination, ISyncStore, ILogger)
  connectors/
    wordpress/    Leitura via WP REST API (+ mock para testes)
    olx/          Publicação via API OAuth2 da OLX (+ mock para testes)
  sync/           SyncEngine (orquestração) e HashUtil (detecção de mudança)
  storage/        InMemorySyncStore (dev/teste — produção precisa de banco persistente)
  logging/        Logger estruturado
  config/         Carregamento de variáveis de ambiente
api/
  sync.ts             Disparado por um scheduler externo a cada 10-15 min
  oauth/authorize.ts  Início do fluxo OAuth2 (uso único, manual)
  oauth/callback.ts   Recebe o code da OLX e retorna o access_token
```

O `SyncEngine` só depende das interfaces — todo o comportamento foi validado com conectores mock, sem nenhuma credencial real (ver `src/__tests__/SyncEngine.test.ts`).

## Como rodar

```bash
npm install
cp .env.example .env   # preencher com os valores reais
npm test                # roda os testes com vitest
npm run build           # checagem de tipos
npx vercel dev          # ambiente local da Vercel
```

## Pendências conhecidas (não bloqueiam o desenvolvimento, mas precisam ser fechadas antes de produção)

1. ~~Nome do custom post type do Listivo~~ **RESOLVIDO**: post type real `listivo_listing`, rest_base `listings`. Confirmado via `/wp-json/wp/v2/types`.
2. **Campos específicos de categoria da OLX** — resolvido para Apartamentos e Casas (ver `OlxConnector.ts`, com códigos e parâmetros confirmados na documentação oficial). Terrenos/Comércio ainda pendentes.
3. ~~Mapeamento de campos do Listivo~~ **RESOLVIDO**, comparando 3 imóveis reais e cruzando com as descrições em texto livre. Confirmado: tipo, finalidade, cidade, bairro, preço, quartos, suítes, banheiros, vagas de garagem, área (com fallback entre dois campos de área), fotos. Único campo que continua sem identificação (`listivo_9255`) veio vazio nos 3 imóveis testados — não é usado no mapeamento atual, e não bloqueia nada.
4. **Store persistente** — decidido: Supabase (Postgres). Falta implementar `ISyncStore` com o client do Supabase (o `SyncEngine` não muda nada para isso).
5. **Scheduler** — não usar o Cron nativo da Vercel no plano Hobby (limitado a 1x/dia). Usar um scheduler externo gratuito (ex: cron-job.org, GitHub Actions) chamando `GET /api/sync` com o header `Authorization: Bearer <CRON_SECRET>`.
6. **Credenciais reais da OLX** — depende do registro da aplicação junto à OLX (e-mail para suporteintegrador@olxbr.com) e da conclusão do fluxo em `/api/oauth/authorize` → `/api/oauth/callback`.
7. **Conta de teste separada da OLX** — recomendado não testar create/update/delete direto na conta de produção do dono da imobiliária, já que a OLX não oferece ambiente de sandbox dedicado para a API.

## Variáveis de ambiente

Ver `.env.example`.
