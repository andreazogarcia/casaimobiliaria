/**
 * Carrega e valida as variáveis de ambiente necessárias. Falha rápido e
 * com mensagem clara se algo obrigatório estiver faltando — mas só no
 * momento em que aquele grupo específico de variáveis é realmente usado
 * (por isso os getters abaixo, em vez de validar tudo de uma vez no
 * carregamento do módulo). Isso é importante porque nem toda rota usa
 * todas as variáveis: `/api/sync` só precisa de CRON_SECRET para checar
 * a autorização — só depois disso é que precisa das credenciais de
 * WordPress e OLX. Validar tudo de uma vez faria a checagem de
 * autorização falhar mesmo quando o problema real é só a falta de uma
 * credencial de um sistema que nem chegou a ser usado ainda.
 */
function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

export const env = {
  get wordpress() {
    return {
      apiUrl: obrigatoria("WP_API_URL"),
      usuario: obrigatoria("WP_USERNAME"),
      senhaAplicativo: obrigatoria("WP_PASSWORD"),
      // CONFIRMADO em /wp-json/wp/v2/types: post type real é "listivo_listing",
      // mas o rest_base (o que importa para a URL da API) é "listings".
      postType: process.env.WP_POST_TYPE ?? "listings",
    };
  },
  get olx() {
    return {
      clientId: obrigatoria("OLX_CLIENT_ID"),
      clientSecret: obrigatoria("OLX_CLIENT_SECRET"),
      redirectUri: obrigatoria("OLX_REDIRECT_URI"),
      accessToken: process.env.OLX_ACCESS_TOKEN, // ausente até completar o fluxo OAuth
    };
  },
  /** Segredo compartilhado com o scheduler externo (cron-job.org, GitHub Actions etc.) que dispara /api/sync. */
  get cronSecret() {
    return obrigatoria("CRON_SECRET");
  },
};
