"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { estadoGarantia } from "@/lib/postventa";

/**
 * El caso técnico, registrado como se atiende: por la serie.
 *
 * «Ojo, el número de serie acá es vital… trabajamos con el número de serie
 * siendo el patrón para toda la trazabilidad» (Carlos, 27-08). Por eso la serie
 * se pide PRIMERO y no al final de un formulario: es lo que trae el cliente, la
 * garantía, los ciclos y el último preventivo — y con eso el que atiende ya
 * sabe si esto se cobra o no antes de terminar de escuchar el problema.
 *
 * El caso sigue siendo una oportunidad con `tipo_postventa` (0080). No se
 * inventa una tabla: partir el historial del cliente en dos era el precio, y
 * las etapas comerciales ya sirven —Carlos las revisó una por una—.
 */

export interface FichaSerie {
  equipoId: string | null;
  serie: string;
  equipo: string;
  cuentaId: string | null;
  cliente: string;
  garantia: { etiqueta: string; vigente: boolean; porVencer: boolean };
  ultimoMantenimiento: string | null;
  /** Nunca se le hizo uno: el ⚠ que abre la venta cruzada. */
  nuncaMantenido: boolean;
  puestaEnMarcha: string | null;
  ciclos: number | null;
  atencionesPrevias: number;
}

/**
 * Lo que aparece al tipear la serie.
 *
 * Devuelve `null` cuando esa máquina no está fichada, que hoy es lo habitual:
 * hay 10 equipos en el parque instalado y años de máquinas en la calle. La
 * pantalla lo dice con todas sus letras en vez de fingir que no existe — y el
 * caso se registra igual, con la serie tal como la dictó el cliente.
 */
export async function buscarSerie(serie: string): Promise<FichaSerie | null> {
  const limpia = serie.trim().toUpperCase();
  if (limpia.length < 4) return null;

  await requerirPerfil();
  const supabase = await createClient();

  const { data: equipo } = await supabase
    .from("equipos_instalados")
    .select(
      "id, serie, modelo_texto, cuenta_id, cliente_texto, garantia_hasta, ultimo_mantenimiento, fecha_puesta_marcha, ciclos_ultimo, cuentas(razon_social)",
    )
    .ilike("serie", limpia)
    .maybeSingle();
  if (!equipo) return null;

  const { count } = await supabase
    .from("informes_servicio")
    .select("id", { count: "exact", head: true })
    .eq("equipo_id", equipo.id);

  const garantia = estadoGarantia(equipo.garantia_hasta as string | null);
  const cuenta = equipo.cuentas as unknown as { razon_social: string } | null;

  return {
    equipoId: equipo.id as string,
    serie: equipo.serie as string,
    equipo: (equipo.modelo_texto as string | null) ?? "Equipo sin modelo registrado",
    cuentaId: (equipo.cuenta_id as string | null) ?? null,
    cliente: cuenta?.razon_social ?? (equipo.cliente_texto as string | null) ?? "Cliente sin identificar",
    garantia: { etiqueta: garantia.etiqueta, vigente: garantia.vigente, porVencer: garantia.porVencer },
    ultimoMantenimiento: (equipo.ultimo_mantenimiento as string | null) ?? null,
    nuncaMantenido: equipo.ultimo_mantenimiento == null,
    puestaEnMarcha: (equipo.fecha_puesta_marcha as string | null) ?? null,
    ciclos: (equipo.ciclos_ultimo as number | null) ?? null,
    atencionesPrevias: count ?? 0,
  };
}

/** El cliente, cuando no hay serie o la serie no está fichada. */
export async function buscarClientes(q: string): Promise<{ id: string; razonSocial: string; documento: string | null }[]> {
  const texto = q.trim();
  if (texto.length < 3) return [];
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cuentas")
    .select("id, razon_social, num_doc")
    .or(`razon_social.ilike.%${texto}%,num_doc.ilike.%${texto}%`)
    .order("razon_social")
    .limit(12);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    razonSocial: c.razon_social as string,
    documento: (c.num_doc as string | null) ?? null,
  }));
}

export type DesenlaceCaso = "telefono" | "derivar" | "cotizar";

/**
 * Registra el caso con su desenlace, en una sola operación.
 *
 * Los tres desenlaces son los que Carlos narró y no una lista de estados:
 *   · **telefono** — se resolvió hablando (el caño cerrado del ejemplo). Queda
 *     el informe de llamada y el caso se cierra, que es el clic que él buscó y
 *     no encontró: «no hay un clic donde diría que ya está atendido».
 *   · **derivar** — hay que mover a un técnico. Se programa fecha y hora, y con
 *     eso el caso aparece solo en el calendario del área (plan 16 §5). NO crea
 *     una orden de almacén: esa frontera está cortada hasta la reunión del ERP.
 *   · **cotizar** — hay que cobrarlo. El caso queda abierto y la pantalla lleva
 *     al cotizador con el cliente cargado, con el correlativo único de la casa.
 */
export async function registrarCaso(datos: {
  cuentaId: string;
  tipo: "garantia" | "repuesto" | "mantenimiento";
  problema: string;
  codigoError?: string | null;
  equipoId?: string | null;
  serieTexto?: string | null;
  desenlace: DesenlaceCaso;
  /** Solo para «derivar»: cuándo y con quién. */
  atencion?: { fecha: string; hora?: string | null; tecnico?: string | null } | null;
}): Promise<{ error: string | null; id?: string }> {
  const problema = datos.problema.trim();
  if (!datos.cuentaId) return { error: "Falta el cliente: sin cliente el caso no se puede archivar en ningún lado" };
  if (problema.length < 3) return { error: "Escriba qué le pasa al equipo, aunque sea en una línea" };
  if (datos.desenlace === "derivar" && !datos.atencion?.fecha) {
    return { error: "Para derivar hace falta la fecha de la atención: sin fecha no entra al calendario" };
  }

  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const serie = datos.serieTexto?.trim().toUpperCase() || null;
  const { data: caso, error } = await supabase
    .from("oportunidades")
    .insert({
      cuenta_id: datos.cuentaId,
      comercial_id: perfil.id,
      tipo_postventa: datos.tipo,
      equipo_id: datos.equipoId ?? null,
      serie_texto: serie,
      codigo_error: datos.codigoError?.trim() || null,
      // «Ejecutado» en el vocabulario del área es `venta` en el dato: es la
      // convención que ya usa `cerrarCaso` y no infla ninguna cifra comercial
      // —las ventas se cuentan de la tabla `ventas`, no de esta etapa—.
      etapa: datos.desenlace === "telefono" ? "venta" : "asignada",
      // Nace en el CRM. No hay un origen «postventa»: el check de la tabla solo
      // admite crm | historico_excel, y además marcarlo distinto lo sacaría de
      // la agenda y del cierre semanal, que filtran por origen = crm.
      origen: "crm",
      proxima_accion: datos.desenlace === "derivar" ? "Atención técnica programada" : datos.desenlace === "cotizar" ? "Enviar la cotización" : null,
      proxima_accion_at: datos.desenlace === "derivar" ? datos.atencion?.fecha : null,
      proxima_accion_hora: datos.desenlace === "derivar" ? (datos.atencion?.hora || null) : null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const detalleTecnico = [
    datos.codigoError?.trim() ? `Código de error: ${datos.codigoError.trim()}.` : null,
    serie ? `Serie: ${serie}.` : "Equipo sin identificar.",
    datos.desenlace === "derivar" && datos.atencion
      ? `Atención programada para el ${datos.atencion.fecha}${datos.atencion.hora ? ` a las ${datos.atencion.hora}` : ""}${datos.atencion.tecnico ? ` con ${datos.atencion.tecnico}` : ""}.`
      : null,
    datos.desenlace === "telefono" ? "Resuelto por teléfono en la misma llamada." : null,
  ]
    .filter(Boolean)
    .join(" ");

  await supabase.from("actividades").insert({
    oportunidad_id: caso.id,
    tipo: "llamada",
    nota: `${problema} ${detalleTecnico}`.trim(),
    realizada_por: perfil.id,
    proxima_accion: datos.desenlace === "derivar" ? "Atención técnica programada" : null,
    proxima_accion_at: datos.desenlace === "derivar" ? datos.atencion?.fecha : null,
    proxima_accion_hora: datos.desenlace === "derivar" ? (datos.atencion?.hora || null) : null,
  });

  // El informe de llamada del área (D9): existe cuando la atención terminó en
  // el teléfono, que es el 80% de los casos según el manual.
  if (datos.desenlace === "telefono") {
    const anio = new Date().getFullYear();
    const { data: correlativo } = await supabase.rpc("siguiente_correlativo_informe_servicio", { p_anio: anio });
    await supabase.from("informes_servicio").insert({
      correlativo,
      anio,
      tipo: "llamada",
      equipo_id: datos.equipoId ?? null,
      cuenta_id: datos.cuentaId,
      equipo_texto: serie ? `Serie: ${serie}` : null,
      modalidad: "videollamada",
      ejecutado_at: new Date().toISOString(),
      elaborado_por: perfil.id,
      asunto: `Atención telefónica · ${datos.tipo}`,
      detalle: problema,
      observaciones: datos.codigoError?.trim() ? `Código de error reportado: ${datos.codigoError.trim()}` : null,
      emitido_at: new Date().toISOString(),
    });
  }

  revalidatePath("/postventa");
  revalidatePath("/postventa/casos");
  revalidatePath("/postventa/agenda");
  return { error: null, id: caso.id as string };
}

/**
 * El texto para mandar por WhatsApp al almacén o al técnico.
 *
 * «Derivar» todavía no crea una orden de almacén: esa frontera está cortada
 * hasta saber qué trae el módulo del ERP (D8). Mientras tanto, el circuito real
 * es un mensaje de WhatsApp — así que el CRM lo deja escrito, con todo lo que
 * hoy se olvida a mano.
 */
export async function textoDerivacion(datos: {
  cliente: string;
  serie: string | null;
  equipo: string | null;
  problema: string;
  codigoError?: string | null;
  fecha: string;
  hora?: string | null;
  ubicacion?: string | null;
}): Promise<string> {
  return [
    "*Atención técnica programada*",
    `Cliente: ${datos.cliente}`,
    datos.equipo ? `Equipo: ${datos.equipo}` : null,
    datos.serie ? `Serie: ${datos.serie}` : "Serie: no identificada",
    datos.codigoError ? `Código de error: ${datos.codigoError}` : null,
    `Falla: ${datos.problema}`,
    `Fecha: ${datos.fecha}${datos.hora ? ` · ${datos.hora}` : ""}`,
    datos.ubicacion ? `Dirección: ${datos.ubicacion}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
