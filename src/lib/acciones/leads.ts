"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";
import { tokenizarBusqueda } from "@/lib/texto";
import { notificar } from "@/lib/notificaciones";
import { avisarLeadNuevoN8n, avisarLeadDerivadoN8n } from "@/lib/avisos-n8n";
import { esquemaCaptura, esquemaAdjuntosLead, type AdjuntoLead } from "@/lib/validaciones/lead";
import { CANAL_LABEL } from "@/lib/canal-contacto";

export interface ResultadoDuplicado {
  cuenta: { id: string; razon_social: string; comercial_nombre: string | null } | null;
  leadPendiente: { id: string; codigo: string | null; recibido_at: string } | null;
}

// R2: se llama mientras Central escribe teléfono/documento, para avisar antes
// de registrar si ya existe el cliente (y de quién es la cartera) o si ya hay
// un contacto pendiente muy parecido sin procesar todavía.
export async function buscarDuplicado(datos: {
  telefono?: string;
  numDoc?: string;
}): Promise<ResultadoDuplicado> {
  const telefonoNorm = normalizarTelefono(datos.telefono);
  const numDoc = datos.numDoc?.replace(/\D/g, "") || null;

  if (!telefonoNorm && !numDoc) {
    return { cuenta: null, leadPendiente: null };
  }

  const supabase = await createClient();

  let cuentaId: string | null = null;
  let cuenta: ResultadoDuplicado["cuenta"] = null;

  if (numDoc) {
    const { data } = await supabase
      .from("cuentas")
      .select("id, razon_social, perfiles(nombre)")
      .eq("num_doc", numDoc)
      .neq("tipo_doc", "SIN_DOC")
      .maybeSingle();
    if (data) {
      cuentaId = data.id;
      cuenta = {
        id: data.id,
        razon_social: data.razon_social,
        comercial_nombre: (data.perfiles as unknown as { nombre: string } | null)?.nombre ?? null,
      };
    }
  }

  if (!cuenta && telefonoNorm) {
    const { data } = await supabase
      .from("contactos")
      .select("cuenta_id, cuentas(id, razon_social, comercial_id, perfiles(nombre))")
      .eq("telefono_normalizado", telefonoNorm)
      .limit(1)
      .maybeSingle();
    const c = data?.cuentas as unknown as
      | { id: string; razon_social: string; perfiles: { nombre: string } | null }
      | null;
    if (c) {
      cuentaId = c.id;
      cuenta = { id: c.id, razon_social: c.razon_social, comercial_nombre: c.perfiles?.nombre ?? null };
    }
  }

  let leadPendiente: ResultadoDuplicado["leadPendiente"] = null;
  if (!cuentaId) {
    // Solo importa avisar de un lead pendiente si no es ya un cliente conocido
    // (ese caso lo resuelve la sugerencia de cartera, no un aviso de duplicado).
    let query = supabase
      .from("leads")
      .select("id, codigo, recibido_at")
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: false })
      .limit(1);

    if (numDoc && telefonoNorm) {
      query = query.or(`num_doc.eq.${numDoc},telefono_normalizado.eq.${telefonoNorm}`);
    } else if (numDoc) {
      query = query.eq("num_doc", numDoc);
    } else if (telefonoNorm) {
      query = query.eq("telefono_normalizado", telefonoNorm);
    }

    const { data } = await query.maybeSingle();
    if (data) leadPendiente = data;
  }

  return { cuenta, leadPendiente };
}

export async function registrarContacto(
  formData: FormData,
): Promise<{ error: string | null; codigo?: string }> {
  const datos = esquemaCaptura.safeParse(Object.fromEntries(formData));
  if (!datos.success) {
    return { error: datos.error.issues[0].message };
  }
  const d = datos.data;

  // La foto o el PDF que el prospecto mandó por WhatsApp (pedido de Central
  // 25-08). El formulario ya los subió al bucket 'adjuntos'; acá solo llegan
  // los metadatos, como en las gestiones (0029/0082).
  let adjuntos: AdjuntoLead[] = [];
  const adjuntosBruto = formData.get("adjuntos");
  if (typeof adjuntosBruto === "string" && adjuntosBruto) {
    try {
      const r = esquemaAdjuntosLead.safeParse(JSON.parse(adjuntosBruto));
      if (!r.success) return { error: "Los adjuntos no son válidos. Quítelos y vuelva a agregarlos." };
      adjuntos = r.data;
    } catch {
      return { error: "Los adjuntos no son válidos. Quítelos y vuelva a agregarlos." };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada" };

  // R1: si no es comercial, el triaje termina aquí mismo.
  const esComercial = d.area_destino === "comercial";

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      canal: d.canal,
      area_destino: d.area_destino,
      estado: esComercial ? "pendiente_triaje" : "derivado_area",
      nombre_contacto: d.nombre_contacto,
      telefono: d.telefono || null,
      num_doc: d.num_doc ? d.num_doc.replace(/\D/g, "") : null,
      razon_social: d.razon_social || null,
      email: d.email || null,
      mensaje: d.mensaje || null,
      adjuntos,
      recibido_por: user.id,
    })
    .select("codigo")
    .single();

  if (error) return { error: error.message };

  if (esComercial) {
    const canalLegible = CANAL_LABEL[d.canal] ?? d.canal;
    const cuerpo = d.razon_social
      ? `${d.nombre_contacto} · ${canalLegible} · ${d.razon_social}`
      : `${d.nombre_contacto} · ${canalLegible}`;
    await notificar({
      rol: "gerencia",
      tipo: "lead_registrado",
      titulo: "Nuevo contacto en Central",
      cuerpo,
      url: "/gerencia",
    });
    await avisarLeadNuevoN8n({
      titulo: "Nuevo contacto registrado por Central",
      codigo: lead.codigo,
      nombre: d.nombre_contacto,
      telefono: d.telefono || null,
      email: d.email || null,
      canal: d.canal,
      razonSocial: d.razon_social || null,
      // El correo no lleva los archivos: solo avisa que existen (se ven en el CRM).
      mensaje:
        [
          d.mensaje,
          adjuntos.length
            ? `Incluye ${adjuntos.length} archivo${adjuntos.length === 1 ? "" : "s"} adjunto${adjuntos.length === 1 ? "" : "s"} (ver en el CRM)`
            : "",
        ]
          .filter(Boolean)
          .join(" — ") || null,
    });
  }

  revalidatePath("/central");
  return { error: null, codigo: lead.codigo ?? undefined };
}

export async function asignarLead(
  leadId: string,
  comercialId: string,
  // Solo cuando el destino es el área de postventa: de qué clase es el caso
  // (garantía / repuesto / mantenimiento). La función lo exige — sin esto la
  // vista de postventa no distingue un reclamo de garantía de un pedido de
  // repuesto (migración 0080).
  tipoPostventa?: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: oportunidadId, error } = await supabase.rpc("asignar_lead", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
    p_tipo_postventa: tipoPostventa ?? null,
  });
  if (error) return { error: error.message };

  const [{ data: oportunidad }, { data: lead }, { data: perfiles }] = await Promise.all([
    supabase.from("oportunidades").select("cuentas(razon_social)").eq("id", oportunidadId).maybeSingle(),
    supabase.from("leads").select("codigo, nombre_contacto, telefono, canal").eq("id", leadId).maybeSingle(),
    supabase.from("perfiles").select("id, nombre").in("id", user ? [comercialId, user.id] : [comercialId]),
  ]);
  const razonSocial =
    (oportunidad?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Nuevo contacto";
  const nombreComercial = perfiles?.find((p) => p.id === comercialId)?.nombre ?? "Comercial";
  const nombreDeriva = user ? perfiles?.find((p) => p.id === user.id)?.nombre ?? null : null;

  await notificar({
    userId: comercialId,
    tipo: "lead_asignado",
    titulo: "Nuevo contacto asignado",
    cuerpo: razonSocial,
    url: `/comercial/oportunidades/${oportunidadId}`,
  });
  // Correo a gerencia por DERIVACIÓN (reunión 19-08: "una sola vez, cuando
  // Central lo deriva, no cuando llega").
  await avisarLeadDerivadoN8n({
    codigo: lead?.codigo ?? null,
    nombre: lead?.nombre_contacto ?? razonSocial,
    razonSocial,
    telefono: lead?.telefono ?? null,
    canal: CANAL_LABEL[lead?.canal ?? ""] ?? lead?.canal ?? "—",
    comercial: nombreComercial,
    derivadoPor: nombreDeriva,
  });

  revalidatePath("/central");
  return { error: null };
}

// Las tres salidas de la bandeja comparten el mismo candado: solo actúan sobre
// un contacto que TODAVÍA está pendiente de triaje. Sin `.select()`, cuando la
// condición no se cumple Postgres actualiza cero filas y no devuelve error —
// la pantalla cantaba «Contacto descartado» y no había pasado nada. Ocurre de
// verdad con la bandeja abierta en dos pestañas, que es como trabaja Central.
async function salirDeLaBandeja(
  leadId: string,
  cambios: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(cambios)
    .eq("id", leadId)
    .eq("estado", "pendiente_triaje")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Ese contacto ya salió de la bandeja. Recargue la página." };
  }
  revalidatePath("/central");
  return { error: null };
}

export async function descartarLead(leadId: string): Promise<{ error: string | null }> {
  return salirDeLaBandeja(leadId, { estado: "descartado" });
}

export async function marcarDuplicado(
  leadId: string,
  duplicadoDeId: string,
): Promise<{ error: string | null }> {
  return salirDeLaBandeja(leadId, { estado: "duplicado", duplicado_de: duplicadoDeId });
}

/**
 * Saca de la bandeja un contacto que YA está en el sistema, vinculándolo a la
 * cuenta que le corresponde.
 *
 * POR QUÉ NO SIRVE «DESCARTAR» PARA ESTO. En el CRM `descartado` significa que
 * el contacto no procedía —spam, número equivocado, alguien que no compra— y
 * el panel de marketing de gerencia lo muestra literal: «campaña X · N
 * descartados». Estos contactos sí procedieron: se derivaron y se trabajaron,
 * y alguno hasta llegó a cotización. Marcarlos como descartados haría figurar
 * a la campaña que trajo esos clientes como una campaña que trae basura, y el
 * costo por lead que ve gerencia saldría mentiroso.
 *
 * `duplicado` dice la verdad —el contacto llegó, pero ya estaba registrado— y
 * `cuenta_id` deja el rastro de a quién corresponde, que es justamente para lo
 * que existe esa columna («vinculado tras dedup», migración 0001).
 *
 * `duplicado_de` se queda en null a propósito: apunta a otro LEAD, y en el caso
 * que originó todo esto el registro original no es un lead sino la cuenta que
 * nació del Excel de Central (el mismo contacto entró por llamada, se anotó ahí
 * y se derivó, y aparte entró por el formulario de publicidad).
 */
export async function marcarLeadYaGestionado(
  leadId: string,
  cuentaId: string,
): Promise<{ error: string | null }> {
  return salirDeLaBandeja(leadId, { estado: "duplicado", cuenta_id: cuentaId });
}

export interface CoincidenciaCartera {
  cuentaId: string;
  razonSocial: string;
  comercialId: string | null;
  comercialNombre: string | null;
  codigoComercial: string | null;
  ultimaVentaAt: string | null;
  motivo: "documento" | "telefono" | "correo" | "nombre";
}

// Pre-filtro de la asignación (pedido de Carlos 19-08): antes de derivar,
// Central ve a quién pertenece —o posiblemente pertenezca— el contacto,
// buscando en TODO el histórico cargado por RUC/DNI, teléfono, correo y
// nombre (tokens contra razón social y contra los contactos de cada cuenta).
// El orden de los motivos ES el orden de confianza: documento > teléfono >
// correo > nombre (puede haber muchas "María Leguía": el nombre solo
// advierte, no decide).
export async function buscarCoincidencias(datos: {
  nombre?: string | null;
  razonSocial?: string | null;
  telefono?: string | null;
  numDoc?: string | null;
  email?: string | null;
}): Promise<CoincidenciaCartera[]> {
  const supabase = await createClient();
  const CAMPOS = "id, razon_social, ultima_venta_at, comercial_id, perfiles(nombre, codigo_comercial)";
  interface CuentaFila {
    id: string;
    razon_social: string;
    ultima_venta_at: string | null;
    comercial_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }
  const out = new Map<string, CoincidenciaCartera>();
  const agregar = (filas: (CuentaFila | null)[] | null | undefined, motivo: CoincidenciaCartera["motivo"]) => {
    for (const c of filas ?? []) {
      if (!c || out.has(c.id)) continue;
      const p = c.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
      out.set(c.id, {
        cuentaId: c.id,
        razonSocial: c.razon_social,
        comercialId: c.comercial_id,
        comercialNombre: p?.nombre ?? null,
        codigoComercial: p?.codigo_comercial ?? null,
        ultimaVentaAt: c.ultima_venta_at,
        motivo,
      });
    }
  };

  const numDoc = datos.numDoc?.replace(/\D/g, "") || null;
  if (numDoc && numDoc.length >= 8) {
    const { data } = await supabase.from("cuentas").select(CAMPOS).eq("num_doc", numDoc).limit(3);
    agregar(data as unknown as CuentaFila[], "documento");
  }
  const tel = normalizarTelefono(datos.telefono ?? undefined);
  if (tel) {
    const { data } = await supabase.from("contactos").select(`cuentas(${CAMPOS})`).eq("telefono_normalizado", tel).limit(4);
    agregar((data ?? []).map((x) => x.cuentas as unknown as CuentaFila), "telefono");
  }
  const email = datos.email?.trim().toLowerCase();
  if (email && email.includes("@")) {
    const { data } = await supabase.from("contactos").select(`cuentas(${CAMPOS})`).ilike("email", email).limit(4);
    agregar((data ?? []).map((x) => x.cuentas as unknown as CuentaFila), "correo");
  }
  const texto = [datos.nombre, datos.razonSocial].filter(Boolean).join(" ");
  const tokens = tokenizarBusqueda(texto);
  if (tokens.length > 0 && out.size < 6) {
    let q = supabase.from("cuentas").select(CAMPOS);
    for (const t of tokens) q = q.ilike("razon_social", `%${t}%`);
    const { data } = await q.limit(5);
    agregar(data as unknown as CuentaFila[], "nombre");
    if (out.size < 6) {
      let q2 = supabase.from("contactos").select(`cuentas(${CAMPOS})`);
      for (const t of tokens) q2 = q2.ilike("nombre", `%${t}%`);
      const { data: d2 } = await q2.limit(5);
      agregar((d2 ?? []).map((x) => x.cuentas as unknown as CuentaFila), "nombre");
    }
  }
  const orden: Record<CoincidenciaCartera["motivo"], number> = { documento: 0, telefono: 1, correo: 2, nombre: 3 };
  return [...out.values()].sort((a, b) => orden[a.motivo] - orden[b.motivo]).slice(0, 6);
}

export interface AnalisisCaptura {
  coincidencias: CoincidenciaCartera[];
  leadPendiente: ResultadoDuplicado["leadPendiente"];
}

// Análisis en vivo del formulario de captura (pedido de Central 25-08): que
// nombre, teléfono y RUC/DNI funcionen «también como buscador automático para
// analizar si le corresponde posiblemente a un comercial». Antes de este
// cambio el formulario solo avisaba por teléfono/documento exactos
// (buscarDuplicado); ahora usa el MISMO pre-filtro de cartera que el diálogo
// de asignar —documento > teléfono > correo > nombre— y además mantiene el
// aviso de contacto pendiente repetido en la bandeja.
export async function analizarCaptura(datos: {
  nombre?: string | null;
  razonSocial?: string | null;
  telefono?: string | null;
  numDoc?: string | null;
  email?: string | null;
}): Promise<AnalisisCaptura> {
  const [coincidencias, duplicado] = await Promise.all([
    buscarCoincidencias(datos),
    buscarDuplicado({ telefono: datos.telefono ?? undefined, numDoc: datos.numDoc ?? undefined }),
  ]);
  return { coincidencias, leadPendiente: duplicado.leadPendiente };
}

/**
 * Devuelve a la cola de triaje comercial un contacto que se registró con el
 * área equivocada.
 *
 * 24-08: Central registró un prospecto que pedía cotización de equipos de
 * lavandería eligiendo área "otros". Al no ser comercial, el lead quedó en
 * 'derivado_area' y salió de la bandeja — y como ninguna pantalla leía ese
 * estado, desapareció sin que nadie se enterara. De ahí la pregunta de Central,
 * «¿cuántos minutos se demora para ingreso?»: entraba al instante, pero no se
 * veía por ningún lado.
 */
export async function devolverLeadAComercial(leadId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ estado: "pendiente_triaje", area_destino: "comercial" })
    .eq("id", leadId)
    .eq("estado", "derivado_area")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Ese contacto ya no está derivado a otra área" };
  }
  revalidatePath("/central");
  return { error: null };
}

/**
 * Corrige una derivación equivocada: el contacto pasa al comercial que
 * correspondía.
 *
 * Central lo pidió el 25-08 — «quiero verificar a quién derivé para poder
 * redireccionar a otra comercial, ya que hubo un error al asignar». Hasta hoy
 * una derivación era definitiva y un error de un clic se arreglaba por
 * WhatsApp, con el contacto en la bandeja de quien no le correspondía.
 *
 * El límite lo pone la base (migración 0079): si el comercial anterior ya
 * cotizó, ya registró una gestión o el cliente ya era suyo de antes, esto deja
 * de ser un error de asignación y pasa a ser un traspaso de cartera, que
 * decide gerencia. El mensaje que vuelve lo dice con esas palabras.
 */
export async function redirigirLead(
  leadId: string,
  comercialId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: anterior } = await supabase
    .from("leads")
    .select("codigo, nombre_contacto, asignado_a")
    .eq("id", leadId)
    .maybeSingle();

  const { data: oportunidadId, error } = await supabase.rpc("redirigir_lead", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
  });
  if (error) return { error: error.message };

  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombre")
    .in("id", [comercialId, anterior?.asignado_a].filter(Boolean) as string[]);
void perfiles;

  // Al nuevo se le avisa como en cualquier derivación. Al anterior también:
  // el contacto le desaparece de la lista y sin aviso parecería un error del
  // sistema.
  await notificar({
    userId: comercialId,
    tipo: "lead_asignado",
    titulo: "Contacto reasignado a usted",
    cuerpo: anterior?.nombre_contacto ?? "Nuevo contacto",
    url: oportunidadId ? `/comercial/oportunidades/${oportunidadId}` : "/comercial",
  });
  if (anterior?.asignado_a && anterior.asignado_a !== comercialId) {
    await notificar({
      userId: anterior.asignado_a,
      tipo: "lead_asignado",
      titulo: "Un contacto pasó a otro comercial",
      cuerpo: `${anterior?.nombre_contacto ?? anterior?.codigo ?? "Un contacto"} — Central corrigió la derivación`,
      url: "/comercial",
    });
  }

  revalidatePath("/central");
  revalidatePath("/central/derivados");
  return { error: null };
}

/**
 * El recordatorio de urgencia: Central le avisa al comercial que un cliente
 * está esperando y nadie lo atiende.
 *
 * Nació el 25-08: Mi Casita Facilita escribió por formulario, volvió por
 * WhatsApp y le dijo a Central que C5 «se demora en hacerle caso». Central
 * veía la demora en «Lo que derivé» pero su única herramienta era reclamar
 * por WhatsApp, fuera del sistema y sin rastro.
 *
 * Qué pasa al disparar (migración 0082):
 *  · Al comercial le llega EN VIVO: ventanita que no se cierra sola, sonido
 *    y push al celular, con el botón que abre la oportunidad.
 *  · Queda registrado — la lista de derivados muestra cuándo se avisó.
 *  · Del SEGUNDO aviso por el mismo contacto en adelante, gerencia también se
 *    entera: si el recordatorio no bastó, ya no es un olvido.
 */
export async function enviarUrgencia(
  leadId: string,
  mensaje: string,
): Promise<{ error: string | null; avisoNumero?: number }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("enviar_urgencia", {
    p_lead_id: leadId,
    p_mensaje: mensaje || null,
  });
  if (error) return { error: error.message };

  const r = data as {
    comercial_id: string;
    comercial_nombre: string | null;
    comercial_codigo: string | null;
    oportunidad_id: string | null;
    aviso_numero: number;
    contacto: string;
  };

  const detalle = mensaje.trim() || "Central pide atenderlo de inmediato.";
  await notificar({
    userId: r.comercial_id,
    tipo: "urgencia",
    titulo: `${r.contacto} está esperando que lo atiendan`,
    cuerpo: detalle,
    url: r.oportunidad_id ? `/comercial/oportunidades/${r.oportunidad_id}` : "/comercial",
  });

  if (r.aviso_numero >= 2) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${r.contacto} sigue sin ser atendido`,
      cuerpo: `Central ya envió ${r.aviso_numero} avisos de urgencia a ${r.comercial_codigo ?? r.comercial_nombre ?? "su comercial"}. ${detalle}`,
      url: "/gerencia",
    });
  }

  revalidatePath("/central/derivados");
  return { error: null, avisoNumero: r.aviso_numero };
}
