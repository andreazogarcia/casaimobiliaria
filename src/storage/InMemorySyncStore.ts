import { ISyncStore, RegistroSync } from "../interfaces/ISyncStore.js";

/**
 * Implementação em memória de ISyncStore — usada em testes e no
 * desenvolvimento local. NÃO usar em produção na Vercel: funções
 * serverless não compartilham memória entre execuções, então cada
 * chamada veria um store vazio.
 *
 * Para produção, implemente esta mesma interface com um banco
 * persistente (ex: Postgres via Supabase/Neon/Vercel Postgres).
 * O SyncEngine não precisa de nenhuma alteração para isso.
 */
export class InMemorySyncStore implements ISyncStore {
  private registros = new Map<string, RegistroSync>();

  async buscarPorIdOrigem(idOrigem: string): Promise<RegistroSync | null> {
    return this.registros.get(idOrigem) ?? null;
  }

  async listarTodos(): Promise<RegistroSync[]> {
    return Array.from(this.registros.values());
  }

  async salvar(registro: RegistroSync): Promise<void> {
    this.registros.set(registro.idOrigem, registro);
  }

  async remover(idOrigem: string): Promise<void> {
    this.registros.delete(idOrigem);
  }
}
