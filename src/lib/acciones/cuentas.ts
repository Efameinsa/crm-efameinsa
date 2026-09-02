"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorDocumento, type TipoDocumento } from "@/lib/documento";
import { notificar } from "@/lib/notificaciones";

// El resumen narrativo vive en cuentas.notas (existe desde B1, sin UI hasta
// ahora). La RLS ya resuelve quién puede editar: cuentas_comercial (FOR ALL,
// comercial_id = auth.uid()) permite solo al dueño ACTUAL de la cartera;
// cuentas_backoffice a gerencia/admin. Un comercial que perdió la cartera
// puede LEER el resumen (la ficha se lo muestra) pero no editarlo.
export async function actualizarResumenCuenta(
  cuentaId: string,
  notas: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  // Supabase no lanza excepción cuando RLS filtra un update — solo afecta 0
  // filas (bug pagado en B6). Por eso se revisa el .select() de vuelta.
  const { data, error } = await supabase
    .from("cuentas")
    .update({ notas: notas.trim() || null })
    .eq("id", cuentaId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Solo el dueño actual de la cartera puede editar el resumen" };
  }

  revalidatePath(`/comercial/cartera/${cuentaId}`);
  revalidatePath(`/gerencia/clientes/${cuentaId}`);
  return { error: null };
}

/**
 * Vincular el cliente a un RUC / DNI y corregir su razón social.
 *
 * Pedido de Darwin el 24-08, junto con la edición de contactos: «ahí también
 * debería poder vincularse a un RUC y/o razón social».
 *
 * Hace falta porque 5.158 de las ~16.000 cuentas están como SIN_DOC: cuando el
 * contacto entra por la web o por WhatsApp, Central lo registra con el nombre
 * de la persona y nada más. El RUC aparece después, cuando el comercial
 * conversa — y hasta hoy no había dónde anotarlo, así que la cotización salía
 * a nombre de una persona y sin número de documento, que es justo lo que
 * contabilidad necesita para armar el expediente.
 *
 * NO cambia una cotización ya emitida: su `cliente_snapshot` se congeló al
 * crearla (migración 0012). Corrige lo que salga de acá en adelante.
 *
 * La dirección NO va acá: probado el 26-08 y descartado porque un cliente
 * puede tener varias sedes. Vive por contacto (`guardarContacto` en
 * contactos.ts) y la cotización imprime la del contacto principal.
 *
 * Desde el 01-09 también guarda el RUBRO (`rubroId`; null = sin rubro), para
 * que el comercial pueda ir clasificando su cartera desde la ficha y después
 * filtrarla («hoy me voy a centrar en mineras», Carlos). Si no viene, no se
 * toca. Mismo permiso que el resto: solo el dueño actual de la cartera.
 */
export async function actualizarIdentidadCuenta(datos: {
  cuentaId: string;
  tipoDoc: TipoDocumento;
  numDoc: string;
  razonSocial: string;
  rubroId?: number | null;
}): Promise<{ error: string | null; avisoDuplicado?: string }> {
  const razonSocial = datos.razonSocial.trim().replace(/\s+/g, " ");
  if (!razonSocial) return { error: "La razón social no puede ir vacía" };

  const problema = errorDocumento(datos.tipoDoc, datos.numDoc);
  if (problema) return { error: problema };

  // Sin documento no se guarda número: dejarlo colgado haría creer que el
  // cliente está identificado cuando no lo está.
  const numDoc =
    datos.tipoDoc === "SIN_DOC"
      ? null
      : datos.tipoDoc === "CE"
        ? datos.numDoc.trim()
        : datos.numDoc.replace(/\D/g, "");

  const supabase = await createClient();

  // Avisar —no bloquear— si otra cuenta ya tiene ese documento. Es el problema
  // de las 494 cuentas partidas en dos: fusionarlas es una decisión con plata
  // de por medio (a quién le queda el historial de ventas), no algo que deba
  // pasar solo porque alguien tecleó un RUC.
  let avisoDuplicado: string | undefined;
  if (numDoc) {
    const { data: otras } = await supabase
      .from("cuentas")
      .select("id, razon_social")
      .eq("num_doc", numDoc)
      .neq("id", datos.cuentaId)
      .limit(2);
    if (otras && otras.length > 0) {
      avisoDuplicado = `Ese documento ya lo tiene ${otras[0].razon_social}${otras.length > 1 ? ` y ${otras.length - 1} más` : ""}. Quedaron dos fichas del mismo cliente: avise para unirlas.`;
    }
  }

  // `.select()` de vuelta: cuando RLS filtra, el update no da error, afecta
  // cero filas (mismo bug de siempre).
  const cambios: Record<string, unknown> = { tipo_doc: datos.tipoDoc, num_doc: numDoc, razon_social: razonSocial };
  if (datos.rubroId !== undefined) {
    if (datos.rubroId !== null && (!Number.isInteger(datos.rubroId) || datos.rubroId <= 0)) {
      return { error: "Ese rubro no existe" };
    }
    cambios.rubro_id = datos.rubroId;
  }
  const { data, error } = await supabase
    .from("cuentas")
    .update(cambios)
    .eq("id", datos.cuentaId)
    .select("id");
  if (error) {
    // 02-09 (Santos): Katerine quiso poner el RUC 20326700321 y el sistema le
    // contestó «duplicate key value violates unique constraint uq_cuentas_doc».
    // Ese RUC ya es de una ficha en la cartera de Ariana, que ella no ve por
    // RLS: el aviso de arriba no la encontró y el índice único la frenó con
    // un mensaje de base de datos. Un cliente tiene UNA ficha en el CRM y el
    // RUC manda sobre el nombre; lo que corresponde es pedir el traspaso o la
    // unión, no duplicarla.
    if (error.code === "23505") {
      return {
        error:
          "Ese RUC/DNI ya está registrado en el CRM en la cartera de otro comercial. Un cliente tiene una sola ficha: pida a gerencia el traspaso de cartera o la unión de las fichas.",
      };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: "Solo el dueño actual de la cartera puede corregir los datos del cliente" };
  }

  revalidatePath("/comercial", "layout");
  revalidatePath("/gerencia", "layout");
  return { error: null, avisoDuplicado };
}

/**
 * Pasa el cliente —y sus oportunidades abiertas— a otra cartera.
 *
 * Nació el 25-08 tras dos traspasos por script el mismo día (SAYWA → Brenda,
 * ANDES PRIME → Katerine, ambos por orden del ingeniero). El candado es el de
 * siempre: la regla del 14-08 hace de esto una decisión de gerencia, así que
 * la base exige es_backoffice() y esta acción solo se ofrece en la ficha de
 * gerencia. Central corrige errores de derivación con lo suyo (0079).
 */
export async function reasignarCartera(
  cuentaId: string,
  comercialId: string,
): Promise<{ error: string | null; movidas?: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reasignar_cartera", {
    p_cuenta_id: cuentaId,
    p_comercial_id: comercialId,
  });
  if (error) return { error: error.message };

  const r = data as { anterior: string | null; oportunidades_movidas: number; leads_movidos: number };
  const { data: cuenta } = await supabase.from("cuentas").select("razon_social").eq("id", cuentaId).maybeSingle();
  const nombre = cuenta?.razon_social ?? "Un cliente";

  // Los dos se enteran: al nuevo le llega trabajo, y al anterior el cliente le
  // desaparece de la cartera — sin aviso parecería un error del sistema.
  await notificar({
    userId: comercialId,
    tipo: "lead_asignado",
    titulo: "Cliente asignado a su cartera",
    cuerpo: `${nombre} — decisión de gerencia`,
    url: `/comercial/cartera/${cuentaId}`,
  });
  if (r.anterior && r.anterior !== comercialId) {
    await notificar({
      userId: r.anterior,
      tipo: "lead_asignado",
      titulo: "Un cliente pasó a otra cartera",
      cuerpo: `${nombre} — decisión de gerencia`,
      url: "/comercial/cartera",
    });
  }

  revalidatePath(`/gerencia/clientes/${cuentaId}`);
  revalidatePath("/gerencia/clientes");
  return { error: null, movidas: r.oportunidades_movidas };
}

/**
 * Vincula (o cambia) la carpeta del servidor de la oficina de este cliente.
 *
 * Plan 24, fase 1: el vínculo vive en `cuentas.carpetas_servidor` (0135) por
 * clase — { informes: "X:\S. PRIVADO\...", fotos: "W:\FOTOS\..." }. La
 * ruta tiene que existir en el índice `carpetas_servidor`: la URL de un form
 * la escribe cualquiera, y este es el único lugar donde se valida que la
 * carpeta es una de las del servidor y no una ruta inventada.
 *
 * Lo puede hacer cualquier usuario que vea la ficha (las políticas de
 * `cuentas` mandan) y es reversible con `ruta = null`.
 */
export async function vincularCarpetaServidor(datos: {
  cuentaId: string;
  clase: "informes" | "fotos";
  ruta: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();

  if (datos.ruta !== null) {
    const { data: carpeta } = await supabase
      .from("carpetas_servidor")
      .select("ruta, clase")
      .eq("ruta", datos.ruta)
      .maybeSingle();
    if (!carpeta) return { error: "Esa carpeta no está en el índice del servidor. Corra el indexador si es nueva." };
    if (carpeta.clase !== datos.clase) return { error: "Esa carpeta es de otra clase de documentos." };
  }

  const { data: cuenta, error: e1 } = await supabase
    .from("cuentas")
    .select("carpetas_servidor")
    .eq("id", datos.cuentaId)
    .maybeSingle();
  if (e1 || !cuenta) return { error: "No se encontró la ficha del cliente." };

  const actual = (cuenta.carpetas_servidor ?? {}) as Record<string, string>;
  if (datos.ruta === null) delete actual[datos.clase];
  else actual[datos.clase] = datos.ruta;

  const { error } = await supabase
    .from("cuentas")
    .update({ carpetas_servidor: Object.keys(actual).length ? actual : null })
    .eq("id", datos.cuentaId);
  if (error) return { error: error.message };

  revalidatePath(`/comercial/cartera/${datos.cuentaId}`);
  revalidatePath(`/gerencia/clientes/${datos.cuentaId}`);
  return { error: null };
}
