import { IPropertyDestination, ResultadoPublicacao } from "../../interfaces/IPropertyDestination.js";
import { Imovel } from "../../domain/Imovel.js";
import { OlxOAuthClient } from "./OlxOAuthClient.js";
import { ILogger } from "../../interfaces/ILogger.js";

const IMPORT_URL = "https://apps.olx.com.br/autoupload/import";

/**
 * Conector real do destino OLX, via API de Importação de Anúncios.
 * Fluxo documentado em https://developers.olx.com.br/anuncio/api/import.html
 *
 * Pontos confirmados na documentação oficial:
 * - Endpoint único (https://apps.olx.com.br/autoupload/import), método PUT,
 *   Content-Type: application/json, payload máximo de 1 MB.
 * - O payload é sempre uma lista `ad_list`, cada item com `id` e `operation`
 *   ("insert" ou "delete"). Se o `id` já existir na base da OLX, a OLX trata
 *   automaticamente como edição — não existe operação "update" separada.
 * - A resposta é ASSÍNCRONA: a chamada retorna um token, e o resultado real
 *   (aceito/recusado/erro) só é conhecido consultando esse token depois
 *   (ver `consultarStatusImportacao`).
 *
 * PENDENTE DE CONFIRMAÇÃO antes de produção: os campos específicos da
 * categoria "Imóveis" dentro de `params` (código da categoria, campos
 * obrigatórios por subcategoria) — ver
 * https://developers.olx.com.br/anuncio/api/real_estate/home.html
 * Os nomes de campo abaixo são um esqueleto, não a lista final validada.
 */
export class OlxConnector implements IPropertyDestination {
  constructor(
    private readonly oauth: OlxOAuthClient,
    private readonly logger: ILogger
  ) {}

  async publicar(imovel: Imovel): Promise<ResultadoPublicacao> {
    return this.enviarOperacao(imovel.idOrigem, "insert", imovel);
  }

  async atualizar(idDestino: string, imovel: Imovel): Promise<ResultadoPublicacao> {
    // Conforme a documentação, reenviar "insert" com o mesmo id é tratado
    // pela OLX como edição — não há operação distinta para update.
    return this.enviarOperacao(idDestino, "insert", imovel);
  }

  async remover(idDestino: string): Promise<ResultadoPublicacao> {
    return this.enviarOperacao(idDestino, "delete");
  }

  private async enviarOperacao(
    idAnuncio: string,
    operation: "insert" | "delete",
    imovel?: Imovel
  ): Promise<ResultadoPublicacao> {
    const anuncio =
      operation === "delete"
        ? { id: idAnuncio, operation }
        : { id: idAnuncio, operation, ...this.mapearParaPayloadOlx(imovel!) };

    const resposta = await fetch(IMPORT_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: this.oauth.obterTokenAtual(),
        ad_list: [anuncio],
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text();
      return { sucesso: false, mensagemErro: `HTTP ${resposta.status} - ${corpo}` };
    }

    const dados = (await resposta.json()) as { token?: string };
    if (!dados.token) {
      return { sucesso: false, mensagemErro: "Resposta da OLX não retornou token de importação" };
    }

    // A importação é assíncrona: aqui só confirmamos que a OLX aceitou o
    // envio para a fila. O status real (accepted/refused/error) deve ser
    // consultado depois via `consultarStatusImportacao`, tipicamente no
    // próximo ciclo de sync ou por um job de verificação separado.
    this.logger.info("Anúncio enviado à fila de importação da OLX", { idAnuncio, operation, token: dados.token });

    return { sucesso: true, idDestino: idAnuncio };
  }

  /** Consulta o resultado real de um envio anterior — chamar com o token retornado por enviarOperacao. */
  async consultarStatusImportacao(token: string): Promise<unknown> {
    const resposta = await fetch(`${IMPORT_URL}/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: this.oauth.obterTokenAtual() }),
    });

    if (!resposta.ok) {
      throw new Error(`Falha ao consultar status de importação OLX: HTTP ${resposta.status}`);
    }

    return resposta.json();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapearParaPayloadOlx(imovel: Imovel): Record<string, any> {
    return {
      category: this.mapearCategoria(imovel.tipo),
      subject: imovel.titulo,
      body: imovel.descricao,
      // Confirmado pela documentação: "s" = venda, "u" = locação.
      type: imovel.finalidade === "venda" ? "s" : "u",
      price: imovel.preco,
      zipcode: imovel.endereco.cep,
      images: imovel.fotos,
      params: this.mapearParametrosPorTipo(imovel),
    };
  }

  /**
   * Códigos de categoria confirmados em
   * https://developers.olx.com.br/anuncio/api/real_estate/home.html
   *
   * cobertura -> mapeada dentro de "apartamento" (1020), com
   * apartment_type=2 ("Cobertura"), pois a OLX não tem categoria própria
   * para cobertura — é um subtipo de apartamento.
   * loja/sala/galpao/ponto -> mapeados para "Comércio e indústria" (1120),
   * já que a OLX agrupa todos os imóveis comerciais numa única categoria.
   * chacara -> mapeada para "Terrenos, sítios e fazendas" (1100).
   *
   * PENDENTE: confirmar os parâmetros específicos de "Comércio e indústria"
   * e "Terrenos, sítios e fazendas" (ainda não pesquisados) antes de usar
   * essas subcategorias em produção — só "Apartamentos" e "Casas" foram
   * validados até agora contra a documentação oficial.
   */
  private mapearCategoria(tipo: Imovel["tipo"]): number {
    const mapa: Record<Imovel["tipo"], number> = {
      apartamento: 1020,
      cobertura: 1020,
      casa: 1040,
      terreno: 1100,
      chacara: 1100,
      loja: 1120,
      sala: 1120,
      galpao: 1120,
      ponto: 1120,
    };
    return mapa[tipo];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapearParametrosPorTipo(imovel: Imovel): Record<string, any> {
    const base = {
      rooms: String(imovel.quartos ?? 0),
      bathrooms: imovel.banheiros !== undefined ? String(imovel.banheiros) : undefined,
      garage_spaces: imovel.vagasGaragem !== undefined ? String(imovel.vagasGaragem) : undefined,
      size: imovel.areaM2 !== undefined ? String(imovel.areaM2) : undefined,
      iptu: imovel.precoAdicional?.iptu !== undefined ? String(imovel.precoAdicional.iptu) : undefined,
      condominio: imovel.precoAdicional?.condominio !== undefined ? String(imovel.precoAdicional.condominio) : undefined,
    };

    // Validado contra a documentação oficial (sub_apartment.html / sub_house.html).
    if (imovel.tipo === "apartamento" || imovel.tipo === "cobertura") {
      return { ...base, apartment_type: imovel.tipo === "cobertura" ? "2" : "1" };
    }
    if (imovel.tipo === "casa") {
      return { ...base, home_type: "1" };
    }

    // TODO: comércio/terreno/chácara ainda não têm os parâmetros
    // específicos validados contra a documentação — enviar só o básico
    // por enquanto e revisar antes de ativar esses tipos em produção.
    return base;
  }
}
