// Ajustes de Tasking dentro del CRM: la IA es la misma clave de Google AI Studio
// que usa el asistente de gerencia; el correo sale por gestion1@ (n8n).
export interface Config {
  empresa: string;
  gemini_key: string | null;
  gemini_modelo: string | null;
}

export async function config(): Promise<Config> {
  return {
    empresa: "EFAMEINSA",
    gemini_key: process.env.TASKING_GEMINI_KEY || process.env.GOOGLE_AI_API_KEY || null,
    gemini_modelo: process.env.TASKING_GEMINI_MODELO || null,
  };
}

/** Clave con la que el programa de WhatsApp de la VM y el temporizador hablan con el CRM. */
export function claveServicio() {
  return process.env.TASKING_CLAVE || "";
}
