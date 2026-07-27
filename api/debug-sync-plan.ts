import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SyncEngine } from "../src/sync/SyncEngine.js";
import { WordPressConnector } from "../src/connectors/wordpress/WordPressConnector.js";
import { OlxConnectorMock } from "../src/connectors/olx/OlxConnector.mock.js";
import { SupabaseSyncStore } from "../src/storage/SupabaseSyncStore.js";
import { ConsoleLogger } from "../src/logging/ConsoleLogger.js";
import { env } from "../src/config/env.js";
import { descreverErro } from "../src/util/erros.js";

/**
 * GET /api/debug-sync-plan
 *
 * Rota de diagnóstico: testa WordPress + Supabase juntos, SEM precisar
 * de nenhuma credencial da OLX. Usa `planejarCiclo()`, que só depende da
 * origem e do store — nunca chama o destino de verdade, então um mock é
 * suficiente para satisfazer o construtor do SyncEngine.
 *
 * Não faz nenhuma escrita no WordPress nem na OLX. Faz LEITURA no
 * Supabase (para saber o que já foi sincronizado antes), mas nenhuma
 * escrita — só mostra o que SERIA feito num ciclo real.
 *
 * Não faz parte do fluxo de produção — pode ser removida depois que a
 * integração completa estiver validada de ponta a ponta.
 *
 * Protegida pelo mesmo CRON_SECRET das outras rotas.
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

    const store = new SupabaseSyncStore(env.supabase.url, env.supabase.serviceRoleKey);

    // Destino "de mentira" — planejarCiclo() nunca chama isso, só existe
    // para satisfazer o construtor do SyncEngine.
    const destinoFalso = new OlxConnectorMock();

    const engine = new SyncEngine(origem, destinoFalso, store, logger);
    const decisoes = await engine.planejarCiclo();

    const resumo = {
      criar: decisoes.filter((d) => d.acao === "criar").length,
      atualizar: decisoes.filter((d) => d.acao === "atualizar").length,
      remover: decisoes.filter((d) => d.acao === "remover").length,
      semAlteracao: decisoes.filter((d) => d.acao === "sem_alteracao").length,
    };

    res.status(200).json({
      resumo,
      // Amostra pequena, só para conferência visual — não a lista inteira.
      amostraCriar: decisoes.filter((d) => d.acao === "criar").slice(0, 3).map((d) => d.imovel.titulo),
    });
  } catch (erro) {
    const mensagem = descreverErro(erro);
    logger.error("Falha no diagnóstico WordPress + Supabase", { mensagem });
    res.status(500).json({ erro: mensagem });
  }
}
