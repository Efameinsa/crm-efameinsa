/**
 * Lo que piden las cuatro pantallas de visitas (Central, comercial, postventa,
 * almacén): una sola lista de columnas. Vive en lib y no en el componente
 * porque el componente es «use client»: una constante exportada desde ahí le
 * llega al servidor como referencia de cliente, no como texto (18-09: la
 * pantalla del comercial no abría).
 */
export const COLUMNAS_VISITA =
  "id, empresa, ruc, persona, dni, telefono, motivo, fecha, hora, registrado_at, impreso_at, cancelada_at, cancelada_motivo, cuenta_id, showroom, prender_tv, infocorp, cotizacion_ref, acompanantes, equipo_a_ver, quitar_film, infocorp_enviado_at, showroom_listo_at, film_retirado_at, tv_listo_at, llego_at, no_vino_at, reembalado_at, notas_central, atendida_at, resultado, resultado_nota, cerrada_at, perfiles!visitas_planta_registrado_por_fkey(nombre, codigo_comercial)";
