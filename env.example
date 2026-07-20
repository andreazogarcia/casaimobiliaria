import { IPropertySource } from "../../interfaces/IPropertySource.js";
import { Imovel } from "../../domain/Imovel.js";

/** Mock da origem — usado em testes e no desenvolvimento enquanto não temos credenciais reais do WP. */
export class WordPressConnectorMock implements IPropertySource {
  constructor(private imoveis: Imovel[] = []) {}

  async listarImoveis(): Promise<Imovel[]> {
    return this.imoveis;
  }

  /** Auxiliar de teste: simula uma alteração no site. */
  definirImoveis(imoveis: Imovel[]): void {
    this.imoveis = imoveis;
  }
}

export function criarImovelDeExemplo(overrides: Partial<Imovel> = {}): Imovel {
  return {
    idOrigem: "123",
    titulo: "Apartamento 2 quartos no Centro",
    descricao: "Ótimo apartamento, próximo a tudo.",
    tipo: "apartamento",
    finalidade: "venda",
    preco: 350000,
    quartos: 2,
    banheiros: 1,
    vagasGaragem: 1,
    areaM2: 65,
    endereco: { cidade: "Serra", bairro: "Laranjeiras" },
    fotos: ["https://casaimobiliariaes.com.br/wp-content/uploads/exemplo.jpg"],
    publicadoNaOrigem: true,
    ...overrides,
  };
}
