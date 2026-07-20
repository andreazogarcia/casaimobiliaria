/**
 * Modelo de domínio do Imóvel — agnóstico de WordPress/Listivo e de OLX.
 *
 * Esta é a "moeda comum" do Hub: o WordPressConnector traduz o dado bruto
 * do Listivo para este formato, e o OlxConnector traduz este formato para
 * o payload esperado pela API da OLX. Nenhum dos dois conhece o outro.
 *
 * Isso é o que permite trocar a origem (outro CRM) ou o destino
 * (outro portal imobiliário) no futuro sem tocar no motor de sincronização.
 */

export type TipoImovel =
  | "apartamento"
  | "casa"
  | "cobertura"
  | "chacara"
  | "terreno"
  | "loja"
  | "sala"
  | "galpao"
  | "ponto";

export type FinalidadeImovel = "venda" | "locacao";

export interface Endereco {
  cidade: string;
  bairro: string;
  logradouro?: string;
  cep?: string;
  latitude?: number;
  longitude?: number;
}

export interface Imovel {
  /** ID estável na origem (ex: ID do post no WordPress). Nunca muda. */
  idOrigem: string;

  titulo: string;
  descricao: string;
  tipo: TipoImovel;
  finalidade: FinalidadeImovel;

  preco: number;
  /** Condomínio, IPTU etc. Mantido separado do preço principal. */
  precoAdicional?: Record<string, number>;

  quartos?: number;
  suites?: number;
  banheiros?: number;
  vagasGaragem?: number;
  areaM2?: number;

  endereco: Endereco;

  /** URLs públicas das fotos, na ordem em que devem aparecer no anúncio. */
  fotos: string[];

  /** Timestamp da última modificação na origem, se disponível. */
  atualizadoEmOrigem?: string;

  /** Indica se o imóvel está publicado/visível na origem. */
  publicadoNaOrigem: boolean;
}

/**
 * Estado de um imóvel dentro do ciclo de sincronização — não é o Imovel em
 * si, é a decisão que o motor de diff tomou para ele em um determinado ciclo.
 */
export type AcaoSincronizacao = "criar" | "atualizar" | "remover" | "sem_alteracao";

export interface DecisaoSincronizacao {
  imovel: Imovel;
  acao: AcaoSincronizacao;
  motivo: string;
}
