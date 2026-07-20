import type { VercelRequest, VercelResponse } from "@vercel/node";
import { OlxOAuthClient } from "../../src/connectors/olx/OlxOAuthClient";
import { ConsoleLogger } from "../../src/logging/ConsoleLogger";
import { env } from "../../src/config/env";

/**
 * GET /api/oauth/authorize
 *
 * Ponto de partida do fluxo OAuth2 da OLX: o dono da conta OLX PRO acessa
 * esta URL (uma única vez, manualmente) para autorizar o Hub a publicar
 * anúncios em nome dele. Ele será redirecionado para o login da OLX e,
 * ao aprovar, a OLX chama de volta /api/oauth/callback.
 */
export default function handler(req: VercelRequest, res: VercelResponse): void {
  try {
    const oauth = new OlxOAuthClient(
      { clientId: env.olx.clientId, clientSecret: env.olx.clientSecret, redirectUri: env.olx.redirectUri },
      new ConsoleLogger()
    );

    // Escopo "autoupload" é o único necessário para o escopo da Sprint 1
    // (publicar/atualizar/remover anúncios). Não solicitar "autoservice"
    // nem "chat" agora — ficam para uma eventual V2 de leads.
    const urlAutorizacao = oauth.montarUrlAutorizacao(["autoupload"]);
    res.redirect(302, urlAutorizacao);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    res.status(500).send(`Configuração ausente: ${mensagem}`);
  }
}
