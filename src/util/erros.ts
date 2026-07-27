/**
 * Extrai uma mensagem de erro legível, incluindo a `cause` quando
 * disponível. Isso importa especialmente para erros de `fetch()`: o
 * Node lança um TypeError genérico com mensagem "fetch failed", e o
 * motivo real (DNS, conexão recusada, certificado, timeout etc.) fica
 * escondido dentro de `error.cause` — sem isso, o log não dá nenhuma
 * pista real do que aconteceu.
 */
export function descreverErro(erro: unknown): string {
  if (!(erro instanceof Error)) {
    return String(erro);
  }

  const partes = [erro.message];

  // `cause` não é tipado no TS por padrão como propriedade de Error em
  // todas as versões de lib — acesso via index para não depender disso.
  const causa = (erro as { cause?: unknown }).cause;
  if (causa !== undefined) {
    const causaTexto = causa instanceof Error ? causa.message : JSON.stringify(causa);
    partes.push(`causa: ${causaTexto}`);
  }

  return partes.join(" | ");
}
