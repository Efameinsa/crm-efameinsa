/**
 * Lo que piden las cuatro pantallas de visitas (Central, comercial, postventa,
 * almacén): una sola lista de columnas. Vive en lib y no en el componente
 * porque el componente es «use client»: una constante exportada desde ahí le
 * llega al servidor como referencia de cliente, no como texto (18-09: la
 * pantalla del comercial no abría).
 */
export const COLUMNAS_VISITA =
  "id, tipo_visitante, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, showroom, prender_tv, infocorp, cotizacion_ref, acompanantes, equipo_a_ver, quitar_film, maquinas_preparar, equipos_recoge, transporte, infocorp_enviado_at, showroom_listo_at, film_retirado_at, tv_listo_at, llego_at, no_vino_at, reembalado_at, notas_central, atendida_at, resultado, resultado_nota, cerrada_at, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)";

/**
 * DNI o carné de extranjería (Rubí, buzón 15-10: «opción de seleccionar con un
 * botón si es DNI o C.E.»). Sin columna nueva: el C.E. se guarda con «CE»
 * adelante (un DNI son solo dígitos, no se confunden) y se muestra «C.E. …».
 */
export type TipoDocVisita = "dni" | "ce";

export function guardarDocVisita(numero: string, tipo: TipoDocVisita): string {
  const n = numero.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return n ? (tipo === "ce" ? `CE${n}` : n) : "";
}

export function esCarneExtranjeria(doc: string | null | undefined): boolean {
  return /^C\.?\s*E\.?\s*\S/i.test((doc ?? "").trim());
}

/** «DNI 12345678» o «C.E. 001234567», como se imprime para vigilancia. */
export function docVisita(doc: string | null | undefined): string {
  const d = (doc ?? "").trim();
  if (!d) return "";
  return esCarneExtranjeria(d) ? `C.E. ${d.replace(/^C\.?\s*E\.?\s*/i, "")}` : `DNI ${d}`;
}

/** Lo que falta o sobra en el documento; null si está bien o vacío. */
export function errorDocVisita(numero: string, tipo: TipoDocVisita): string | null {
  const n = numero.replace(/[^0-9A-Za-z]/g, "");
  if (!n) return null;
  if (tipo === "dni" && !/^\d{8}$/.test(n)) return "El DNI tiene 8 dígitos. Si es extranjero, elija «C.E.».";
  if (tipo === "ce" && (n.length < 6 || n.length > 12)) return "Revise el carné de extranjería: suele tener 9 dígitos.";
  return null;
}
