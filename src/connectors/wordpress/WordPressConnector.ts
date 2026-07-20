import { IPropertySource } from "../../interfaces/IPropertySource";
import { Imovel, TipoImovel, FinalidadeImovel } from "../../domain/Imovel";
import { ILogger } from "../../interfaces/ILogger";

export interface WordPressConnectorConfig {
  /** Ex: https://casaimobiliariaes.com.br/wp-json */
  apiUrl: string;
  usuario: string;
  /** Application Password gerada em /wp-admin/profile.php — nunca a senha real da conta. */
  senhaAplicativo: string;
  /**
   * Rest_base do custom post type dos imóveis no Listivo. CONFIRMADO via
   * /wp-json/wp/v2/types: o post type interno chama-se "listivo_listing",
   * mas a URL da REST API usa o rest_base, que é "listings".
   */
  postType: string;
}

/**
 * IDs dos campos e taxonomias do Listivo, confirmados comparando 3 imóveis
 * reais (`GET /wp-json/wp/v2/listings`, imóveis #20444, #20406, #20370),
 * cruzando os valores dos campos com o texto das descrições de cada um.
 *
 * O Listivo expõe cada campo customizado como uma chave própria no JSON
 * do post, no formato `listivo_<id>` — tanto taxonomias (categorias,
 * cidade, bairro, comodidades) quanto campos "soltos" (preço, área,
 * fotos) usam esse mesmo padrão de nome, e só é possível diferenciar um
 * do outro pela lista `taxonomies` do post type (ver `/wp-json/wp/v2/types`).
 *
 * CONFIRMADO (taxonomias, valores já vêm como texto legível no JSON):
 * - listivo_14   -> Tipo de imóvel (ex: "Apartamento", "Apartamento garden")
 * - listivo_9031 -> Finalidade ("Locação" ou "Venda")
 * - listivo_9239 -> Cidade (ex: "Serra")
 * - listivo_9238 -> Bairro (ex: "Porto Canoa")
 * - listivo_4661 -> Comodidades do imóvel (lista)
 * - listivo_8987 -> Comodidades do condomínio (lista)
 *
 * CONFIRMADO (campos, não-taxonomia), por comparação cruzada com a
 * descrição em texto livre de 3 imóveis diferentes:
 * - listivo_145  -> galeria de fotos (array de URLs, já prontas para uso)
 * - listivo_130  -> preço, como texto formatado (ex: "R$2.400,00")
 * - listivo_338  -> quartos (bateu exato nos 3 imóveis: 2, 2, 3)
 * - listivo_8984 -> suítes (bateu exato nos 3 imóveis: 1, vazio, 1)
 * - listivo_339  -> banheiros, incluindo os de suíte (bateu exato em 2 dos
 *   3 — a terceira divergência é uma inconsistência entre o texto livre
 *   escrito pelo corretor e o campo estruturado, não um erro de mapeamento)
 * - listivo_8985 -> vagas de garagem (bateu nos 3: os imóveis sem menção
 *   a vaga no texto tinham valor 1 — padrão em apartamento, tão comum que
 *   o corretor não menciona — e o único com "2 vagas" destacado no texto
 *   tinha valor 2)
 * - listivo_340  -> área, como texto formatado (ex: "124m²"). Bate exato
 *   com o texto quando presente, mas fica vazio em pelo menos 1 imóvel —
 *   usar `listivo_8983` como fallback nesse caso (ver nota abaixo)
 *
 * AINDA EM ABERTO:
 * - listivo_8983 -> parece ser uma segunda medida de área (possivelmente
 *   área total/construída vs. `listivo_340` como área privativa/útil),
 *   mas em 1 dos 3 imóveis o valor é MENOR que o de listivo_340, o que
 *   quebraria essa hipótese (área construída deveria ser ≥ área privativa).
 *   Por ora, uso como fallback apenas quando listivo_340 vier vazio.
 * - listivo_9255 -> vazio nos 3 imóveis testados, sem nenhuma pista ainda
 *   sobre o que representa. Não mapeado.
 */
const CAMPO = {
  TIPO: "listivo_14",
  FINALIDADE: "listivo_9031",
  CIDADE: "listivo_9239",
  BAIRRO: "listivo_9238",
  FOTOS: "listivo_145",
  PRECO: "listivo_130",
  QUARTOS: "listivo_338",
  SUITES: "listivo_8984",
  BANHEIROS: "listivo_339",
  VAGAS_GARAGEM: "listivo_8985",
  AREA: "listivo_340",
  AREA_FALLBACK: "listivo_8983",
} as const;

/** Mapeia o texto da taxonomia "Tipo de imóvel" do Listivo para o enum interno. */
function mapearTipo(valores: string[]): TipoImovel {
  const primeiro = (valores[0] ?? "").toLowerCase();
  if (primeiro.includes("cobertura")) return "cobertura";
  if (primeiro.includes("apartamento")) return "apartamento";
  if (primeiro.includes("chácara") || primeiro.includes("chacara")) return "chacara";
  if (primeiro.includes("terreno") || primeiro.includes("lote")) return "terreno";
  if (primeiro.includes("loja")) return "loja";
  if (primeiro.includes("sala")) return "sala";
  if (primeiro.includes("galpão") || primeiro.includes("galpao")) return "galpao";
  if (primeiro.includes("ponto")) return "ponto";
  return "casa";
}

function mapearFinalidade(valores: string[]): FinalidadeImovel {
  const primeiro = (valores[0] ?? "").toLowerCase();
  return primeiro.includes("loca") ? "locacao" : "venda";
}

/** Converte "R$2.400,00" (ou variações) para 2400.00 */
function parsePrecoFormatado(texto: string | undefined): number {
  if (!texto) return 0;
  const somenteNumeros = texto
    .replace(/[^\d,.-]/g, "") // remove "R$", espaços etc.
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // remove separador de milhar
    .replace(",", "."); // vírgula decimal -> ponto
  return Number(somenteNumeros) || 0;
}

/** Converte "64m²" (ou variações) para 64 */
function parseAreaFormatada(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  const numero = texto.replace(/[^\d,.-]/g, "").replace(",", ".");
  const valor = Number(numero);
  return Number.isFinite(valor) ? valor : undefined;
}

function parseNumeroSimples(texto: string | undefined): number | undefined {
  if (texto === undefined || texto === "") return undefined;
  const valor = Number(texto);
  return Number.isFinite(valor) ? valor : undefined;
}

/**
 * Conector real da origem WordPress/Listivo, via REST API
 * (`GET /wp-json/wp/v2/listings`), autenticado com Application Password.
 */
export class WordPressConnector implements IPropertySource {
  constructor(
    private readonly config: WordPressConnectorConfig,
    private readonly logger: ILogger
  ) {}

  async listarImoveis(): Promise<Imovel[]> {
    const imoveis: Imovel[] = [];
    let pagina = 1;
    const porPagina = 50;

    while (true) {
      const url = `${this.config.apiUrl}/wp/v2/${this.config.postType}?page=${pagina}&per_page=${porPagina}&status=publish`;
      const resposta = await fetch(url, { headers: this.montarHeadersAuth() });

      if (resposta.status === 400 && pagina > 1) {
        // WP retorna 400 quando a página pedida excede o total — sinal de que já lemos tudo.
        break;
      }
      if (!resposta.ok) {
        throw new Error(`Falha ao consultar WordPress REST API: HTTP ${resposta.status}`);
      }

      const postsBrutos = (await resposta.json()) as unknown[];
      if (postsBrutos.length === 0) break;

      for (const postBruto of postsBrutos) {
        try {
          imoveis.push(this.mapearParaImovel(postBruto));
        } catch (erro) {
          const mensagem = erro instanceof Error ? erro.message : String(erro);
          this.logger.warn("Falha ao mapear imóvel do WordPress, ignorando este post", { mensagem });
        }
      }

      if (postsBrutos.length < porPagina) break;
      pagina++;
    }

    return imoveis;
  }

  private montarHeadersAuth(): HeadersInit {
    const credencial = Buffer.from(`${this.config.usuario}:${this.config.senhaAplicativo}`).toString("base64");
    return { Authorization: `Basic ${credencial}` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapearParaImovel(postBruto: any): Imovel {
    const campo = (id: string): string[] => postBruto[id] ?? [];

    return {
      idOrigem: String(postBruto.id),
      titulo: this.limparHtml(postBruto.title?.rendered ?? ""),
      descricao: this.limparHtml(postBruto.content?.rendered ?? ""),
      tipo: mapearTipo(campo(CAMPO.TIPO)),
      finalidade: mapearFinalidade(campo(CAMPO.FINALIDADE)),
      preco: parsePrecoFormatado(campo(CAMPO.PRECO)[0]),
      quartos: parseNumeroSimples(campo(CAMPO.QUARTOS)[0]),
      suites: parseNumeroSimples(campo(CAMPO.SUITES)[0]),
      banheiros: parseNumeroSimples(campo(CAMPO.BANHEIROS)[0]),
      vagasGaragem: parseNumeroSimples(campo(CAMPO.VAGAS_GARAGEM)[0]),
      // listivo_340 é a fonte primária de área; cai para listivo_8983
      // quando o imóvel não tiver o primeiro campo preenchido (ver nota
      // no bloco de documentação de CAMPO acima).
      areaM2: parseAreaFormatada(campo(CAMPO.AREA)[0] ?? campo(CAMPO.AREA_FALLBACK)[0]),
      endereco: {
        cidade: campo(CAMPO.CIDADE)[0] ?? "",
        bairro: campo(CAMPO.BAIRRO)[0] ?? "",
      },
      fotos: campo(CAMPO.FOTOS),
      atualizadoEmOrigem: postBruto.modified,
      publicadoNaOrigem: postBruto.status === "publish",
    };
  }

  private limparHtml(texto: string): string {
    return texto.replace(/<[^>]*>/g, "").trim();
  }
}
