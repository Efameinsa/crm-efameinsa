"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen } from "@/lib/notificaciones";
import { ETIQUETA_TIPO_APERTURA, TIPOS_APERTURA, type FormatoLlamada, type TipoApertura } from "@/lib/aperturas-llamada";

// Las cinco acciones de la apertura de llamada (0281). Las reglas de quién
// puede qué viven en las funciones de la base; acá solo se avisa al otro lado.

function listo(servicioId?: string | null, cuentaId?: string | null) {
  revalidatePath("/postventa/aperturas");
  revalidatePath("/almacen/aperturas");
  revalidatePath("/almacen");
  revalidatePath("/postventa/macro");
  if (servicioId) revalidatePath(`/postventa/pedidos/${servicioId}`);
  if (cuentaId) revalidatePath(`/comercial/cartera/${cuentaId}`);
  return { error: null as string | null, id: null as string | null };
}
function falla(mensaje: string) {
  return { error: mensaje, id: null as string | null };
}

const cliente = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "");
const cuandoLima = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export async function enviarAperturaLlamada(datos: {
  cuentaId: string;
  tipo: TipoApertura;
  programadaPara: string;
  equipos: string;
  indicaciones?: string | null;
  contacto?: string | null;
  servicioId?: string | null;
  atencionId?: string | null;
  /** Apertura urgente sin pedido ni cotización: el código de gerencia (0295). */
  pinUrgente?: string | null;
  /** El técnico lo pone postventa (0297; Santos, 24-09). */
  tecnico?: string | null;
  /** El formato de llamada (0297). */
  formato?: FormatoLlamada | null;
}) {
  const perfil = await requerirPerfil();
  if (!datos.cuentaId) return falla("Elija el cliente");
  if (!TIPOS_APERTURA.includes(datos.tipo)) return falla("Tipo de apertura desconocido");
  if (!datos.programadaPara || Number.isNaN(new Date(datos.programadaPara).getTime())) return falla("Falta el día y la hora");
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("enviar_apertura_llamada", {
    p_cuenta: datos.cuentaId,
    p_tipo: datos.tipo,
    p_programada: datos.programadaPara,
    p_equipos: datos.equipos,
    p_indicaciones: datos.indicaciones ?? null,
    p_contacto: datos.contacto ?? null,
    p_servicio: datos.servicioId ?? null,
    p_atencion: datos.atencionId ?? null,
    p_pin_urgente: datos.pinUrgente?.trim() || null,
    p_tecnico: datos.tecnico?.trim() || null,
    p_formato: datos.formato ?? null,
  });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  const { data: c } = await supabase.from("cuentas").select("razon_social").eq("id", datos.cuentaId).maybeSingle();
  await notificarAlmacen({
    titulo: `${datos.pinUrgente ? "URGENTE · " : ""}${ETIQUETA_TIPO_APERTURA[datos.tipo]} · ${cliente(c?.razon_social)}`,
    cuerpo: `${cuandoLima(datos.programadaPara)}. ${datos.equipos.split("\n")[0]}.${datos.tecnico?.trim() ? ` Técnico: ${datos.tecnico.trim()}.` : ""} Tome la apertura para que postventa sepa que ya está en manos del almacén.`,
    url: `/aperturas/${id}`,
    esPrueba: (perfil as { es_prueba?: boolean | null }).es_prueba === true,
  });
  const r = listo(datos.servicioId, datos.cuentaId);
  return { ...r, id: id as string };
}

/**
 * El almacén la toma. Postventa se entera en el momento (Santos, 24-09:
 * «cuando almacén recepcionó la llamada… debería estar en verde o una
 * notificación para que postventa se entere»). El técnico ya no lo pone el
 * almacén: lo puso postventa.
 */
export async function tomarApertura(id: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_tomar_apertura", { p_id: id, p_tecnico: null });
  if (error) return falla(error.message);
  const { data: a } = await supabase
    .from("aperturas_llamada")
    .select("solicitada_por, tipo, tecnico, programada_para, servicio_id, cuenta_id, cuentas(razon_social)")
    .eq("id", id)
    .maybeSingle();
  if (a?.solicitada_por) {
    const razon = (a.cuentas as unknown as { razon_social: string } | null)?.razon_social;
    await notificar({
      userId: a.solicitada_por,
      tipo: "almacen",
      titulo: `El almacén tomó la apertura · ${cliente(razon)}`,
      cuerpo: `${ETIQUETA_TIPO_APERTURA[a.tipo as TipoApertura] ?? "Apertura"} del ${cuandoLima(a.programada_para as string)}${a.tecnico ? ` · técnico ${a.tecnico}` : ""}. Ya está en sus manos.`,
      url: `/aperturas/${id}`,
    });
  }
  revalidatePath(`/aperturas/${id}`);
  return listo(a?.servicio_id, a?.cuenta_id);
}

/** Postventa pone o cambia el técnico de la apertura (0297). */
export async function asignarTecnicoApertura(id: string, tecnico: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("postventa_tecnico_de_apertura", { p_id: id, p_tecnico: tecnico });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  revalidatePath(`/aperturas/${id}`);
  return listo();
}

/**
 * Lo que el formato de llamada ya sabe del cliente (0297): sus máquinas del
 * parque con compra, entrega, guía, garantía, mantenimiento y puesta en
 * marcha, y su contacto. Postventa elige la máquina y el formato se llena solo.
 */
export async function datosParaFormatoDeLlamada(cuentaId: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const [{ data: equipos }, { data: contacto }] = await Promise.all([
    supabase
      .from("equipos_instalados")
      .select("id, serie, modelo_texto, fecha_venta, fecha_despacho, guia_remision, fecha_puesta_marcha, garantia_meses, garantia_hasta, ultimo_mantenimiento, ubicacion, servicio_id")
      .eq("cuenta_id", cuentaId)
      .order("fecha_venta", { ascending: false, nullsFirst: false })
      .limit(30),
    supabase.from("contactos").select("nombre, telefono").eq("cuenta_id", cuentaId).order("es_principal", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const protocolos = new Set<string>();
  const ids = ((equipos ?? []) as { servicio_id: string | null }[]).map((e) => e.servicio_id).filter(Boolean) as string[];
  if (ids.length) {
    const { data: pruebas } = await supabase.from("servicios_postventa").select("id, prueba_lista_at, protocolo_prueba_ref").in("id", ids.slice(0, 30));
    for (const p of (pruebas ?? []) as { id: string; prueba_lista_at: string | null; protocolo_prueba_ref: string | null }[]) {
      if (p.prueba_lista_at || p.protocolo_prueba_ref) protocolos.add(p.id);
    }
  }
  return {
    contacto: contacto ? [contacto.nombre, contacto.telefono].filter(Boolean).join(" · ") : null,
    equipos: ((equipos ?? []) as {
      id: string; serie: string | null; modelo_texto: string | null; fecha_venta: string | null; fecha_despacho: string | null; guia_remision: string | null;
      fecha_puesta_marcha: string | null; garantia_meses: number | null; garantia_hasta: string | null; ultimo_mantenimiento: string | null; ubicacion: string | null; servicio_id: string | null;
    }[]).map((e) => ({ ...e, protocolo: e.servicio_id ? protocolos.has(e.servicio_id) : false })),
  };
}

export async function subirInformeApertura(datos: {
  id: string;
  informe: string;
  faltantes?: string | null;
  tecnico?: string | null;
  fotos: { path: string; nombre: string; tipo: string; tamano: number }[];
  /** El informe de soporte técnico numerado ya guardado (0297). */
  informeServicioId?: string | null;
}) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_informe_apertura", {
    p_id: datos.id,
    p_informe: datos.informe,
    p_faltantes: datos.faltantes ?? null,
    p_fotos: datos.fotos,
    p_tecnico: null,
    p_informe_servicio: datos.informeServicioId ?? null,
  });
  if (error) return falla(error.message);
  // La alerta a quien la pidió: «acá le aparece una alerta, y postventa lo
  // modifica» (reunión 23-09).
  const { data: a } = await supabase
    .from("aperturas_llamada")
    .select("solicitada_por, tipo, servicio_id, cuenta_id, faltantes, cuentas(razon_social)")
    .eq("id", datos.id)
    .maybeSingle();
  if (a?.solicitada_por) {
    const razon = (a.cuentas as unknown as { razon_social: string } | null)?.razon_social;
    await notificar({
      userId: a.solicitada_por,
      tipo: "almacen",
      titulo: `Informe de la llamada · ${cliente(razon)}`,
      cuerpo: a.faltantes
        ? `El almacén encontró cosas que faltan: hay algo para cotizar. Revíselo antes de mandarlo al cliente.`
        : `El almacén subió su informe. Revíselo antes de mandarlo al cliente.`,
      url: `/aperturas/${datos.id}`,
    });
  }
  revalidatePath(`/aperturas/${datos.id}`);
  return listo(a?.servicio_id, a?.cuenta_id);
}

export async function revisarApertura(id: string, informeCliente: string, enviada: boolean) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revisar_apertura_llamada", { p_id: id, p_informe_cliente: informeCliente, p_enviada: enviada });
  if (error) return falla(error.message);
  const { data: a } = await supabase.from("aperturas_llamada").select("servicio_id, cuenta_id").eq("id", id).maybeSingle();
  revalidatePath(`/aperturas/${id}`);
  return listo(a?.servicio_id, a?.cuenta_id);
}

export async function anularApertura(id: string, motivo: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_apertura_llamada", { p_id: id, p_motivo: motivo });
  if (error) return falla(error.message);
  const a = await aperturaParaAviso(supabase, id);
  // El almacén la tenía en su cola (o ya la había tomado): se entera (25-09).
  if (a)
    await notificarAlmacen({
      titulo: `Anulada · ${ETIQUETA_TIPO_APERTURA[a.tipo] ?? "Apertura"} · ${cliente(a.razon)}`,
      cuerpo: `La del ${cuandoLima(a.programada_para)} ya no va. Motivo: ${motivo.trim()}`,
      url: `/aperturas/${id}`,
      esPrueba: (perfil as { es_prueba?: boolean | null }).es_prueba === true,
    });
  revalidatePath(`/aperturas/${id}`);
  return listo(a?.servicio_id, a?.cuenta_id);
}

async function aperturaParaAviso(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("aperturas_llamada")
    .select("tipo, programada_para, servicio_id, cuenta_id, informe_servicio_id, cuentas(razon_social)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    tipo: data.tipo as TipoApertura,
    programada_para: data.programada_para as string,
    servicio_id: data.servicio_id as string | null,
    cuenta_id: data.cuenta_id as string | null,
    informe_servicio_id: data.informe_servicio_id as string | null,
    razon: (data.cuentas as unknown as { razon_social: string } | null)?.razon_social,
  };
}

/**
 * REPROGRAMAR (0311; Rubí, 25-09: «la llamada no se realizará porque mañana
 * habrá despacho, quiero reprogramarla para el lunes»). Antes solo quedaba
 * anular y volver a llenar toda la orden. Se puede mientras el almacén no
 * haya subido su informe; el almacén recibe el aviso con la fecha nueva.
 */
export async function reprogramarApertura(id: string, programadaPara: string, motivo?: string | null) {
  const perfil = await requerirPerfil();
  if (!programadaPara || Number.isNaN(new Date(programadaPara).getTime())) return falla("Falta el día y la hora");
  const supabase = await createClient();
  const antes = await aperturaParaAviso(supabase, id);
  const { error } = await supabase.rpc("reprogramar_apertura_llamada", {
    p_id: id,
    p_programada: programadaPara,
    p_motivo: motivo?.trim() || null,
  });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  if (antes)
    await notificarAlmacen({
      titulo: `Reprogramada · ${ETIQUETA_TIPO_APERTURA[antes.tipo] ?? "Apertura"} · ${cliente(antes.razon)}`,
      cuerpo: `Pasa del ${cuandoLima(antes.programada_para)} al ${cuandoLima(programadaPara)}.${motivo?.trim() ? ` Motivo: ${motivo.trim()}` : ""}`,
      url: `/aperturas/${id}`,
      esPrueba: (perfil as { es_prueba?: boolean | null }).es_prueba === true,
    });
  revalidatePath(`/aperturas/${id}`);
  revalidatePath(`/aperturas/${id}/orden`);
  return listo(antes?.servicio_id, antes?.cuenta_id);
}

/**
 * CORREGIR EL TIPO (0311; Rubí, 25-09: eligió «puesta en marcha» y era de
 * preinstalación). La base arrastra el informe de servicio que salió de la
 * apertura y el paso de preinstalación del pedido.
 */
export async function corregirTipoApertura(id: string, tipo: TipoApertura, motivo?: string | null) {
  const perfil = await requerirPerfil();
  if (!TIPOS_APERTURA.includes(tipo)) return falla("Tipo de apertura desconocido");
  const supabase = await createClient();
  const antes = await aperturaParaAviso(supabase, id);
  const { error } = await supabase.rpc("corregir_tipo_apertura", { p_id: id, p_tipo: tipo, p_motivo: motivo?.trim() || null });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  if (antes)
    await notificarAlmacen({
      titulo: `Corregida · ${cliente(antes.razon)}`,
      cuerpo: `La apertura del ${cuandoLima(antes.programada_para)} no es «${ETIQUETA_TIPO_APERTURA[antes.tipo]}»: es «${ETIQUETA_TIPO_APERTURA[tipo]}».`,
      url: `/aperturas/${id}`,
      esPrueba: (perfil as { es_prueba?: boolean | null }).es_prueba === true,
    });
  revalidatePath(`/aperturas/${id}`);
  revalidatePath(`/aperturas/${id}/orden`);
  revalidatePath(`/aperturas/${id}/imprimir`);
  if (antes?.informe_servicio_id) revalidatePath(`/postventa/informes/${antes.informe_servicio_id}`);
  return listo(antes?.servicio_id, antes?.cuenta_id);
}
