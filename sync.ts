import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OlxOAuthClient } from "../../src/connectors/olx/OlxOAuthClient.js";
import { ConsoleLogger } from "../../src/logging/ConsoleLogger.js";
import { env } from "../../src/config/env.js";

/**
 * GET /api/oauth/callback
 *
 * Este é o `redirect_uri` que deve ser registrado junto à OLX no e-mail
 * de registro da aplicação. A OLX redireciona o navegador para cá após
 * o dono da conta autorizar o acesso, incluindo um `code` na query string.
 *
 * IMPORTANTE: o access_token retornado aqui precisa ser guardado com
 * segurança (ex: variável de ambiente da Vercel ou tabela no banco
 * persistente de produção) — não fica salvo automaticamente em lugar
 * nenhum. Nesta primeira versão, ele é apenas exibido na tela para ser
 * copiado manualmente, dado o baixo volume de vezes que isso acontece
 * (uma vez, na configuração inicial).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const logger = new ConsoleLogger();
  const code = req.query.code;

  if (!code || typeof code !== "string") {
    res.status(400).send("Parâmetro 'code' ausente ou inválido no callback da OLX.");
    return;
  }

  try {
    const oauth = new OlxOAuthClient(
      { clientId: env.olx.clientId, clientSecret: env.olx.clientSecret, redirectUri: env.olx.redirectUri },
      logger
    );

    const accessToken = await oauth.trocarCodigoPorToken(code);
    res
      .status(200)
      .send(
        `Autorização concluída. Copie o access_token abaixo e salve-o como variável de ambiente OLX_ACCESS_TOKEN:\n\n${accessToken}`
      );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    logger.error("Falha ao trocar code por access_token", { mensagem });
    res.status(500).send(`Falha na autorização: ${mensagem}`);
  }
}
