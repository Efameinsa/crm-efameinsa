"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen } from "@/lib/notificaciones";
import { ETIQUETA_TIPO_APERTURA, TIPOS_APERTURA, type TipoApertura } from "@/lib/aperturas-llamada";

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
  });
  if (error) return falla(error.message.replace(/^[A-Z0-9]{5}:\s*/, ""));
  const { data: c } = await supabase.from("cuentas").select("razon_social").eq("id", datos.cuentaId).maybeSingle();
  await notificarAlmacen({
    titulo: `${datos.pinUrgente ? "URGENTE · " : ""}${ETIQUETA_TIPO_APERTURA[datos.tipo]} · ${cliente(c?.razon_social)}`,
    cuerpo: `${cuandoLima(datos.programadaPara)}. ${datos.equipos.split("\n")[0]}. Tome la apertura para que postventa sepa que ya está en manos del almacén.`,
    url: `/aperturas/${id}`,
    esPrueba: (perfil as { es_prueba?: boolean | null }).es_prueba === true,
  });
  const r = listo(datos.servicioId, datos.cuentaId);
  return { ...r, id: id as string };
}

export async function tomarApertura(id: string, tecnico?: string | null) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_tomar_apertura", { p_id: id, p_tecnico: tecnico ?? null });
  if (error) return falla(error.message);
  revalidatePath(`/aperturas/${id}`);
  return listo();
}

export async function subirInformeApertura(datos: {
  id: string;
  informe: string;
  faltantes?: string | null;
  tecnico?: string | null;
  fotos: { path: string; nombre: string; tipo: string; tamano: number }[];
}) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("almacen_informe_apertura", {
    p_id: datos.id,
    p_informe: datos.informe,
    p_faltantes: datos.faltantes ?? null,
    p_fotos: datos.fotos,
    p_tecnico: datos.tecnico ?? null,
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
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_apertura_llamada", { p_id: id, p_motivo: motivo });
  if (error) return falla(error.message);
  const { data: a } = await supabase.from("aperturas_llamada").select("servicio_id, cuenta_id").eq("id", id).maybeSingle();
  revalidatePath(`/aperturas/${id}`);
  return listo(a?.servicio_id, a?.cuenta_id);
}
