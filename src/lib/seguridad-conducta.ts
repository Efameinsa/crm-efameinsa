/**
 * CONDUCTA SOSPECHOSA: QUÉ SE ANOTA Y CUÁNDO SE AVISA A GERENCIA (0373).
 *
 * Santos (02-10-2026): «queremos estar enterados si hace screenshots, o tiene
 * algún comportamiento sospechoso como copiar información y llevársela a otro
 * lado; tenemos información muy delicada (teléfonos de contactos)». Y después,
 * aclarando: «no quiero que bloquees nada»: esto SOLO MIRA y AVISA.
 *
 * Qué se anota (nunca el contenido):
 *   · captura_pantalla   captura o grabación de pantalla en la app; en la web, la tecla Impr Pant.
 *   · copiar             copiar o cortar texto: solo CUÁNTOS caracteres, jamás qué texto.
 *   · exportacion        el servidor entregó (o se pidió) un PDF/Excel/reporte.
 *   · descarga           un archivo armado en el equipo y bajado (Excel del navegador, etc.).
 *   · impresion          imprimir una pantalla.
 *   · compartir          mandar un archivo bajado a otra aplicación (WhatsApp, correo…).
 *
 * Qué NO se puede saber, y se dice sin rodeos en el informe: una foto a la
 * pantalla con otro celular, ni lo que se hace después de compartir fuera.
 *
 * Esto no tiene base de datos ni red: son las reglas puras, para poder
 * probarlas. Las usa `seguridad-alertas.ts` en el servidor.
 */

export const TIPOS_EVENTO = ["captura_pantalla", "copiar", "exportacion", "descarga", "impresion", "compartir"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Los tipos que puede mandar el navegador o la app. `exportacion` solo lo anota el servidor. */
export const TIPOS_DEL_CLIENTE: readonly TipoEvento[] = ["captura_pantalla", "copiar", "descarga", "impresion", "compartir"];

export const ETIQUETA_EVENTO: Record<TipoEvento, string> = {
  captura_pantalla: "Captura de pantalla",
  copiar: "Copió texto",
  exportacion: "Exportó un documento",
  descarga: "Descargó un archivo",
  impresion: "Imprimió",
  compartir: "Compartió un archivo",
};

export interface EventoSeguridad {
  tipo: TipoEvento;
  /** Milisegundos desde 1970. */
  t: number;
  detalle?: Record<string, unknown> | null;
}

export interface Regla {
  id: string;
  /** Nombre corto para la pantalla de gerencia. */
  nombre: string;
  tipos: readonly TipoEvento[];
  ventanaMin: number;
  /** Cuántos eventos dentro de la ventana disparan el aviso. */
  minimo: number;
  /** Tras avisar, no se repite el aviso de la misma regla a la misma persona por tanto tiempo. */
  enfriamientoMin: number;
  /** Solo cuentan los eventos que cumplan esto (por defecto, todos los de `tipos`). */
  cuenta?: (e: EventoSeguridad) => boolean;
  /** La frase del aviso; `n` es lo que se contó y `min` los minutos de la ventana. */
  frase: (n: number, min: number) => string;
}

/** Copiar un bloque así de grande ya no es «un teléfono»: es una lista o un párrafo. */
export const COPIA_GRANDE_CARACTERES = 1500;

const SALIDAS: readonly TipoEvento[] = ["exportacion", "descarga", "impresion", "compartir"];

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export const REGLAS: readonly Regla[] = [
  {
    id: "captura",
    nombre: "Captura de pantalla",
    tipos: ["captura_pantalla"],
    ventanaMin: 10,
    minimo: 1,
    enfriamientoMin: 10,
    frase: (n, min) => `hizo ${plural(n, "captura de pantalla", "capturas de pantalla")} en ${min} min`,
  },
  {
    id: "copia_grande",
    nombre: "Copió un bloque grande",
    tipos: ["copiar"],
    ventanaMin: 10,
    minimo: 1,
    enfriamientoMin: 30,
    cuenta: (e) => Number(e.detalle?.caracteres ?? 0) >= COPIA_GRANDE_CARACTERES,
    frase: (n) => `copió ${plural(n, "bloque", "bloques")} de ${COPIA_GRANDE_CARACTERES}+ caracteres (una lista, no un dato suelto)`,
  },
  {
    id: "copia_repetida",
    nombre: "Copia seguida",
    tipos: ["copiar"],
    ventanaMin: 10,
    minimo: 15,
    enfriamientoMin: 30,
    frase: (n, min) => `copió texto ${n} veces en ${min} min`,
  },
  {
    id: "salidas_rafaga",
    nombre: "Muchas descargas seguidas",
    tipos: SALIDAS,
    ventanaMin: 10,
    minimo: 8,
    enfriamientoMin: 60,
    frase: (n, min) => `sacó ${n} documentos (descargas, exportaciones, impresiones o envíos) en ${min} min`,
  },
  {
    id: "salidas_dia",
    nombre: "Muchas descargas en el día",
    tipos: SALIDAS,
    ventanaMin: 24 * 60,
    minimo: 25,
    enfriamientoMin: 4 * 60,
    frase: (n) => `lleva ${n} documentos sacados en las últimas 24 horas`,
  },
];

export const VENTANA_MAXIMA_MIN = Math.max(...REGLAS.map((r) => r.ventanaMin));

export interface AvisoDeRegla {
  regla: string;
  nombre: string;
  /** Cuántos eventos se contaron. */
  cuenta: number;
  /** «hizo 2 capturas de pantalla en 10 min» (sin el nombre de la persona). */
  resumen: string;
}

/**
 * Qué reglas se cumplen con estos eventos, descontando las que ya se avisaron.
 * `ultimosAvisos` es, por regla, la hora (ms) del último aviso a esa persona.
 */
export function reglasQueSeCumplen(
  eventos: readonly EventoSeguridad[],
  ahora: number,
  ultimosAvisos: Readonly<Record<string, number>> = {},
): AvisoDeRegla[] {
  const avisos: AvisoDeRegla[] = [];
  for (const regla of REGLAS) {
    const ultimo = ultimosAvisos[regla.id];
    if (ultimo !== undefined && ahora - ultimo < regla.enfriamientoMin * 60_000) continue;
    const desde = ahora - regla.ventanaMin * 60_000;
    const n = eventos.filter(
      (e) => e.t >= desde && e.t <= ahora + 60_000 && regla.tipos.includes(e.tipo) && (regla.cuenta ? regla.cuenta(e) : true),
    ).length;
    if (n >= regla.minimo) {
      avisos.push({ regla: regla.id, nombre: regla.nombre, cuenta: n, resumen: regla.frase(n, regla.ventanaMin) });
    }
  }
  return avisos;
}

/* ───────────── Lo que llega del navegador o de la app, saneado ───────────── */

const MAX_TEXTO = 120;

function texto(v: unknown, max = MAX_TEXTO): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f]/g, " ").trim();
  return t ? t.slice(0, max) : undefined;
}

/** Solo la ruta, sin parámetros: los parámetros pueden traer datos del cliente. */
export function soloRuta(v: unknown): string | undefined {
  const t = texto(v, 300);
  if (!t) return undefined;
  try {
    const u = new URL(t, "https://x.invalid");
    return u.pathname.slice(0, 200);
  } catch {
    return undefined;
  }
}

/**
 * Lo que se guarda de un evento. Una lista blanca: lo que no está acá se tira,
 * para que NUNCA termine en la base el texto copiado ni nada de un cliente.
 */
export function sanearDetalle(tipo: TipoEvento, crudo: unknown): Record<string, unknown> {
  const d = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : {};
  const salida: Record<string, unknown> = {};
  const ruta = soloRuta(d.ruta);
  if (ruta) salida.ruta = ruta;
  switch (tipo) {
    case "copiar": {
      const n = Number(d.caracteres);
      if (Number.isFinite(n) && n >= 0) salida.caracteres = Math.min(Math.round(n), 10_000_000);
      if (d.en === "campo" || d.en === "texto") salida.en = d.en;
      if (d.accion === "cortar" || d.accion === "copiar") salida.accion = d.accion;
      break;
    }
    case "captura_pantalla": {
      const metodo = texto(d.metodo, 30);
      if (metodo && /^[a-z0-9_-]+$/.test(metodo)) salida.metodo = metodo;
      break;
    }
    case "descarga":
    case "compartir": {
      const nombre = texto(d.nombre, 80);
      if (nombre) salida.nombre = nombre;
      break;
    }
    default:
      break;
  }
  return salida;
}

/** ¿Una ruta del servidor que entrega un documento? (Las vistas previas no cuentan.) */
const RUTAS_DE_EXPORTACION: readonly RegExp[] = [
  /^\/api\/cotizaciones\/[^/]+\/pdf$/,
  /^\/api\/cotizaciones-historicas\/[^/]+\/pdf$/,
  /^\/api\/informes\/[^/]+\/pdf$/,
  /^\/api\/reportes\/[^/]+$/,
  /^\/api\/postventa\/pedidos\/reporte$/,
  /^\/api\/postventa\/pedidos\/[^/]+\/apertura\/pdf$/,
  /^\/api\/marketing\/(catalogo-whatsapp|conversiones|whatsapp-publicos)$/,
];

export function esRutaDeExportacion(pathname: string): boolean {
  return RUTAS_DE_EXPORTACION.some((re) => re.test(pathname));
}

/** Gerencia y administración no se vigilan (misma regla que el GPS de la app). */
export function seVigila(perfil: { rol?: string | null }): boolean {
  return !["gerencia", "admin"].includes(perfil.rol ?? "");
}
