"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { celularesDe, normalizarTelefono } from "@/lib/telefono";
import { tokenizarBusqueda } from "@/lib/texto";
import { notificar } from "@/lib/notificaciones";
import { avisarLeadNuevoN8n, avisarLeadDerivadoN8n } from "@/lib/avisos-n8n";
import { esquemaCaptura, esquemaAdjuntosLead, type AdjuntoLead } from "@/lib/validaciones/lead";
import { CANAL_LABEL } from "@/lib/canal-contacto";
import { historiaDeCuentas, type HistoriaDelCliente } from "@/lib/central/historia-del-cliente";

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

export interface ContactoDeLaCuenta {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  esPrincipal: boolean;
}

/**
 * LOS CONTACTOS DE ESA EMPRESA, PARA ELEGIR EN VEZ DE VOLVER A TIPEAR.
 *
 * Carlos, 22-09, mirando el registro de Rivera escrito distinto cada vez
 * («Rivera cierto verda»… con minúscula… le puso un apellido más… otra
 * persona sale así): «más bien agrega el contacto. Hoy ingresa su esposa un
 * nuevo contacto. Agregas tu contacto, y para la siguiente oportunidad solo
 * jalas el nuevo contacto. No tienes que volver a escribirlo».
 *
 * Se llama después de que el usuario elige la empresa de sus coincidencias
 * (`buscarCoincidencias`), así que la misma RLS que le deja leer esa cuenta
 * (`contactos_por_cuenta`: la cuenta es de su cartera, o es Central/backoffice)
 * le deja leer sus contactos.
 */
export async function contactosDeLaCuenta(cuentaId: string): Promise<ContactoDeLaCuenta[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contactos")
    .select("id, nombre, cargo, telefono, email, es_principal")
    .eq("cuenta_id", cuentaId)
    .order("es_principal", { ascending: false })
    .order("nombre")
    .limit(20);
  return (data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    cargo: c.cargo,
    telefono: c.telefono,
    email: c.email,
    esPrincipal: c.es_principal === true,
  }));
}

export async function registrarContacto(
  formData: FormData,
): Promise<{ error: string | null; codigo?: string; repetido?: boolean; minutos?: number }> {
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

  // EL MISMO CONTACTO DOS VECES NO. Almacén, 29-09: PRO-10052 a las 11:00 y
  // PRO-10053 a las 11:01, iguales; Katerine el 24-09 (PRO-09876/09877), y 9
  // pares en 60 días entre Central, Brenda, Katerine y Almacén. Si esta misma
  // persona ya mandó ese teléfono y sigue en la bandeja de Central, no se crea
  // otro: se le dice cuál es, como en el registro de postventa (0206). Si el
  // primero tenía un dato mal, se corrige con código desde «Lo que mandé a
  // Central» (0338).
  const digitos = (d.telefono ?? "").replace(/\D/g, "").slice(-9);
  if (digitos.length >= 6) {
    const { data: pendientes } = await supabase
      .from("leads")
      .select("codigo, telefono, recibido_at")
      .eq("recibido_por", user.id)
      .eq("estado", "pendiente_triaje")
      .gte("recibido_at", new Date(Date.now() - 24 * 36e5).toISOString())
      .order("recibido_at", { ascending: false })
      .limit(50);
    const previo = (pendientes ?? []).find((p) => (p.telefono ?? "").replace(/\D/g, "").slice(-9) === digitos);
    if (previo) {
      const minutos = Math.round((Date.now() - new Date(previo.recibido_at).getTime()) / 60000);
      return { error: null, codigo: previo.codigo ?? undefined, repetido: true, minutos };
    }
  }

  // R1: si no es comercial, el triaje termina aquí mismo.
  const esComercial = d.area_destino === "comercial";

  // WhatsApp de campañas, fase 1 (14-09): el código va SOLO con canal
  // whatsapp — con cualquier otro se ignora, aunque el campo venga en el
  // FormData (por ejemplo si el usuario lo eligió y después cambió el canal).
  // Se guarda denormalizado (código + plataforma) al momento del registro,
  // igual que gclid/utm_campaign en los webhooks: si el código cambia de
  // nombre después, este contacto conserva de dónde vino de verdad.
  let codigoCampaniaWa: string | null = null;
  let plataformaCampaniaWa: string | null = null;
  if (d.canal === "whatsapp" && d.codigo_campania_wa) {
    const { data: campania } = await supabase
      .from("campanias_whatsapp")
      .select("codigo, plataforma")
      .ilike("codigo", d.codigo_campania_wa)
      .eq("activa", true)
      .maybeSingle();
    if (campania) {
      codigoCampaniaWa = campania.codigo;
      plataformaCampaniaWa = campania.plataforma;
    }
    // Si no se encuentra (código dado de baja entre que se abrió el formulario
    // y se envió), no se bloquea el registro: el contacto entra igual, solo
    // sin el chip de campaña. Perder el registro por esto sería peor.
  }

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
      codigo_campania_wa: codigoCampaniaWa,
      plataforma_campania_wa: plataformaCampaniaWa,
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
  /** El código del supervisor, cuando la derivación mueve la cartera (0107). */
  pin?: string | null,
  /**
   * Instituciones con sedes bajo un mismo RUC (0158): a qué sede va este
   * contacto — una existente o una nueva con el nombre que dio Central.
   */
  sede?: EleccionSede | null,
  /**
   * LA FICHA QUE CENTRAL ELIGIÓ, O LA RAZÓN DE NO ELEGIR NINGUNA (0223).
   *
   * GATE GOURMET, 10-09: el correo entró sin RUC, el diálogo mostró las fichas
   * de C4 y C1 como coincidencias, y Central lo derivó como «Cliente nuevo» a
   * C5: nació una tercera ficha vacía y C5 reclamó al día siguiente que «no
   * jaló historial». Hacer clic en la coincidencia solo preseleccionaba al
   * comercial; la ficha nueva se creaba igual, porque sin RUC ni celular
   * conocido `asignar_lead` no tiene con qué unirla.
   *
   * · `cuentaElegida`: el contacto se une a esa ficha ANTES de derivar, con
   *   el mismo RPC de «Es un cliente que ya tenemos»; el expediente nace ahí y
   *   el historial viaja con él.
   * · `motivoNuevo`: si hay coincidencias y Central no eligió ninguna, tiene
   *   que decir por qué es un cliente nuevo. Queda escrito en la derivación.
   */
  extra?: { cuentaElegida?: string | null; motivoUnion?: string | null; motivoNuevo?: string | null } | null,
): Promise<{ error: string | null; requierePin?: boolean; sumadoAExpediente?: boolean; requiereMotivoNuevo?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let pinYaUsado = false;

  // SE COMPRUEBA EN EL SERVIDOR, no solo en el botón: la regla vale aunque el
  // diálogo cambie. Solo cuando el contacto todavía no está en ninguna ficha —
  // si ya lo está (sede elegida, «Es un cliente que ya tenemos»), no hay nada
  // que decidir.
  const { data: leadAntes } = await supabase
    .from("leads")
    .select("cuenta_id, nombre_contacto, razon_social, telefono, num_doc, email")
    .eq("id", leadId)
    .maybeSingle();
  if (leadAntes && !leadAntes.cuenta_id && !sede) {
    if (extra?.cuentaElegida) {
      const union = await unirLeadACuenta(
        leadId,
        extra.cuentaElegida,
        pin ?? "",
        extra.motivoUnion?.trim() || "Central lo unió a esta ficha al derivarlo: coincidía en la bandeja.",
      );
      if (union.error) return { error: union.error };
    } else {
      const coincidencias = await buscarCoincidencias({
        nombre: leadAntes.nombre_contacto,
        razonSocial: leadAntes.razon_social,
        telefono: leadAntes.telefono,
        numDoc: leadAntes.num_doc,
        email: leadAntes.email,
      });
      // Por RUC o por celular `asignar_lead` lo une solo: ahí no hay ficha
      // nueva que justificar. Por correo o por nombre, sí la habría.
      const loUneSolo = coincidencias.some((c) => c.motivo === "documento" || c.motivo === "telefono");
      if (coincidencias.length > 0 && !loUneSolo && (extra?.motivoNuevo?.trim().length ?? 0) < 10) {
        const c = coincidencias[0];
        return {
          error: `Este contacto coincide con ${c.razonSocial}${c.codigoComercial ? ` (cartera de ${c.codigoComercial})` : ""}. Elija esa ficha para unirlo, o escriba por qué es un cliente nuevo.`,
          requiereMotivoNuevo: true,
        };
      }
      // Y si esa coincidencia es la cartera de OTRO comercial, la razón no
      // alcanza: lo autoriza gerencia con su código (HOTEL PULLMAN / ATTKO,
      // 07-10: Central lo derivó a C1 como nuevo y el cliente era de C4). Se
      // valida acá —el código se quema al usarse— y queda escrito en la nota.
      const ajena = coincidencias.find((c) => c.comercialId && c.comercialId !== comercialId);
      if (ajena && !loUneSolo && !tipoPostventa) {
        if (!pin) {
          return {
            error: `Este contacto coincide con ${ajena.razonSocial}${ajena.codigoComercial ? `, que es de la cartera de ${ajena.codigoComercial}` : ""}. Derivarlo como cliente nuevo a otro comercial lo autoriza gerencia con su código.`,
            requierePin: true,
          };
        }
        const { data: supervisor, error: errorPin } = await supabase.rpc("validar_pin_supervisor", { p_pin: pin });
        if (errorPin || !supervisor) {
          return { error: errorPin?.message.replace(/^[A-Z0-9]{5}:\s*/, "") ?? "El código del supervisor no es válido.", requierePin: true };
        }
        pinYaUsado = true;
        extra = { ...extra, motivoNuevo: `${extra?.motivoNuevo?.trim() ?? ""} (autorizado con código de supervisor; coincidía con ${ajena.razonSocial}, cartera de ${ajena.codigoComercial ?? "otro comercial"})` };
      }
    }
  }
  // La sede se fija ANTES de asignar: queda en leads.cuenta_id, que es la
  // ficha que `asignar_lead` respeta sin volver a buscar por RUC (0143/0158).
  if (sede) {
    const { error: errorSede } = await supabase.rpc("elegir_sede_del_lead", {
      p_lead_id: leadId,
      p_cuenta_id: "cuentaId" in sede ? sede.cuentaId : null,
      p_nombre_nueva: "nombreNueva" in sede ? sede.nombreNueva : null,
    });
    if (errorSede) return { error: errorSede.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  }
  // Pasa por `asignar_lead_con_pin` (0107): si la derivación le quitaría el
  // cliente a otro comercial, la base exige el código del supervisor. La
  // versión sin autorización quedó revocada, así que esta no es la puerta
  // amable — es la única que hay.
  // PUESTA EN MARCHA (0231): el tipo del caso técnico va en `sugerido_atencion`,
  // que lee el trigger que abre la atención (0132). Desde la 0317 el
  // expediente también se llama «puesta en marcha».
  const esPuestaEnMarcha = tipoPostventa === "puesta_en_marcha";
  if (esPuestaEnMarcha) {
    const { error: eTipo } = await supabase.from("leads").update({ sugerido_atencion: "puesta_en_marcha" }).eq("id", leadId);
    if (eTipo) return { error: eTipo.message };
  }
  const { data: oportunidadId, error } = await supabase.rpc("asignar_lead_con_pin", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
    // Desde la 0317 la puesta en marcha (y el despacho) son tipos del expediente.
    p_tipo_postventa: tipoPostventa ?? null,
    p_pin: pinYaUsado ? null : (pin ?? null),
    p_nota: extra?.motivoNuevo?.trim() || null,
  });
  if (error) {
    // DERIVACION_A_POSTVENTA (0420): a postventa, Central no deriva sola.
    const requierePin = /DERIVACION_MUEVE_CARTERA|DERIVACION_A_POSTVENTA/.test(error.message);
    return {
      error: error.message
        .replace(/^[A-Z0-9]{5}:\s*/, "")
        .replace(/^(DERIVACION_MUEVE_CARTERA|DERIVACION_A_POSTVENTA):\s*/, ""),
      requierePin,
    };
  }

  const [{ data: oportunidad }, { data: lead }, { data: perfiles }] = await Promise.all([
    // lead_id recuerda al PRIMER lead del expediente: si no es este, el
    // contacto se SUMÓ a un expediente que el comercial ya tenía abierto
    // (0141) — y a Central se le dice, no se le esconde.
    supabase.from("oportunidades").select("lead_id, cuentas(razon_social)").eq("id", oportunidadId).maybeSingle(),
    supabase.from("leads").select("codigo, nombre_contacto, telefono, canal").eq("id", leadId).maybeSingle(),
    supabase.from("perfiles").select("id, nombre").in("id", user ? [comercialId, user.id] : [comercialId]),
  ]);
  const razonSocial =
    (oportunidad?.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Nuevo contacto";
  const nombreComercial = perfiles?.find((p) => p.id === comercialId)?.nombre ?? "Comercial";
  const nombreDeriva = user ? perfiles?.find((p) => p.id === user.id)?.nombre ?? null : null;

  // EL AVISO DICE QUIÉN ES (Carlos, 14-09, mirando lo que le llegó a la
  // comercial: «así como está yo no te puedo seguir; hay que hacer que
  // aparezca el nombre del prospecto»). Llevaba solo la razón social de la
  // ficha —o «Nuevo contacto» cuando no había—, y el contacto que escribió
  // (Edwin, de Constructores Romero) no aparecía por ningún lado.
  const partesAviso = [
    lead?.nombre_contacto?.trim() || null,
    razonSocial !== "Nuevo contacto" && razonSocial !== lead?.nombre_contacto?.trim() ? razonSocial : null,
    lead?.telefono?.trim() || null,
    lead?.codigo ?? null,
  ].filter((p): p is string => !!p);
  await notificar({
    userId: comercialId,
    tipo: "lead_asignado",
    titulo: "Nuevo contacto asignado",
    cuerpo: partesAviso.length ? partesAviso.join(" · ") : razonSocial,
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
  return { error: null, sumadoAExpediente: Boolean(oportunidad?.lead_id && oportunidad.lead_id !== leadId) };
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

/** A qué sede de una institución va el contacto (0158). */
export type EleccionSede = { cuentaId: string } | { nombreNueva: string };

export interface SedeDeInstitucion {
  id: string;
  razonSocial: string;
  comercialId: string | null;
  comercialNombre: string | null;
  codigoComercial: string | null;
}

export interface InstitucionConSedes {
  madre: { id: string; razonSocial: string };
  sedes: SedeDeInstitucion[];
}

// Gerencia, 02-09 (audio): «para los casos puntuales como ESSALUD, la Marina
// de Guerra y el Ministerio de Salud, solamente en esos casos, cuando se
// reconozca por el RUC deben aparecer las opciones [de sede], y ahí se puede
// derivar como negocios diferentes». Si el RUC es de una institución marcada
// con sedes (0158), devuelve la madre y sus sedes; si no, null y el diálogo
// sigue como siempre.
export async function sedesDeDocumento(numDoc: string | null | undefined): Promise<InstitucionConSedes | null> {
  const doc = numDoc?.replace(/\D/g, "") || null;
  if (!doc || doc.length !== 11) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sedes_de_documento", { p_num_doc: doc });
  if (error || !data) return null;
  const d = data as {
    madre: { id: string; razon_social: string };
    sedes: { id: string; razon_social: string; comercial_id: string | null; comercial: string | null; codigo: string | null }[];
  };
  return {
    madre: { id: d.madre.id, razonSocial: d.madre.razon_social },
    sedes: (d.sedes ?? []).map((s) => ({
      id: s.id,
      razonSocial: s.razon_social,
      comercialId: s.comercial_id,
      comercialNombre: s.comercial,
      codigoComercial: s.codigo,
    })),
  };
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
const PALABRAS_GENERICAS = new Set([
  "empresa", "privado", "privada", "natural", "persona", "particular", "negocio", "ninguno", "ninguna",
  "otro", "otros", "hotel", "hospital", "clinica", "lavanderia", "restaurante", "colegio", "senor",
  "senora", "srta", "independiente", "casa", "hogar",
]);

function empresaReconocible(tokens: string[]): string[] {
  if (tokens.length !== 1) return tokens;
  const t = tokens[0].toLowerCase();
  return t.length >= 6 && !PALABRAS_GENERICAS.has(t) ? tokens : [];
}

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
  const tel = normalizarTelefono(datos.telefono ?? undefined);
  const celulares = celularesDe(datos.telefono ?? undefined);
  const telefonos = [...new Set([tel && tel.length >= 8 ? tel : null, ...celulares].filter((x): x is string => Boolean(x)))];
  const email = datos.email?.trim().toLowerCase();
  // LA EMPRESA Y LA PERSONA SE BUSCAN POR SEPARADO.
  //
  // Iban juntas en una sola búsqueda («Ivan Garay hospital Pampas») y cada
  // palabra tenía que estar en la razón social. El 05-10 el PRO-10744 entró por
  // la web sin RUC, con un celular y un Gmail que el CRM no conocía, y la ficha
  // HOSPITAL DE PAMPAS DE TAYACAJA (C4 desde 2022) no salió porque «Ivan Garay»
  // no está en su razón social: Central lo derivó a C2 como cliente nuevo y
  // quedaron dos fichas del mismo hospital. Ahora la razón social se busca sola
  // contra las fichas, y el nombre de la persona contra las fichas (persona
  // natural: la razón social ES su nombre) y contra los contactos.
  //
  // Una sola palabra genérica («Empresa», «privado», «NATURAL», «SR RONY») no
  // identifica a nadie: en los derivados de 30 días traía decenas de fichas sin
  // relación. Con una palabra sola se busca solo si es un nombre propio largo
  // («LAVIPRONTO», «AGROKASA»).
  const tokensEmpresa = empresaReconocible(tokenizarBusqueda(datos.razonSocial ?? ""));
  const tokensPersona = tokenizarBusqueda(datos.nombre ?? "");
  const mismaBusqueda = tokensEmpresa.join(" ").toLowerCase() === tokensPersona.join(" ").toLowerCase();

  // LAS CINCO BÚSQUEDAS SALEN JUNTAS, no una detrás de otra.
  //
  // Iban en fila para ahorrarse las de nombre cuando el documento o el teléfono
  // ya habían encontrado algo. Pero eso ahorraba una consulta a costa de sumar
  // los tiempos de todas, y esto corre mientras Central TECLEA: cada pausa
  // pagaba la suma completa antes de decirle si el cliente ya era de alguien
  // («se reportan demoras al ingreso de bandeja», 28-08). El orden de prioridad
  // no se pierde: se aplica al juntar los resultados, que es donde siempre
  // estuvo — documento, teléfono, correo y recién después nombre.
  const nada = Promise.resolve({ data: null });

  const cuentasConNombre = (tokens: string[]) => {
    let q = supabase.from("cuentas").select(CAMPOS).is("fusionada_en", null);
    for (const t of tokens) q = q.ilike("razon_social", `%${t}%`);
    return q.limit(5);
  };
  let qContactos = supabase.from("contactos").select(`cuentas(${CAMPOS})`);
  for (const t of tokensPersona) qContactos = qContactos.ilike("nombre", `%${t}%`);

  const [doc, telef, telefSucio, correo, empresaCuenta, personaCuenta, nomContacto] = await Promise.all([
    numDoc && numDoc.length >= 8
      ? supabase.from("cuentas").select(CAMPOS).eq("num_doc", numDoc).limit(3)
      : nada,
    // El teléfono, escrito como venga: además del campo tal cual, los celulares
    // que trae adentro (0201) — «1 956 181 464» o el número repetido dejaban de
    // empatar con nada. `cuentasPorCelularSucio` cubre el otro lado: la ficha
    // cuyo contacto tiene el campo sucio (0203).
    telefonos.length > 0
      ? supabase.from("contactos").select(`cuentas(${CAMPOS})`).in("telefono_normalizado", telefonos).limit(4)
      : nada,
    celulares.length > 0 ? supabase.rpc("cuentas_por_celular", { p_celulares: celulares }) : nada,
    email && email.includes("@")
      ? supabase.from("contactos").select(`cuentas(${CAMPOS})`).ilike("email", email).limit(4)
      : nada,
    tokensEmpresa.length > 0 ? cuentasConNombre(tokensEmpresa) : nada,
    tokensPersona.length > 0 && !mismaBusqueda ? cuentasConNombre(tokensPersona) : nada,
    tokensPersona.length > 0 ? qContactos.limit(5) : nada,
  ]);

  const deContacto = (d: unknown) => ((d ?? []) as { cuentas: unknown }[]).map((x) => x.cuentas as CuentaFila);

  agregar(doc.data as unknown as CuentaFila[], "documento");
  agregar(deContacto(telef.data), "telefono");
  // El RPC devuelve ids: se traen esas fichas y se suman con el mismo motivo.
  const idsSucios = [...new Set(((telefSucio.data ?? []) as { cuenta_id: string }[]).map((x) => x.cuenta_id))].slice(0, 4);
  if (idsSucios.length > 0) {
    const { data: fichasSucias } = await supabase.from("cuentas").select(CAMPOS).in("id", idsSucios);
    agregar(fichasSucias as unknown as CuentaFila[], "telefono");
  }
  agregar(deContacto(correo.data), "correo");
  agregar(empresaCuenta.data as unknown as CuentaFila[], "nombre");
  agregar(personaCuenta.data as unknown as CuentaFila[], "nombre");
  agregar(deContacto(nomContacto.data), "nombre");
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
  pin: string,
  motivo: string,
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

  // Pasa por `redirigir_lead_con_pin` (0092), que valida el código del
  // supervisor, lo quema y deja registrado quién autorizó y por qué antes de
  // mover nada. La versión sin autorización quedó revocada en la base: no es
  // que la pantalla decida pedir el PIN, es que ya no hay otra puerta.
  const { data: oportunidadId, error } = await supabase.rpc("redirigir_lead_con_pin", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
    p_pin: pin,
    p_motivo: motivo,
  });
  if (error) {
    const mensaje = error.message.replace(/^[A-Z0-9]{5}:\s*/, "");
    // Por qué se rechazó, anotado desde acá y no desde la función: la llamada
    // entera es UNA transacción y al fallar se deshace todo lo que ella hubiera
    // escrito. Sin este rastro, el 28-08 no hubo forma de saber si el problema
    // era el código o el límite de la 0079 — Central reportó «el PIN no
    // funciona» y en la base no había ni un intento fallido registrado.
    if (user) {
      await supabase
        .from("intentos_pin_supervisor")
        .insert({ solicitante_id: user.id, detalle: mensaje.slice(0, 200) });
    }
    return { error: mensaje };
  }

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

/**
 * ¿Esta derivación le quita el cliente a otro comercial?
 *
 * Se pregunta ANTES de derivar, para poder avisarlo en pantalla con nombre y
 * apellido en vez de dejar que pase en silencio (migración 0107). Devuelve
 * `null` cuando no hay nada que advertir, que es el caso normal.
 */
export async function carteraEnJuego(
  leadId: string,
  comercialId: string,
): Promise<{ razonSocial: string; duenoNombre: string; duenoCodigo: string | null } | null> {
  if (!leadId || !comercialId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cartera_en_juego", {
    p_lead_id: leadId,
    p_comercial_id: comercialId,
  });
  if (error) return null;
  const fila = (data as { razon_social: string; dueno_nombre: string; dueno_codigo: string | null }[] | null)?.[0];
  return fila
    ? { razonSocial: fila.razon_social, duenoNombre: fila.dueno_nombre, duenoCodigo: fila.dueno_codigo }
    : null;
}

/**
 * CORREGIR CÓMO ENTRÓ UN CONTACTO (0195).
 *
 * Santos, 08-09: «la señorita de Central lo registró como que entraba por
 * WhatsApp cuando realmente entró por llamada». Es el caso de LOS QUENUALES
 * que encontró el ing. Carlos, y hasta hoy no había forma de arreglarlo.
 *
 * NO ES EL BOTÓN «Cambiar de comercial»: aquel mueve el contacto a otra
 * persona; éste corrige un dato de cómo llegó. Se separan a propósito, porque
 * confundirlos sería mover una cartera creyendo que se arregla una etiqueta.
 *
 * Pide código de supervisor por la misma razón que la corrección de la
 * derivación: el canal es el dato con el que gerencia audita, así que
 * cambiarlo tiene que dejar firma. La base lo valida, lo quema y guarda de qué
 * canal a cuál, quién lo pidió, quién lo autorizó y por qué — la pantalla no
 * decide nada de eso.
 */
export async function corregirCanalDelLead(
  leadId: string,
  canal: string,
  pin: string,
  motivo: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_canal_lead", {
    p_lead_id: leadId,
    p_canal: canal,
    p_pin: pin,
    p_motivo: motivo,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  revalidatePath("/central");
  revalidatePath("/central/derivados");
  revalidatePath(`/central/derivados/${leadId}`);
  return { error: null };
}

/**
 * CORREGIR LO QUE PIDIÓ EL PROSPECTO, desde la bandeja de triaje.
 *
 * Central, 09-09: «¿se podría editar lo que solicita el prospecto desde la
 * bandeja de triaje?». El texto se escribe con el cliente al teléfono, así que
 * sale con lo que se alcanzó a anotar; cuando el cliente sigue contando, hasta
 * hoy no había dónde ponerlo y terminaba en un WhatsApp al comercial, fuera
 * del CRM.
 *
 * Sin código de supervisor —no es un dato que gerencia audite, y pedirlo sería
 * garantizar que nadie complete nada— pero guardando lo que entró: la 0199
 * copia el texto original la primera vez, y la pantalla lo muestra debajo.
 */
export async function corregirSolicitudLead(
  leadId: string,
  /** El texto nuevo, o null si solo se adjunta (0227). */
  texto: string | null,
  /**
   * LAS FOTOS QUE LLEGARON POR OTRO CANAL (0227). Central, 11-09: Carlos
   * Timana escribió por la web y a la vez mandó las fotos por WhatsApp; no
   * había cómo pegárselas al contacto que ya estaba en la bandeja, y la única
   * salida era registrar un segundo contacto — una ficha repetida más. Se
   * AGREGAN a las que el contacto ya tenía; ya subidas al bucket por el
   * formulario, acá viajan solo los metadatos, como en la captura.
   */
  adjuntos: AdjuntoLead[] = [],
  /**
   * LA FIRMA QUE PIDE LA CORRECCIÓN (0354). En la bandeja o en los primeros 15
   * minutos, ninguna; después, un motivo; con cotización o venta en el
   * expediente, además el código de supervisor. La base decide y lo dice.
   */
  firma: { motivo?: string | null; pin?: string | null } = {},
): Promise<{ error: string | null }> {
  if (adjuntos.length > 0) {
    const r = esquemaAdjuntosLead.safeParse(adjuntos);
    if (!r.success) return { error: "Los adjuntos no son válidos. Quítelos y vuelva a agregarlos." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_solicitud_lead", {
    p_lead_id: leadId,
    p_texto: texto?.trim() || null,
    p_adjuntos: adjuntos.length > 0 ? adjuntos : null,
    p_motivo: firma.motivo?.trim() || null,
    p_pin: firma.pin?.trim() || null,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  // Se corrige también desde la ficha del cliente y desde el expediente.
  revalidatePath("/", "layout");
  revalidatePath("/central");
  revalidatePath("/central/derivados");
  revalidatePath(`/central/derivados/${leadId}`);
  return { error: null };
}

/** Qué firma pide HOY corregir el texto: «libre», «motivo» o «codigo» (0354). */
export async function firmaParaCorregirSolicitud(leadId: string): Promise<"libre" | "motivo" | "codigo"> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("firma_para_corregir_solicitud", { p_lead_id: leadId });
  return (data as "libre" | "motivo" | "codigo" | null) ?? "motivo";
}

export interface PreviaMoverSolicitud {
  bloqueo: string | null;
  pide_codigo: boolean;
  gestiones: number;
  tiene_expediente: boolean;
  /** El expediente nació de esta solicitud (viaja con ella); si no, ella se muda sola (0355). */
  expediente_propio?: boolean;
  atiende_ahora: string | null;
  atendera: string | null;
  suma_a_expediente_abierto: boolean;
}

/** Lo que va a pasar si se muda la solicitud a esa ficha, antes de confirmar (0354). */
export async function previaMoverSolicitud(leadId: string, cuentaId: string): Promise<PreviaMoverSolicitud | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("previa_mover_solicitud", { p_lead_id: leadId, p_cuenta_id: cuentaId });
  return (data as PreviaMoverSolicitud | null) ?? null;
}

/**
 * «ESTO ERA DE OTRO CLIENTE» (0354). Rubí, 30-09: registró la consulta de
 * Vidawasi con un teléfono de Cristo Vive y quedó en la ficha equivocada, con
 * expediente y todo. Muda la solicitud a la ficha correcta sin llevarse nada
 * que no haya traído ella; la base decide si hace falta código.
 */
export async function moverSolicitudAOtraFicha(
  leadId: string,
  cuentaId: string,
  motivo: string,
  pin: string | null = null,
): Promise<{
  error: string | null;
  resultado?: {
    destino: string;
    origen: string | null;
    expediente: string | null;
    sumada_a_expediente_abierto: boolean;
    contactos_mudados: number;
    ficha_cerrada: boolean;
  };
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mover_solicitud_a_otra_ficha", {
    p_lead_id: leadId,
    p_cuenta_id: cuentaId,
    p_motivo: motivo.trim(),
    p_pin: pin?.trim() || null,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidatePath("/", "layout");
  return { error: null, resultado: data as never };
}

/**
 * CORREGIR LOS DATOS DEL CONTACTO desde la bandeja (0224).
 *
 * Central, reunión del 11-09: puso «Topitop» donde iba «Carlos» y no había
 * cómo corregirlo; tampoco el teléfono. Solo mientras el contacto está en la
 * bandeja: derivado, los datos viven en la ficha del cliente.
 */
export async function corregirDatosLead(
  leadId: string,
  datos: { nombre: string; razonSocial: string; telefono: string; email: string; numDoc: string },
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_datos_lead", {
    p_lead_id: leadId,
    p_nombre: datos.nombre,
    p_razon_social: datos.razonSocial,
    p_telefono: datos.telefono,
    p_email: datos.email,
    p_num_doc: datos.numDoc,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  revalidatePath("/central");
  return { error: null };
}

/**
 * Quien pasó un contacto a Central lo anula mientras sigue en la bandeja, con
 * código de supervisor y motivo (0338). Almacén, 29-09: registró dos veces un
 * contacto con la razón social equivocada y no tenía cómo deshacerlo.
 */
export async function anularMiRegistro(
  leadId: string,
  pin: string,
  motivo: string,
): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anular_mi_registro", { p_lead: leadId, p_pin: pin, p_motivo: motivo });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidarLoMandado();
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

/** Lo mismo, pero corrigiendo los datos en vez de anular (0338). */
export async function corregirMiRegistro(
  leadId: string,
  pin: string,
  motivo: string,
  datos: {
    nombre: string;
    razonSocial: string;
    telefono: string;
    email: string;
    numDoc: string;
    mensaje: string;
    canal: string;
    adjuntosNuevos: AdjuntoLead[];
  },
): Promise<{ error: string | null; resumen?: string }> {
  // Los archivos ya están en el bucket; acá solo se valida que sean rutas de
  // leads, igual que al registrar (0423).
  const adjuntos = esquemaAdjuntosLead.safeParse(datos.adjuntosNuevos);
  if (!adjuntos.success) return { error: "Los archivos no son válidos. Quítelos y vuelva a agregarlos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("corregir_mi_registro", {
    p_lead: leadId,
    p_pin: pin,
    p_motivo: motivo,
    p_nombre: datos.nombre,
    p_razon_social: datos.razonSocial,
    p_telefono: datos.telefono,
    p_email: datos.email,
    p_num_doc: datos.numDoc,
    p_mensaje: datos.mensaje,
    p_canal: datos.canal,
    p_adjuntos_nuevos: adjuntos.data,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };
  revalidarLoMandado();
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}

function revalidarLoMandado() {
  for (const ruta of ["/central", "/almacen", "/comercial", "/postventa", "/postventa/atenciones"]) revalidatePath(ruta);
}

export interface CuentaParaUnir {
  id: string;
  razonSocial: string;
  numDoc: string | null;
  /** De quién es la cartera. La pantalla lo necesita para saber si va a hacer falta el código. */
  comercialId: string | null;
  codigoComercial: string | null;
  comercialNombre: string | null;
  /** Con qué se le encontró, para que Central compare antes de unir. */
  detalle: string | null;
}

/**
 * Las fichas de cliente candidatas a recibir un contacto, mientras se teclea.
 *
 * Busca por razón social, por RUC/DNI y por la persona de contacto (nombre,
 * teléfono o correo), porque así es como Central los nombra: unas veces «el de
 * Candela», otras el RUC que le dictaron, y otras el correo con el que
 * escribieron. Devuelve SIEMPRE de quién es la cartera: unir es una decisión
 * que se toma mirando eso.
 */
export async function buscarCuentasParaUnir(texto: string): Promise<CuentaParaUnir[]> {
  const enteras = await buscarCuentas(texto);
  if (enteras.length > 0) return enteras;
  // «Centrum PUCP» entero no está en ninguna ficha; «PUCP» sí (Central, 09-10:
  // escribió lo que dijo el contacto y le salió vacío). Si el texto completo no
  // trae nada, se prueba palabra por palabra y se dice con cuál salió.
  const palabras = [...new Set(texto.trim().split(/[\s,.;:()/-]+/).filter((p) => p.length >= 3))];
  if (palabras.length < 2) return enteras;
  const porPalabra = await Promise.all(palabras.slice(0, 4).map((p) => buscarCuentas(p)));
  const out = new Map<string, CuentaParaUnir>();
  porPalabra.forEach((lista, i) => {
    for (const c of lista) {
      if (!out.has(c.id)) out.set(c.id, { ...c, detalle: [`por «${palabras[i]}»`, c.detalle].filter(Boolean).join(" · ") });
    }
  });
  return [...out.values()].slice(0, 8);
}

async function buscarCuentas(texto: string): Promise<CuentaParaUnir[]> {
  const q = texto.trim();
  if (q.length < 3) return [];
  const supabase = await createClient();
  const CAMPOS = "id, razon_social, num_doc, tipo_doc, comercial_id, perfiles(nombre, codigo_comercial)";
  interface Fila {
    id: string;
    razon_social: string;
    num_doc: string | null;
    tipo_doc: string | null;
    comercial_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }

  const soloDigitos = q.replace(/\D/g, "");
  const tel = normalizarTelefono(q);
  const tokens = tokenizarBusqueda(q);

  // Por nombre se exigen TODOS los tokens (ilike encadenados): «candela peru»
  // no puede traer todas las fichas que dicen «Perú».
  let porNombre = supabase.from("cuentas").select(CAMPOS);
  for (const t of tokens) porNombre = porNombre.ilike("razon_social", `%${t}%`);
  let porContacto = supabase.from("contactos").select(`nombre, email, telefono, cuentas(${CAMPOS})`);
  for (const t of tokens) porContacto = porContacto.ilike("nombre", `%${t}%`);

  const nada = Promise.resolve({ data: null });
  const siglas = patronDeSiglas(q);
  const [nombre, doc, contacto, correo, telefono, porSiglas] = await Promise.all([
    tokens.length > 0 ? porNombre.limit(8) : nada,
    soloDigitos.length >= 8
      ? supabase.from("cuentas").select(CAMPOS).ilike("num_doc", `%${soloDigitos}%`).limit(5)
      : nada,
    tokens.length > 0 ? porContacto.limit(6) : nada,
    // Con el correo entero o con el DOMINIO a secas («candelaperu.net»): así es
    // como se reconoce a la empresa cuando el prospecto llegó sin RUC ni razón
    // social, que es el caso que trajo Central el 09-09.
    /@|^[\w.-]+\.[a-z]{2,}$/i.test(q)
      ? supabase
          .from("contactos")
          .select(`nombre, email, telefono, cuentas(${CAMPOS})`)
          .ilike("email", `%${q.replace(/^@/, "")}%`)
          .limit(6)
      : nada,
    tel && tel.length >= 8
      ? supabase
          .from("contactos")
          .select(`nombre, email, telefono, cuentas(${CAMPOS})`)
          .eq("telefono_normalizado", tel)
          .limit(6)
      : nada,
    // «PUCP» no está escrito en ninguna ficha: la ficha dice «PONTIFICA
    // UNIVERSIDAD CATOLICA DEL PERU». Central, 09-10.
    siglas ? supabase.from("cuentas").select(CAMPOS).is("fusionada_en", null).filter("razon_social", "imatch", siglas).limit(6) : nada,
  ]);

  const out = new Map<string, CuentaParaUnir>();
  const agregar = (c: Fila | null | undefined, detalle: string | null) => {
    if (!c || out.has(c.id)) return;
    const p = c.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    out.set(c.id, {
      id: c.id,
      razonSocial: c.razon_social,
      numDoc: c.tipo_doc === "SIN_DOC" ? null : c.num_doc,
      comercialId: c.comercial_id,
      codigoComercial: p?.codigo_comercial ?? null,
      comercialNombre: p?.nombre ?? null,
      detalle,
    });
  };
  type FilaContacto = { nombre: string | null; email: string | null; telefono: string | null; cuentas: unknown };
  const deContacto = (d: unknown, como: (c: FilaContacto) => string) => {
    for (const c of (d ?? []) as FilaContacto[]) agregar(c.cuentas as Fila, como(c));
  };

  // El documento primero: es el dato que no se comparte entre clientes.
  for (const c of ((doc as { data: unknown }).data ?? []) as Fila[]) agregar(c, "por el documento");
  deContacto((correo as { data: unknown }).data, (c) => `contacto ${c.email ?? ""}`.trim());
  deContacto((telefono as { data: unknown }).data, (c) => `contacto ${c.nombre ?? ""} · ${c.telefono ?? ""}`.trim());
  for (const c of ((nombre as { data: unknown }).data ?? []) as Fila[]) agregar(c, null);
  // Como sigla manda si se escribió en mayúsculas o si como palabra no salió
  // nada: «lima» o «peru» no tienen que traer cuanta ficha empiece con L-I-M-A.
  const nombreVacio = (((nombre as { data: unknown }).data ?? []) as Fila[]).length === 0;
  if (q === q.toUpperCase() || nombreVacio) {
    for (const c of ((porSiglas as { data: unknown }).data ?? []) as Fila[]) agregar(c, `por las siglas ${q.toUpperCase()}`);
  }
  deContacto((contacto as { data: unknown }).data, (c) => `contacto ${c.nombre ?? ""}`.trim());

  return [...out.values()].slice(0, 8);
}

/**
 * Una sigla escrita sola («PUCP», «BCP», «SENATI» no: esa ya es nombre) se
 * busca como las iniciales de palabras seguidas de la razón social, dejando
 * saltar las cortas («del», «de», «y»). Sin `\s`: en esta base no matchea
 * (ver la nota del 09-09); se usan clases POSIX.
 */
function patronDeSiglas(texto: string): string | null {
  const t = texto.trim();
  if (!/^[A-Za-zÑñ]{3,5}$/.test(t)) return null;
  const SEP = "(([^[:alnum:]]+[[:alpha:]]{1,3})*[^[:alnum:]]+)";
  return "(^|[^[:alnum:]])" + [...t.toUpperCase()].map((l) => `${l}[[:alpha:]]*`).join(SEP);
}

export interface ResumenDeLaEmpresa {
  id: string;
  razonSocial: string;
  numDoc: string | null;
  cartera: string | null;
  carteraDesde: string | null;
  ultimaVenta: string | null;
  /** Las cotizaciones de antes del CRM (Excel/Word): ahí suele estar la historia vieja. */
  cotizacionesArchivo: { codigo: string | null; fecha: string | null; quien: string | null; monto: number | null }[];
  totalCotizacionesArchivo: number;
  historia: HistoriaDelCliente | null;
}

/**
 * LA HISTORIA DE LA EMPRESA, AUNQUE EL CONTACTO NO COINCIDA (Santos, 09-10).
 *
 * «Llegó un prospecto que decía que era de la PUCP»: el aviso de la bandeja
 * solo cruza el teléfono, el documento y el correo de la PERSONA, y esa
 * persona era nueva. Pero la institución tiene historia con C4, y eso cambia a
 * quién se deriva. Esto le deja a Central buscar la empresa que el contacto
 * nombra y leer su historia sin unir ni derivar nada.
 */
export async function historiaDeLaEmpresa(cuentaId: string): Promise<ResumenDeLaEmpresa | null> {
  const supabase = await createClient();
  const [{ data: c }, historias, { data: archivo, count }] = await Promise.all([
    supabase
      .from("cuentas")
      .select("id, razon_social, num_doc, tipo_doc, cartera_desde, ultima_venta_at, perfiles(nombre, codigo_comercial)")
      .eq("id", cuentaId)
      .maybeSingle(),
    historiaDeCuentas(supabase, [cuentaId]),
    supabase
      .from("cotizaciones_historicas")
      .select("codigo, fecha, monto_sin_igv, asesor_codigo, perfiles!cotizaciones_historicas_comercial_id_fkey(nombre, codigo_comercial)", { count: "exact" })
      .eq("cuenta_id", cuentaId)
      .order("fecha", { ascending: false })
      .limit(4),
  ]);
  if (!c) return null;
  const p = c.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  type FilaArchivo = {
    codigo: string | null;
    fecha: string | null;
    monto_sin_igv: number | null;
    asesor_codigo: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  };
  return {
    id: c.id,
    razonSocial: c.razon_social,
    numDoc: c.tipo_doc === "SIN_DOC" ? null : c.num_doc,
    cartera: p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : null,
    carteraDesde: c.cartera_desde,
    ultimaVenta: c.ultima_venta_at,
    cotizacionesArchivo: ((archivo ?? []) as unknown as FilaArchivo[]).map((a) => ({
      codigo: a.codigo,
      fecha: a.fecha,
      monto: a.monto_sin_igv,
      quien: a.perfiles
        ? `${a.perfiles.codigo_comercial ? `${a.perfiles.codigo_comercial} · ` : ""}${a.perfiles.nombre}`
        : a.asesor_codigo,
    })),
    totalCotizacionesArchivo: count ?? 0,
    historia: historias.get(cuentaId) ?? null,
  };
}

/**
 * UNIR EL CONTACTO A LA FICHA DEL CLIENTE QUE YA EXISTE.
 *
 * Central lo pidió dos días seguidos (08-09 y 09-09): un prospecto que entró
 * como cliente nuevo pero es de un cliente que ya está en la cartera de
 * alguien. Hasta hoy solo existía «Cambiar de comercial», que mueve a quién
 * está derivado pero se lleva la ficha nueva con él y deja el duplicado vivo.
 *
 * Toda la regla vive en la base (0200): a quién le queda, cuándo hace falta el
 * código del supervisor y si la ficha repetida se puede cerrar. Acá solo se
 * pide y se muestra lo que respondió, que es una frase en castellano lista
 * para leer.
 */
export async function unirLeadACuenta(
  leadId: string,
  cuentaId: string,
  pin: string,
  motivo: string,
): Promise<{ error: string | null; resumen?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unir_lead_a_cuenta", {
    p_lead_id: leadId,
    p_cuenta_id: cuentaId,
    p_pin: pin || null,
    p_motivo: motivo,
  });
  if (error) return { error: error.message.replace(/^[A-Z0-9]{5}:\s*/, "") };

  revalidatePath("/central");
  revalidatePath("/central/derivados");
  revalidatePath(`/central/derivados/${leadId}`);
  return { error: null, resumen: typeof data === "string" ? data : undefined };
}
