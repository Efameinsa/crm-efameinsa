import Anthropic from "@anthropic-ai/sdk";

/**
 * LA CONEXIÓN CON CLAUDE (desde el 14-10-2026; antes era Google AI Studio).
 *
 * Santos lo decidió así: Claude Opus 5.5 con esfuerzo medio. El nivel gratuito
 * de Google no servía para esto —20 preguntas al día por modelo y entre 27 y 100
 * segundos por respuesta— y el asistente ya no es solo de gerencia: lo usa
 * todo el personal.
 *
 * LA LLAVE NO SALE DEL SERVIDOR. Va en las variables del servidor
 * (ANTHROPIC_API_KEY) y nunca viaja al navegador.
 *
 * EL WORKSPACE. Una llave de usuario de Claude Console (`sk-ant-usr-…`) no está
 * atada a un workspace y la API exige decir a cuál se carga cada consulta. Si
 * la llave es de workspace (`sk-ant-api…`) no hace falta, y ANTHROPIC_WORKSPACE_ID
 * se deja vacío.
 */

export const MODELO = process.env.ASISTENTE_MODELO || "claude-opus-5-5";

/**
 * ESFUERZO MEDIO. Lo eligió Santos. En Opus 5.5 el pensamiento no se puede
 * apagar; el esfuerzo es lo que regula cuánto piensa antes de contestar y, con
 * eso, cuánto tarda y cuánto cuesta.
 */
export const ESFUERZO = (process.env.ASISTENTE_ESFUERZO || "medium") as "low" | "medium" | "high";

/**
 * Precios en US$ por millón de tokens (lista de Anthropic, 10-2026). Solo
 * sirven para la columna «costo» de la auditoría: la factura real es la de
 * Claude Console.
 */
const PRECIOS: Record<string, { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }> = {
  "claude-opus-5-5": { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
};
const PRECIO = PRECIOS[MODELO] ?? PRECIOS["claude-opus-5-5"];

export function costoUsd(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): number {
  const m = 1_000_000;
  return (
    (u.input_tokens * PRECIO.entrada) / m +
    (u.output_tokens * PRECIO.salida) / m +
    ((u.cache_read_input_tokens ?? 0) * PRECIO.cacheLectura) / m +
    ((u.cache_creation_input_tokens ?? 0) * PRECIO.cacheEscritura) / m
  );
}

let cliente: Anthropic | null = null;

export function clienteClaude(): Anthropic {
  if (cliente) return cliente;
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  cliente = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Un reintento basta: quien pregunta está esperando y la SDK ya reintenta
    // los 429/5xx. Tres reintentos de 60 s son tres minutos con la pantalla quieta.
    maxRetries: 1,
    timeout: 90_000,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  });
  return cliente;
}

/**
 * EL INTERRUPTOR. Encendido si hay llave y nadie lo apagó a mano:
 * ASISTENTE_ACTIVO=0 lo apaga sin borrar la credencial, que volver a pegarla es
 * una oportunidad de equivocarse.
 */
export function asistenteEncendido(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  return process.env.ASISTENTE_ACTIVO !== "0" && process.env.ASISTENTE_ACTIVO !== "false";
}

/** Lo que Anthropic contesta, contado para quien está frente a la pantalla. */
export function errorEnCastellano(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return "La llave del asistente no es válida o no tiene permiso. Hay que revisarla en la configuración.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Hay muchas consultas al mismo tiempo. Espere unos segundos y vuelva a preguntar.";
  }
  if (e instanceof Anthropic.BadRequestError && /credit|billing|balance|spend/i.test(e.message)) {
    return "Se acabó el saldo de la cuenta de Claude. Avise a sistemas.";
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return "Claude tardó demasiado en responder. Vuelva a intentar.";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "No se pudo hablar con Claude. Revise la conexión y vuelva a intentar.";
  }
  if (e instanceof Anthropic.InternalServerError) {
    return "El servicio de Claude tuvo un problema momentáneo. Vuelva a intentar.";
  }
  return "No se pudo consultar. Vuelva a intentar en un momento.";
}
