/**
 * Carrega e valida as variáveis de ambiente necessárias. Falha rápido e
 * com mensagem clara se algo obrigatório estiver faltando — em vez de
 * deixar o erro estourar mais tarde, no meio de um ciclo de sync.
 */
function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

export const env = {
  wordpress: {
    apiUrl: obrigatoria("WP_API_URL"),
    usuario: obrigatoria("WP_USERNAME"),
    senhaAplicativo: obrigatoria("WP_PASSWORD"),
    // CONFIRMADO em /wp-json/wp/v2/types: post type real é "listivo_listing",
    // mas o rest_base (o que importa para a URL da API) é "listings".
    postType: process.env.WP_POST_TYPE ?? "listings",
  },
  olx: {
    clientId: obrigatoria("OLX_CLIENT_ID"),
    clientSecret: obrigatoria("OLX_CLIENT_SECRET"),
    redirectUri: obrigatoria("OLX_REDIRECT_URI"),
    accessToken: process.env.OLX_ACCESS_TOKEN, // ausente até completar o fluxo OAuth
  },
  /** Segredo compartilhado com o scheduler externo (cron-job.org, GitHub Actions etc.) que dispara /api/sync. */
  cronSecret: obrigatoria("CRON_SECRET"),
};
