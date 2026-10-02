/**
 * El servicio de GPS en segundo plano de la app de Android (plugin «Rastreo»).
 *
 * Santos (01-10-2026): sin Transistorsoft ni Traccar; el servicio es de la propia
 * app (repo Efameinsa/crm-app-movil, `android/.../rastreo/`). Esta es la cara
 * que ve el CRM: el plugin se llama con `registerPlugin('Rastreo')` y solo
 * existe dentro de la app, así que todo pasa por `plugin()`, que devuelve null
 * en el navegador y en versiones viejas de la app que no lo traen.
 */

export interface PermisosRastreo {
  /** Ubicación mientras la app se usa. */
  ubicacion: boolean;
  /** «Permitir todo el tiempo» (Android 10+): sin esto el GPS se corta al apagar la pantalla. */
  segundoPlano: boolean;
  /** Para mostrar el aviso fijo del servicio (Android 13+). */
  notificaciones: boolean;
  /** Sin la «optimización de batería»: Xiaomi, Samsung, etc. matan lo que la tiene. */
  bateriaLibre: boolean;
}

export interface EstadoRastreo {
  /** Lo genera la app al instalarse; identifica ESTE celular ante el CRM. */
  instalacionId: string;
  version: string;
  /** ¿Hay un rastreo configurado (con token) y encendido? */
  activo: boolean;
  /** ¿Corre el servicio en este momento? */
  corriendo: boolean;
  permisos: PermisosRastreo;
  /** Puntos guardados en el celular que todavía no recibió el CRM. */
  pendientes: number;
  /** Hora (ms) del último punto que el CRM confirmó, y del último que leyó el GPS. */
  ultimoEnvio: number | null;
  ultimoPunto: number | null;
  /** «desactivado» si gerencia lo apagó; el último fallo de red; null si todo va bien. */
  ultimoError: string | null;
}

export interface ConfigRastreo {
  /** https://crm.efameinsa.com/api/campo/osmand */
  url: string;
  token: string;
  intervaloSeg: number;
  distanciaM: number;
}

export type PermisoPedido = "ubicacion" | "segundoPlano" | "notificaciones" | "bateria";

export interface RastreoPlugin {
  estado(): Promise<EstadoRastreo>;
  iniciar(config: ConfigRastreo): Promise<EstadoRastreo>;
  detener(): Promise<void>;
  pedirPermiso(opciones: { cual: PermisoPedido }): Promise<EstadoRastreo>;
  /** Abre los ajustes de la app (donde se elige «Permitir todo el tiempo»). */
  abrirAjustes(): Promise<void>;
}

/**
 * El plugin, o null si no es la app o es una versión sin GPS propio.
 *
 * OJO (trampa de Capacitor): lo que devuelve `registerPlugin` es un «proxy» que contesta a
 * cualquier nombre de método. Si una función `async` lo devolviera tal cual, JavaScript le
 * preguntaría por `.then` para resolver la promesa y Capacitor respondería «"Rastreo.then()"
 * is not implemented on android». Por eso se devuelve un objeto común que solo delega.
 */
export async function plugin(): Promise<RastreoPlugin | null> {
  if (typeof navigator === "undefined" || !/EfameinsaApp\//.test(navigator.userAgent)) return null;
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isPluginAvailable("Rastreo")) return null;
  const nativo = registerPlugin<RastreoPlugin>("Rastreo");
  return {
    estado: () => nativo.estado(),
    iniciar: (config) => nativo.iniciar(config),
    detener: () => nativo.detener(),
    pedirPermiso: (opciones) => nativo.pedirPermiso(opciones),
    abrirAjustes: () => nativo.abrirAjustes(),
  };
}

/** Lo que falta para que el GPS funcione de verdad, en orden y en palabras. */
export function permisoPendiente(p: PermisosRastreo): PermisoPedido | null {
  if (!p.ubicacion) return "ubicacion";
  if (!p.segundoPlano) return "segundoPlano";
  if (!p.notificaciones) return "notificaciones";
  if (!p.bateriaLibre) return "bateria";
  return null;
}

export const AYUDA_PERMISO: Record<PermisoPedido, { titulo: string; texto: string; boton: string }> = {
  ubicacion: {
    titulo: "Permitir la ubicación",
    texto: "Elija «Mientras la app está en uso» y luego «Precisa» (ubicación exacta).",
    boton: "Permitir ubicación",
  },
  segundoPlano: {
    titulo: "Permitir todo el tiempo",
    texto: "Para seguir registrando con la pantalla apagada: en los ajustes que se abren, elija «Permitir todo el tiempo».",
    boton: "Permitir todo el tiempo",
  },
  notificaciones: {
    titulo: "Permitir el aviso fijo",
    texto: "Android muestra un aviso mientras la app usa el GPS. Permítalo para que el sistema no la cierre.",
    boton: "Permitir avisos",
  },
  bateria: {
    titulo: "Quitar el ahorro de batería",
    texto: "Elija «Sin restricciones» o «No optimizar» para la app: si no, el celular la duerme y se cortan los puntos.",
    boton: "Quitar el ahorro",
  },
};
