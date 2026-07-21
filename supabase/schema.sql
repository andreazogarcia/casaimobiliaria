-- Rode este script uma vez no SQL Editor do Supabase (Dashboard do
-- projeto → SQL Editor → New query → colar e rodar).
--
-- Essa tabela guarda o mapeamento idOrigem (WordPress) <-> idDestino
-- (OLX) e o hash do último conteúdo sincronizado de cada imóvel. É o
-- que dá idempotência ao Hub: rodar o ciclo de sync duas vezes não
-- duplica nem perde nada.

create table if not exists sync_records (
  id_origem text primary key,
  id_destino text not null,
  hash_conteudo text not null,
  ultima_sincronizacao_em timestamptz not null default now()
);

-- Segurança: o Hub acessa essa tabela usando a service_role key (que
-- ignora Row Level Security por padrão), então a RLS abaixo serve para
-- garantir que NENHUM outro cliente (ex: uma chave anon/pública, se
-- algum dia for exposta por engano) consiga ler ou escrever aqui.
alter table sync_records enable row level security;

-- Nenhuma política de acesso é criada de propósito — com RLS ativado e
-- zero políticas, o acesso via chave anon fica bloqueado por padrão.
-- Só a service_role key (usada só no backend, nunca no navegador)
-- continua funcionando normalmente.
