import type { VercelRequest, VercelResponse } from "@vercel/node";
import { WordPressConnector } from "../src/connectors/wordpress/WordPressConnector.js";
import { ConsoleLogger } from "../src/logging/ConsoleLogger.js";
import { env } from "../src/config/env.js";

/**
 * GET /api/debug-wp
 *
 * Rota de diagnóstico: testa SÓ a leitura do WordPress, sem precisar de
 * nenhuma credencial da OLX. Útil para validar a conexão e o mapeamento
 * de campos antes de termos o access_token da OLX disponível.
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

    const imoveis = await origem.listarImoveis();

    res.status(200).json({
      totalEncontrado: imoveis.length,
      primeiros3: imoveis.slice(0, 3),
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("Falha ao ler WordPress", { mensagem });
    res.status(500).json({ erro: mensagem });
  }
}
