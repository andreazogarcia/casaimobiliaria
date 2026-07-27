import { IPropertySource } from "../interfaces/IPropertySource.js";
import { IPropertyDestination } from "../interfaces/IPropertyDestination.js";
import { ISyncStore } from "../interfaces/ISyncStore.js";
import { ILogger } from "../interfaces/ILogger.js";
import { calcularHashImovel } from "./HashUtil.js";
import { DecisaoSincronizacao } from "../domain/Imovel.js";
import { descreverErro } from "../util/erros.js";

export interface ItemProcessado {
  idOrigem: string;
  idDestino?: string;
  titulo: string;
  cidade: string;
  bairro: string;
  acao: Exclude<DecisaoSincronizacao["acao"], "sem_alteracao">;
  sucesso: boolean;
}

export interface ResultadoCicloSync {
  totalNaOrigem: number;
  criados: number;
  atualizados: number;
  removidos: number;
  semAlteracao: number;
  erros: { idOrigem: string; mensagem: string }[];
  /**
   * Detalhe de cada imóvel efetivamente tocado neste ciclo (não inclui
   * os "sem_alteracao") — pensado para conseguir identificar, na tela da
   * OLX, exatamente quais anúncios foram publicados/atualizados/removidos
   * nesta chamada específica, já que a OLX não expõe nenhuma marcação
   * própria de "veio do Hub".
   */
  processados: ItemProcessado[];
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

  /**
   * Executa as decisões do ciclo, chamando o destino e atualizando o store.
   *
   * @param limiteMudancas Trava de segurança opcional: limita quantas
   * decisões de "criar"/"atualizar"/"remover" são de fato executadas
   * nesta chamada (decisões "sem_alteracao" não contam pro limite, já
   * que não fazem nenhuma chamada ao destino). Útil para o primeiro
   * teste real contra uma conta de produção — evita publicar o catálogo
   * inteiro de uma vez antes de confirmar que está tudo certo em uma
   * amostra pequena. Sem limite, processa tudo.
   */
  async executarCiclo(limiteMudancas?: number): Promise<ResultadoCicloSync> {
    const decisoesCompletas = await this.planejarCiclo();

    let mudancasIncluidas = 0;
    const decisoes = decisoesCompletas.filter((d) => {
      if (d.acao === "sem_alteracao") return true;
      if (limiteMudancas === undefined || mudancasIncluidas < limiteMudancas) {
        mudancasIncluidas++;
        return true;
      }
      return false;
    });

    const resultado: ResultadoCicloSync = {
      totalNaOrigem: decisoesCompletas.filter((d) => d.acao !== "remover").length,
      criados: 0,
      atualizados: 0,
      removidos: 0,
      semAlteracao: 0,
      erros: [],
      processados: [],
    };

    for (const decisao of decisoes) {
      try {
        await this.executarDecisao(decisao, resultado);
      } catch (erro) {
        const mensagem = descreverErro(erro);
        this.logger.error("Falha ao processar imóvel", { idOrigem: decisao.imovel.idOrigem, mensagem });
        resultado.erros.push({ idOrigem: decisao.imovel.idOrigem, mensagem });
        if (decisao.acao !== "sem_alteracao") {
          resultado.processados.push({
            idOrigem: decisao.imovel.idOrigem,
            titulo: decisao.imovel.titulo ?? "(não disponível)",
            cidade: decisao.imovel.endereco?.cidade ?? "",
            bairro: decisao.imovel.endereco?.bairro ?? "",
            acao: decisao.acao,
            sucesso: false,
          });
        }
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
        resultado.processados.push({
          idOrigem: imovel.idOrigem,
          idDestino: resposta.idDestino,
          titulo: imovel.titulo,
          cidade: imovel.endereco.cidade,
          bairro: imovel.endereco.bairro,
          acao: "criar",
          sucesso: true,
        });
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
        resultado.processados.push({
          idOrigem: imovel.idOrigem,
          idDestino: registro.idDestino,
          titulo: imovel.titulo,
          cidade: imovel.endereco.cidade,
          bairro: imovel.endereco.bairro,
          acao: "atualizar",
          sucesso: true,
        });
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
        resultado.processados.push({
          idOrigem: imovel.idOrigem,
          idDestino: registro.idDestino,
          titulo: imovel.titulo ?? "(não disponível, imóvel já removido da origem)",
          cidade: imovel.endereco?.cidade ?? "",
          bairro: imovel.endereco?.bairro ?? "",
          acao: "remover",
          sucesso: true,
        });
        this.logger.info("Imóvel removido", { idOrigem: imovel.idOrigem, idDestino: registro.idDestino });
        break;
      }

      case "sem_alteracao":
        resultado.semAlteracao++;
        break;
    }
  }
}
