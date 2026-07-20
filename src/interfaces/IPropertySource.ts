import { Imovel } from "../domain/Imovel";

/**
 * Contrato que qualquer origem de imóveis precisa cumprir.
 * Hoje é implementado pelo WordPressConnector (Listivo). Se um dia a
 * imobiliária trocar de site ou de CRM, só se cria um novo Connector
 * que implementa esta interface — o resto do Hub não muda uma linha.
 */
export interface IPropertySource {
  /**
   * Retorna todos os imóveis publicados na origem, já normalizados
   * para o modelo de domínio comum.
   */
  listarImoveis(): Promise<Imovel[]>;
}
