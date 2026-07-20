import { Imovel } from "../domain/Imovel.js";

/** Resultado de uma operação de publicação/atualização/remoção no destino. */
export interface ResultadoPublicacao {
  sucesso: boolean;
  /** ID do anúncio no destino (ex: OLX), quando aplicável. */
  idDestino?: string;
  mensagemErro?: string;
}

/**
 * Contrato que qualquer destino de anúncios precisa cumprir.
 * Hoje é implementado pelo OlxConnector. Um segundo portal (ex: ZAP,
 * VivaReal) implementaria a mesma interface sem alterar o SyncEngine.
 */
export interface IPropertyDestination {
  publicar(imovel: Imovel): Promise<ResultadoPublicacao>;
  atualizar(idDestino: string, imovel: Imovel): Promise<ResultadoPublicacao>;
  remover(idDestino: string): Promise<ResultadoPublicacao>;
}
