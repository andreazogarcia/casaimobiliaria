import { ILogger } from "../../interfaces/ILogger";

export interface OlxOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
}

/**
 * Cliente OAuth2 da API olx.com.br, seguindo o fluxo documentado em
 * https://developers.olx.com.br/anuncio/api/oauth.html
 *
 * A troca do "code" inicial por um access_token só acontece uma vez,
 * manualmente, durante a autorização da conta do dono da imobiliária.
 * Depois disso, esta classe cuida só de manter o token válido.
 */
export class OlxOAuthClient {
  private static readonly AUTH_HOST = "https://auth.olx.com.br";

  private accessToken: string | null = null;

  constructor(
    private readonly config: OlxOAuthConfig,
    private readonly logger: ILogger,
    /** Token inicial, se já obtido fora deste processo (ex: salvo em variável de ambiente). */
    tokenInicial?: string
  ) {
    this.accessToken = tokenInicial ?? null;
  }

  /** Monta a URL para a qual o usuário (dono da conta OLX) deve ser redirecionado para autorizar a aplicação. */
  montarUrlAutorizacao(scopes: string[], state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(" "),
    });
    if (state) params.set("state", state);

    return `${OlxOAuthClient.AUTH_HOST}/oauth?${params.toString()}`;
  }

  /** Troca o "code" recebido no callback por um access_token. Chamado uma única vez pela rota /api/oauth/callback. */
  async trocarCodigoPorToken(code: string): Promise<string> {
    const resposta = await fetch(`${OlxOAuthClient.AUTH_HOST}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(`Falha ao trocar code por token OLX: HTTP ${resposta.status} - ${corpo}`);
    }

    const dados = (await resposta.json()) as TokenResponse;
    this.accessToken = dados.access_token;
    this.logger.info("Token de acesso OLX obtido com sucesso");
    return dados.access_token;
  }

  obterTokenAtual(): string {
    if (!this.accessToken) {
      throw new Error(
        "Nenhum access_token OLX disponível. É necessário completar o fluxo de autorização (ver /api/oauth/authorize) antes de usar o OlxConnector."
      );
    }
    return this.accessToken;
  }
}
