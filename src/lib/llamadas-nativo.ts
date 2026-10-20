/**
 * LA CARA DEL CRM PARA EL BOTÓN «LLAMAR» DE LA APP DE ANDROID (Santos, 19-10-2026).
 *
 * El plugin nativo `Llamadas` (repo Efameinsa/crm-app-movil, `android/.../llamadas/`)
 * marca con el chip del plan corporativo, graba la llamada, la empareja con el
 * registro de llamadas del celular y la sube a /api/llamadas. Existe solo dentro
 * de la app y solo desde la versión que lo trae; en el navegador y en la PWA
 * `plugin()` devuelve null y el botón cae a `tel:` (sin audio).
 */

export type EstadoGrabacion =
  /** Todo listo: la llamada se graba con las dos voces. */
  | "lista"
  /** Falta algo que la persona puede hacer (permiso, activar la grabación): ver `motivo`. */
  | "falta_permiso"
  /** Este celular no puede grabar: se llama igual, sin audio. */
  | "no_disponible";

export interface EstadoLlamadas {
  instalacionId: string;
  version: string;
  grabacion: EstadoGrabacion;
  /** Qué falta, en palabras para la persona. */
  motivo: string | null;
  /** ¿Aceptó el aviso de grabación vigente? */
  consentimiento: boolean;
  /** Llamadas guardadas en el celular que todavía no recibió el CRM. */
  pendientes: number;
}

export interface ConfigLlamadas {
  /** https://crm.efameinsa.com */
  urlBase: string;
  /** El token del celular (el mismo de `dispositivos_campo` que usa el GPS). */
  token: string;
}

export interface LlamarOpciones {
  /** El uuid lo genera la pantalla: reintentar no duplica la llamada. */
  id: string;
  numero: string;
  cuentaId?: string;
  contactoId?: string;
}

export interface LlamadasPlugin {
  estado(): Promise<EstadoLlamadas>;
  configurar(config: ConfigLlamadas): Promise<EstadoLlamadas>;
  /** Marca el número y deja la grabación corriendo. Vuelve apenas se marca. */
  llamar(opciones: LlamarOpciones): Promise<{ iniciada: boolean }>;
  /** Abre los ajustes que hagan falta (permiso de teléfono, grabación). */
  pedirPermiso(): Promise<EstadoLlamadas>;
}

/**
 * El plugin, o null si no es la app o es una versión sin botón de llamadas.
 * Devuelve un objeto común que solo delega: lo que entrega `registerPlugin` es un
 * proxy que contesta a cualquier nombre (también `.then`) y rompería la promesa
 * (ver la misma trampa en rastreo-nativo.ts).
 */
export async function plugin(): Promise<LlamadasPlugin | null> {
  if (typeof navigator === "undefined" || !/EfameinsaApp\//.test(navigator.userAgent)) return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isPluginAvailable("Llamadas")) return null;
  const nativo = registerPlugin<LlamadasPlugin>("Llamadas");
  return {
    estado: () => nativo.estado(),
    configurar: (config) => nativo.configurar(config),
    llamar: (opciones) => nativo.llamar(opciones),
    pedirPermiso: () => nativo.pedirPermiso(),
  };
}

/** Lo que el cuadro «¿Cómo te fue?» le cuenta al CRM cuando se llamó desde el navegador. */
export interface LlamadaDeNavegador {
  id: string;
  numero: string;
  iniciadaAt: Date;
  duracionS: number;
  cuentaId?: string;
  contactoId?: string;
}

/** Anota una llamada hecha con `tel:`: sin audio, con lo que la persona dice que pasó. */
export async function registrarDesdeNavegador(l: LlamadaDeNavegador): Promise<boolean> {
  const respuesta = await fetch("/api/llamadas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: l.id,
      numero: l.numero,
      iniciada_at: l.iniciadaAt.toISOString(),
      duracion_s: Math.max(0, Math.round(l.duracionS)),
      origen: "pwa",
      ...(l.cuentaId ? { cuenta_id: l.cuentaId } : {}),
      ...(l.contactoId ? { contacto_id: l.contactoId } : {}),
    }),
  }).catch(() => null);
  return Boolean(respuesta?.ok);
}
