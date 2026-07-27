import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SyncEngine } from "../src/sync/SyncEngine.js";
import { WordPressConnector } from "../src/connectors/wordpress/WordPressConnector.js";
import { OlxConnector } from "../src/connectors/olx/OlxConnector.js";
import { OlxOAuthClient } from "../src/connectors/olx/OlxOAuthClient.js";
import { SupabaseSyncStore } from "../src/storage/SupabaseSyncStore.js";
import { ConsoleLogger } from "../src/logging/ConsoleLogger.js";
import { env } from "../src/config/env.js";

/**
 * GET /api/sync
 *
 * Disparada por um scheduler externo (cron-job.org, GitHub Actions etc.)
 * a cada 10-15 minutos — NÃO usar o Cron nativo da Vercel no plano
 * Hobby, que só permite 1x/dia. Ver conversa sobre limitações do plano
 * gratuito.
 *
 * Protegida por um header de autorização simples para que só o
 * scheduler configurado consiga disparar o ciclo.
 *
 * Usa SupabaseSyncStore como store de sincronização, que persiste entre
 * execuções serverless (ao contrário da InMemorySyncStore, usada só em
 * dev/testes) — necessário para o Hub saber o que já foi sincronizado
 * antes, mesmo rodando em uma função nova a cada chamada.
 *
 * Aceita um parâmetro opcional `?limit=N` para limitar quantas mudanças
 * (criar/atualizar/remover) são executadas de fato nesta chamada —
 * recomendado para o primeiro teste real contra uma conta de produção,
 * antes de rodar sem limite contra o catálogo inteiro.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const logger = new ConsoleLogger();

  try {
    const segredoRecebido = req.headers.authorization?.replace("Bearer ", "");
    if (segredoRecebido !== env.cronSecret) {
      res.status(401).json({ erro: "Não autorizado" });
      return;
    }

    const origem = new WordPressConnector(
      {
        apiUrl: env.wordpress.apiUrl,
        usuario: env.wordpress.usuario,
        senhaAplicativo: env.wordpress.senhaAplicativo,
        postType: env.wordpress.postType,
      },
      logger
    );

    const oauth = new OlxOAuthClient(
      { clientId: env.olx.clientId, clientSecret: env.olx.clientSecret, redirectUri: env.olx.redirectUri },
      logger,
      env.olx.accessToken
    );
    const destino = new OlxConnector(oauth, logger);

    const store = new SupabaseSyncStore(env.supabase.url, env.supabase.serviceRoleKey);

    const engine = new SyncEngine(origem, destino, store, logger);

    // Trava de segurança: ?limit=N restringe quantas mudanças (criar/
    // atualizar/remover) são executadas nesta chamada. Sem o parâmetro,
    // processa tudo — use isso conscientemente, de preferência só depois
    // de validar um lote pequeno primeiro (ex: /api/sync?limit=3).
    const limiteParam = req.query.limit;
    const limite = typeof limiteParam === "string" && limiteParam !== "" ? Number(limiteParam) : undefined;
    if (limiteParam !== undefined && (limite === undefined || !Number.isFinite(limite) || limite < 0)) {
      res.status(400).json({ erro: "Parâmetro 'limit' inválido — deve ser um número inteiro >= 0" });
      return;
    }

    const resultado = await engine.executarCiclo(limite);

    res.status(200).json(resultado);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("Falha no ciclo de sincronização", { mensagem });
    res.status(500).json({ erro: mensagem });
  }
}
