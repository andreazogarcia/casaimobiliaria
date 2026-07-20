/** Um registro do que já foi sincronizado, e com qual "impressão digital" de conteúdo. */
export interface RegistroSync {
  idOrigem: string;
  idDestino: string;
  hashConteudo: string;
  ultimaSincronizacaoEm: string;
}

/**
 * Guarda o mapeamento idOrigem <-> idDestino e o hash do último conteúdo
 * sincronizado. É o que dá idempotência ao Hub: rodar o ciclo duas vezes
 * não duplica nem perde nada.
 *
 * Implementação real (produção) precisa ser um banco persistente
 * (ex: Postgres/Supabase) — funções serverless na Vercel não têm disco
 * persistente entre execuções. A InMemorySyncStore aqui serve só para
 * desenvolvimento e testes.
 */
export interface ISyncStore {
  buscarPorIdOrigem(idOrigem: string): Promise<RegistroSync | null>;
  listarTodos(): Promise<RegistroSync[]>;
  salvar(registro: RegistroSync): Promise<void>;
  remover(idOrigem: string): Promise<void>;
}
