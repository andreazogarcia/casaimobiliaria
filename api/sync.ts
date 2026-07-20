import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SyncEngine } from "../src/sync/SyncEngine";
import { WordPressConnector } from "../src/connectors/wordpress/WordPressConnector";
import { OlxConnector } from "../src/connectors/olx/OlxConnector";
import { OlxOAuthClient } from "../src/connectors/olx/OlxOAuthClient";
import { InMemorySyncStore } from "../src/storage/InMemorySyncStore";
import { ConsoleLogger } from "../src/logging/ConsoleLogger";
import { env } from "../src/config/env";

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
 * ATENÇÃO: usa InMemorySyncStore, que NÃO persiste entre execuções
 * serverless. Antes de considerar isso pronto para produção, trocar por
 * uma implementação de ISyncStore com banco persistente (ex: Postgres).
 * Por ora, isso serve para validar o fluxo ponta a ponta.
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

    // TODO: trocar pela implementação persistente antes de produção real.
    const store = new InMemorySyncStore();

    const engine = new SyncEngine(origem, destino, store, logger);
    const resultado = await engine.executarCiclo();

    res.status(200).json(resultado);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("Falha no ciclo de sincronização", { mensagem });
    res.status(500).json({ erro: mensagem });
  }
}
