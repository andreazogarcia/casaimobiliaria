import { describe, it, expect, beforeEach } from "vitest";
import { SyncEngine } from "../sync/SyncEngine.js";
import { InMemorySyncStore } from "../storage/InMemorySyncStore.js";
import { OlxConnectorMock } from "../connectors/olx/OlxConnector.mock.js";
import { WordPressConnectorMock, criarImovelDeExemplo } from "../connectors/wordpress/WordPressConnector.mock.js";
import { ILogger } from "../interfaces/ILogger.js";

const loggerSilencioso: ILogger = { info: () => {}, warn: () => {}, error: () => {} };

describe("SyncEngine", () => {
  let origem: WordPressConnectorMock;
  let destino: OlxConnectorMock;
  let store: InMemorySyncStore;
  let engine: SyncEngine;

  beforeEach(() => {
    origem = new WordPressConnectorMock([]);
    destino = new OlxConnectorMock();
    store = new InMemorySyncStore();
    engine = new SyncEngine(origem, destino, store, loggerSilencioso);
  });

  it("publica um imóvel novo na primeira execução", async () => {
    origem.definirImoveis([criarImovelDeExemplo({ idOrigem: "1" })]);

    const resultado = await engine.executarCiclo();

    expect(resultado.criados).toBe(1);
    expect(resultado.atualizados).toBe(0);
    expect(resultado.removidos).toBe(0);
    expect(resultado.erros).toHaveLength(0);

    const registro = await store.buscarPorIdOrigem("1");
    expect(registro).not.toBeNull();
    expect(registro?.idDestino).toMatch(/^olx-/);
  });

  it("não reenvia um imóvel que não mudou entre dois ciclos", async () => {
    origem.definirImoveis([criarImovelDeExemplo({ idOrigem: "1" })]);
    await engine.executarCiclo();

    const resultadoSegundoCiclo = await engine.executarCiclo();

    expect(resultadoSegundoCiclo.criados).toBe(0);
    expect(resultadoSegundoCiclo.semAlteracao).toBe(1);
    expect(destino.chamadas.filter((c) => c.metodo === "publicar")).toHaveLength(1);
  });

  it("atualiza um imóvel quando o preço muda", async () => {
    origem.definirImoveis([criarImovelDeExemplo({ idOrigem: "1", preco: 300000 })]);
    await engine.executarCiclo();

    origem.definirImoveis([criarImovelDeExemplo({ idOrigem: "1", preco: 320000 })]);
    const resultado = await engine.executarCiclo();

    expect(resultado.atualizados).toBe(1);
    expect(destino.chamadas.filter((c) => c.metodo === "atualizar")).toHaveLength(1);
  });

  it("remove na OLX um imóvel que sumiu da origem", async () => {
    origem.definirImoveis([criarImovelDeExemplo({ idOrigem: "1" })]);
    await engine.executarCiclo();

    origem.definirImoveis([]); // imóvel removido/despublicado no WordPress
    const resultado = await engine.executarCiclo();

    expect(resultado.removidos).toBe(1);
    expect(await store.buscarPorIdOrigem("1")).toBeNull();
  });

  it("registra erro e continua processando os demais imóveis do ciclo", async () => {
    const destinoComFalha: typeof destino = new OlxConnectorMock();
    destinoComFalha.publicar = async (imovel) => {
      if (imovel.idOrigem === "2") return { sucesso: false, mensagemErro: "Erro simulado" };
      return { sucesso: true, idDestino: `olx-${imovel.idOrigem}` };
    };

    const engineComFalha = new SyncEngine(origem, destinoComFalha, store, loggerSilencioso);
    origem.definirImoveis([
      criarImovelDeExemplo({ idOrigem: "1" }),
      criarImovelDeExemplo({ idOrigem: "2" }),
    ]);

    const resultado = await engineComFalha.executarCiclo();

    expect(resultado.criados).toBe(1);
    expect(resultado.erros).toHaveLength(1);
    expect(resultado.erros[0]?.idOrigem).toBe("2");
  });
});
