import { IPropertySource } from "../interfaces/IPropertySource";
import { IPropertyDestination } from "../interfaces/IPropertyDestination";
import { ISyncStore } from "../interfaces/ISyncStore";
import { ILogger } from "../interfaces/ILogger";
import { calcularHashImovel } from "./HashUtil";
import { DecisaoSincronizacao } from "../domain/Imovel";

export interface ResultadoCicloSync {
  totalNaOrigem: number;
  criados: number;
  atualizados: number;
  removidos: number;
  semAlteracao: number;
  erros: { idOrigem: string; mensagem: string }[];
}

/**
 * Motor de sincronização — a única peça do Hub que depende diretamente
 * das três interfaces (origem, destino, store). Não conhece WordPress
 * nem OLX, só os contratos. Isso é o que permite testar o ciclo inteiro
 * com mocks, sem nenhuma credencial real.
 */
export class SyncEngine {
  constructor(
    private readonly origem: IPropertySource,
    private readonly destino: IPropertyDestination,
    private readonly store: ISyncStore,
    private readonly logger: ILogger
  ) {}

  /** Compara o estado atual da origem com o último estado sincronizado e decide a ação de cada imóvel. */
  async planejarCiclo(): Promise<DecisaoSincronizacao[]> {
    const imoveisNaOrigem = await this.origem.listarImoveis();
    const registrosSincronizados = await this.store.listarTodos();
    const idsJaSincronizados = new Set(registrosSincronizados.map((r) => r.idOrigem));
    const idsNaOrigem = new Set(imoveisNaOrigem.map((i) => i.idOrigem));

    const decisoes: DecisaoSincronizacao[] = [];

    for (const imovel of imoveisNaOrigem) {
      const registro = await this.store.buscarPorIdOrigem(imovel.idOrigem);
      const hashAtual = calcularHashImovel(imovel);

      if (!registro) {
        decisoes.push({ imovel, acao: "criar", motivo: "Imóvel novo, ainda não sincronizado" });
      } else if (registro.hashConteudo !== hashAtual) {
        decisoes.push({ imovel, acao: "atualizar", motivo: "Conteúdo do imóvel mudou desde o último sync" });
      } else {
        decisoes.push({ imovel, acao: "sem_alteracao", motivo: "Hash idêntico ao último sync" });
      }
    }

    // Imóveis que estavam sincronizados mas sumiram da origem -> remover no destino.
    for (const registro of registrosSincronizados) {
      if (!idsNaOrigem.has(registro.idOrigem)) {
        decisoes.push({
          // Objeto mínimo só para carregar o idOrigem até a execução; a ação "remover"
          // não usa o restante dos campos do imóvel.
          imovel: { idOrigem: registro.idOrigem } as DecisaoSincronizacao["imovel"],
          acao: "remover",
          motivo: "Imóvel não está mais publicado na origem",
        });
      }
    }

    return decisoes;
  }

  /** Executa as decisões do ciclo, chamando o destino e atualizando o store. */
  async executarCiclo(): Promise<ResultadoCicloSync> {
    const decisoes = await this.planejarCiclo();
    const resultado: ResultadoCicloSync = {
      totalNaOrigem: decisoes.filter((d) => d.acao !== "remover").length,
      criados: 0,
      atualizados: 0,
      removidos: 0,
      semAlteracao: 0,
      erros: [],
    };

    for (const decisao of decisoes) {
      try {
        await this.executarDecisao(decisao, resultado);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        this.logger.error("Falha ao processar imóvel", { idOrigem: decisao.imovel.idOrigem, mensagem });
        resultado.erros.push({ idOrigem: decisao.imovel.idOrigem, mensagem });
      }
    }

    this.logger.info("Ciclo de sincronização concluído", { ...resultado, erros: resultado.erros.length });
    return resultado;
  }

  private async executarDecisao(decisao: DecisaoSincronizacao, resultado: ResultadoCicloSync): Promise<void> {
    const { imovel, acao } = decisao;

    switch (acao) {
      case "criar": {
        const resposta = await this.destino.publicar(imovel);
        if (!resposta.sucesso || !resposta.idDestino) {
          throw new Error(resposta.mensagemErro ?? "Publicação falhou sem mensagem de erro");
        }
        await this.store.salvar({
          idOrigem: imovel.idOrigem,
          idDestino: resposta.idDestino,
          hashConteudo: calcularHashImovel(imovel),
          ultimaSincronizacaoEm: new Date().toISOString(),
        });
        resultado.criados++;
        this.logger.info("Imóvel publicado", { idOrigem: imovel.idOrigem, idDestino: resposta.idDestino });
        break;
      }

      case "atualizar": {
        const registro = await this.store.buscarPorIdOrigem(imovel.idOrigem);
        if (!registro) throw new Error("Registro de sync não encontrado para atualização");

        const resposta = await this.destino.atualizar(registro.idDestino, imovel);
        if (!resposta.sucesso) {
          throw new Error(resposta.mensagemErro ?? "Atualização falhou sem mensagem de erro");
        }
        await this.store.salvar({
          ...registro,
          hashConteudo: calcularHashImovel(imovel),
          ultimaSincronizacaoEm: new Date().toISOString(),
        });
        resultado.atualizados++;
        this.logger.info("Imóvel atualizado", { idOrigem: imovel.idOrigem, idDestino: registro.idDestino });
        break;
      }

      case "remover": {
        const registro = await this.store.buscarPorIdOrigem(imovel.idOrigem);
        if (!registro) throw new Error("Registro de sync não encontrado para remoção");

        const resposta = await this.destino.remover(registro.idDestino);
        if (!resposta.sucesso) {
          throw new Error(resposta.mensagemErro ?? "Remoção falhou sem mensagem de erro");
        }
        await this.store.remover(imovel.idOrigem);
        resultado.removidos++;
        this.logger.info("Imóvel removido", { idOrigem: imovel.idOrigem, idDestino: registro.idDestino });
        break;
      }

      case "sem_alteracao":
        resultado.semAlteracao++;
        break;
    }
  }
}
