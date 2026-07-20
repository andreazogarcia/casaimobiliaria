import { IPropertyDestination, ResultadoPublicacao } from "../../interfaces/IPropertyDestination.js";
import { Imovel } from "../../domain/Imovel.js";

/** Mock do destino — usado em testes e no desenvolvimento enquanto não temos credenciais reais da OLX. */
export class OlxConnectorMock implements IPropertyDestination {
  chamadas: { metodo: string; args: unknown[] }[] = [];
  private contador = 0;

  async publicar(imovel: Imovel): Promise<ResultadoPublicacao> {
    this.chamadas.push({ metodo: "publicar", args: [imovel.idOrigem] });
    return { sucesso: true, idDestino: `olx-${++this.contador}` };
  }

  async atualizar(idDestino: string, imovel: Imovel): Promise<ResultadoPublicacao> {
    this.chamadas.push({ metodo: "atualizar", args: [idDestino, imovel.idOrigem] });
    return { sucesso: true, idDestino };
  }

  async remover(idDestino: string): Promise<ResultadoPublicacao> {
    this.chamadas.push({ metodo: "remover", args: [idDestino] });
    return { sucesso: true, idDestino };
  }
}
