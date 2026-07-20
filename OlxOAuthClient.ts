export interface ILogger {
  info(mensagem: string, contexto?: Record<string, unknown>): void;
  warn(mensagem: string, contexto?: Record<string, unknown>): void;
  error(mensagem: string, contexto?: Record<string, unknown>): void;
}
