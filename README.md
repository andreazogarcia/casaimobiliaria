import { createHash } from "node:crypto";
import { Imovel } from "../domain/Imovel.js";

/**
 * Gera um hash determinístico do conteúdo "relevante" de um imóvel —
 * ou seja, dos campos que, se mudarem, justificam reenviar o anúncio
 * para a OLX. Campos irrelevantes para o anúncio (ex: metadados internos
 * do WordPress) não entram aqui de propósito.
 */
export function calcularHashImovel(imovel: Imovel): string {
  const conteudoRelevante = {
    titulo: imovel.titulo,
    descricao: imovel.descricao,
    tipo: imovel.tipo,
    finalidade: imovel.finalidade,
    preco: imovel.preco,
    precoAdicional: imovel.precoAdicional ?? {},
    quartos: imovel.quartos ?? null,
    suites: imovel.suites ?? null,
    banheiros: imovel.banheiros ?? null,
    vagasGaragem: imovel.vagasGaragem ?? null,
    areaM2: imovel.areaM2 ?? null,
    endereco: imovel.endereco,
    fotos: imovel.fotos,
  };

  // JSON.stringify com chaves ordenadas manualmente para garantir que a
  // mesma "forma" de imóvel sempre produza o mesmo hash, independente
  // da ordem em que as propriedades vieram da origem.
  const jsonEstavel = JSON.stringify(conteudoRelevante, Object.keys(conteudoRelevante).sort());

  return createHash("sha256").update(jsonEstavel).digest("hex");
}
