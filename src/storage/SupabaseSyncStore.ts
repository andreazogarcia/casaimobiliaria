import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ISyncStore, RegistroSync } from "../interfaces/ISyncStore.js";

const TABELA = "sync_records";

/** Formato da linha como ela existe na tabela do Supabase (nomes de coluna em snake_case). */
interface LinhaSyncRecords {
  id_origem: string;
  id_destino: string;
  hash_conteudo: string;
  ultima_sincronizacao_em: string;
}

/**
 * Conversões entre o formato da linha do banco (snake_case) e o formato
 * do domínio (camelCase, `RegistroSync`). Ficam separadas como funções
 * puras, exportadas, para poderem ser testadas sem precisar de uma
 * conexão real com o Supabase.
 */
export function paraRegistroSync(linha: LinhaSyncRecords): RegistroSync {
  return {
    idOrigem: linha.id_origem,
    idDestino: linha.id_destino,
    hashConteudo: linha.hash_conteudo,
    ultimaSincronizacaoEm: linha.ultima_sincronizacao_em,
  };
}

export function paraLinhaSyncRecords(registro: RegistroSync): LinhaSyncRecords {
  return {
    id_origem: registro.idOrigem,
    id_destino: registro.idDestino,
    hash_conteudo: registro.hashConteudo,
    ultima_sincronizacao_em: registro.ultimaSincronizacaoEm,
  };
}

/**
 * Implementação de ISyncStore usando Supabase (Postgres) como banco
 * persistente — sobrevive entre execuções serverless na Vercel, ao
 * contrário da InMemorySyncStore usada em dev/testes.
 *
 * Requer a tabela `sync_records` já criada (ver supabase/schema.sql) e
 * usa a service_role key, que ignora Row Level Security — por isso essa
 * chave NUNCA deve ser exposta no frontend, só usada aqui no backend.
 */
export class SupabaseSyncStore implements ISyncStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey);
  }

  async buscarPorIdOrigem(idOrigem: string): Promise<RegistroSync | null> {
    const { data, error } = await this.client
      .from(TABELA)
      .select("*")
      .eq("id_origem", idOrigem)
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao buscar registro de sync no Supabase: ${error.message}`);
    }
    return data ? paraRegistroSync(data as LinhaSyncRecords) : null;
  }

  async listarTodos(): Promise<RegistroSync[]> {
    const { data, error } = await this.client.from(TABELA).select("*");

    if (error) {
      throw new Error(`Falha ao listar registros de sync no Supabase: ${error.message}`);
    }
    return (data ?? []).map((linha: LinhaSyncRecords) => paraRegistroSync(linha));
  }

  async salvar(registro: RegistroSync): Promise<void> {
    const { error } = await this.client
      .from(TABELA)
      .upsert(paraLinhaSyncRecords(registro), { onConflict: "id_origem" });

    if (error) {
      throw new Error(`Falha ao salvar registro de sync no Supabase: ${error.message}`);
    }
  }

  async remover(idOrigem: string): Promise<void> {
    const { error } = await this.client.from(TABELA).delete().eq("id_origem", idOrigem);

    if (error) {
      throw new Error(`Falha ao remover registro de sync no Supabase: ${error.message}`);
    }
  }
}
