import { ILogger } from "../interfaces/ILogger.js";

/**
 * Logger estruturado simples, em JSON por linha — formato fácil de
 * consultar depois em qualquer serviço de log (Vercel, Datadog, etc.).
 * Troque por outra implementação de ILogger se quiser um provedor externo.
 */
export class ConsoleLogger implements ILogger {
  info(mensagem: string, contexto: Record<string, unknown> = {}): void {
    this.log("info", mensagem, contexto);
  }

  warn(mensagem: string, contexto: Record<string, unknown> = {}): void {
    this.log("warn", mensagem, contexto);
  }

  error(mensagem: string, contexto: Record<string, unknown> = {}): void {
    this.log("error", mensagem, contexto);
  }

  private log(nivel: string, mensagem: string, contexto: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        nivel,
        mensagem,
        ...contexto,
      })
    );
  }
}
