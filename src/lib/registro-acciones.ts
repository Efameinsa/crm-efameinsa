/**
 * EL REGISTRO DE ACCIONES EN PALABRAS DE LA OFICINA (0513, Santos 16-10).
 *
 * La base anota «atenciones · cambiar · equipo_id, en_garantia». Quien mira
 * el registro necesita leer «Cambió un caso de postventa: Máquina, En
 * garantía». Este archivo es solo el diccionario: qué es cada tabla y cada
 * campo, y cómo se escribe un valor para una persona.
 */

export interface AccionRegistrada {
  id: number;
  lote: number;
  tabla: string;
  fila_id: string;
  operacion: "crear" | "cambiar" | "borrar";
  campos: string[];
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  cuenta_id: string | null;
  quien: string;
  cuando: string;
  revierte_lote: number | null;
  deshecha_at: string | null;
  deshecha_por: string | null;
  deshecha_motivo: string | null;
}

/** Qué es cada tabla, en singular y con artículo («un caso de postventa»). */
export const QUE_ES: Record<string, string> = {
  atenciones: "un caso de postventa",
  oportunidades: "un expediente",
  leads: "un prospecto",
  asignaciones: "una derivación",
  contactos: "un contacto",
  cuentas: "una ficha de cliente",
  equipos_instalados: "una máquina del registro de máquinas",
  servicios_postventa: "un pedido",
  visitas_planta: "una visita a planta",
  actividades: "una gestión",
  informes_cierre: "un cierre de venta",
  aperturas_llamada: "una apertura",
};

export const TABLAS_FILTRO = Object.entries(QUE_ES).map(([valor, texto]) => ({
  valor,
  texto: texto.replace(/^(un|una) /, "").replace(/^./, (c) => c.toUpperCase()),
}));

const VERBO = { crear: "Creó", cambiar: "Cambió", borrar: "Borró" } as const;

export function titularAccion(a: Pick<AccionRegistrada, "tabla" | "operacion">): string {
  return `${VERBO[a.operacion]} ${QUE_ES[a.tabla] ?? `un registro (${a.tabla})`}`;
}

/** Los campos que más se tocan, con su nombre de pantalla. El resto se lee del nombre técnico. */
const CAMPOS: Record<string, string> = {
  equipo_id: "Máquina",
  en_garantia: "En garantía",
  hizo_preventivo: "Hizo preventivo",
  garantia_verificada_at: "Garantía verificada el",
  garantia_verificada_por: "Garantía verificada por",
  garantia_omitida_at: "Garantía omitida el",
  garantia_omitida_motivo: "Por qué se omitió la garantía",
  etapa: "Etapa",
  estado: "Estado",
  tipo: "Tipo",
  clasificacion: "Clasificación",
  detalle: "Detalle",
  diagnostico: "Diagnóstico",
  trabajo_realizado: "Trabajo realizado",
  tecnico: "Técnico",
  asignado_a: "Asignado a",
  asignado_por: "Asignado por",
  recibido_por: "Recibido por",
  tomada_por: "Tomado por",
  tomada_at: "Tomado el",
  cuenta_id: "Ficha del cliente",
  oportunidad_id: "Expediente",
  comercial_id: "Comercial (cartera)",
  razon_social: "Razón social",
  nombre_comercial: "Nombre comercial",
  tipo_doc: "Tipo de documento",
  num_doc: "N.º de documento",
  fusionada_en: "Unida a la ficha",
  archivada_at: "Archivada el",
  nombre: "Nombre",
  telefono: "Teléfono",
  correo: "Correo",
  cargo: "Cargo",
  area: "Área",
  serie: "Serie",
  modelo_texto: "Modelo",
  fecha_venta: "Fecha de despacho",
  garantia_meses: "Garantía (meses)",
  ubicacion: "Dónde está",
  observaciones: "Observaciones",
  notas: "Notas",
  mensaje: "Mensaje",
  proxima_accion: "Próxima acción",
  proxima_accion_at: "Fecha de la próxima acción",
  monto_estimado: "Monto estimado",
  cerrado_at: "Cerrado el",
  motivo_cierre: "Motivo del cierre",
  resultado: "Resultado",
  emitido_at: "Emitido el",
  items: "Renglones",
  contacto_despacho: "Quién recibe",
  entrega_direccion: "Dirección de entrega",
  entrega_fecha: "Fecha de entrega",
  fecha: "Fecha",
  hora: "Hora",
};

export function nombreCampo(c: string): string {
  if (CAMPOS[c]) return CAMPOS[c];
  const t = c.replace(/_at$/, "").replace(/_id$/, "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Los campos que no le dicen nada a nadie y solo ensucian la lista. */
export const CAMPOS_RUIDO = new Set(["id", "created_at", "updated_at", "es_prueba", "version"]);

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Un valor como lo lee una persona. Los identificadores se traducen con
 * `nombres` (personas, fichas, máquinas: lo resuelve la página) y, si no se
 * conocen, se dice «(otro registro)» en vez de mostrar el código.
 */
export function valorLegible(v: unknown, nombres: Map<string, string>): string {
  if (v === null || v === undefined || v === "") return "(vacío)";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (RE_UUID.test(v)) return nombres.get(v) ?? "(otro registro)";
    if (RE_FECHA_HORA.test(v)) {
      return new Date(v).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });
    }
    return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  }
  if (Array.isArray(v)) return v.length === 0 ? "(vacío)" : `${v.length} elemento${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const n = o.nombre ?? o.descripcion;
    return typeof n === "string" && n ? n : "(datos)";
  }
  return String(v);
}

/** Los identificadores que aparecen en una lista de acciones, para traducirlos todos de una vez. */
export function idsMencionados(acciones: AccionRegistrada[]): string[] {
  const ids = new Set<string>();
  for (const a of acciones) {
    for (const o of [a.antes, a.despues]) {
      if (!o) continue;
      for (const v of Object.values(o)) if (typeof v === "string" && RE_UUID.test(v)) ids.add(v);
    }
    if (a.cuenta_id) ids.add(a.cuenta_id);
  }
  return [...ids];
}
