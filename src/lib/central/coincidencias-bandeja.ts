import type { createClient } from "@/lib/supabase/server";
import { celularesDe, normalizarTelefono } from "@/lib/telefono";

/**
 * Cruza DE UNA SOLA VEZ toda la bandeja de triaje contra la cartera, para que
 * Central vea en el listado —sin abrir nada— cuáles de los contactos que tiene
 * delante ya están en el sistema.
 *
 * POR QUÉ EXISTE. El 25-08 Central preguntó qué hacer con los prospectos «que
 * fueron anteriormente derivados» y estaba a punto de descartarlos uno por uno.
 * El caso que puso —Edwar Paul Santillán, sábado 22-08— resultó ser un contacto
 * que entró DOS VECES: por su llamada, que ella registró y derivó a C4, y otra
 * vez por el formulario de la campaña de publicidad. El de la bandeja era la
 * copia. Al revisar el resto: 24 de los 43 pendientes estaban igual.
 *
 * El CRM ya sabía detectar esto (`buscarCoincidencias`), pero solo corría
 * cuando ella abría el diálogo de asignar — o sea, justo después de decidir. En
 * el listado no se veía nada, y desde ahí los únicos botones eran «Asignar» y
 * «Descartar». Por eso terminaba usando «Descartar» para algo que sí procedió.
 *
 * POR QUÉ EN LOTE Y NO REUTILIZAR `buscarCoincidencias`. Esa función hace entre
 * 4 y 6 consultas por contacto; con 300 en bandeja serían ~1.800. Acá el costo
 * es fijo —cinco consultas— aunque la bandeja tenga 300.
 *
 * POR QUÉ SOLO DOCUMENTO / TELÉFONO / CORREO, sin buscar por nombre. Esto pinta
 * un aviso en una pantalla operativa: tiene que acertar. El cruce por nombre es
 * útil cuando una persona está mirando y decide (ahí sigue vivo, en el diálogo
 * de asignar), pero en un listado produce falsos positivos que enseñan a
 * ignorar el aviso. Aun así el aviso NUNCA decide solo: muestra a nombre de
 * quién está la cuenta para que Central compare — en la bandeja real hay 4
 * casos de mismo teléfono con otro nombre (un negocio, una familia, un número
 * mal tipeado en el Excel).
 */
/**
 * Los dominios que NO identifican a una empresa. Un `@gmail.com` compartido no
 * dice nada: en la base hay 3.932 contactos con Gmail y 1.625 con Hotmail, y
 * cruzarlos uniría clientes que no tienen nada que ver.
 */
const CORREO_PERSONAL = new Set([
  "gmail.com", "gmail,com", "googlemail.com", "hotmail.com", "hotmail.es", "hotmail.com.pe",
  "outlook.com", "outlook.es", "outlook.com.pe", "live.com", "live.com.pe", "msn.com",
  "yahoo.com", "yahoo.es", "yahoo.com.pe", "icloud.com", "me.com", "aol.com",
  "protonmail.com", "proton.me", "zoho.com", "example.com",
]);

/**
 * El dominio de una dirección, cuando sirve para reconocer a la empresa.
 *
 * Devuelve null para los correos personales y para lo que no es un correo. Se
 * exporta porque la bandeja lo usa dos veces: para cruzar sola, y para ofrecerle
 * a Central el dominio ya recortado cuando va a unir el contacto a una ficha.
 */
export function dominioDeCorreo(email: string | null | undefined): string | null {
  const dom = email?.trim().toLowerCase().split("@")[1]?.trim();
  if (!dom || !dom.includes(".") || CORREO_PERSONAL.has(dom)) return null;
  return dom;
}

export interface CoincidenciaBandeja {
  cuentaId: string;
  razonSocial: string;
  codigoComercial: string | null;
  comercialNombre: string | null;
  motivo: "documento" | "teléfono" | "correo" | "dominio del correo";
  ultimaEtapa: string | null;
  ultimaFecha: string | null;
  /**
   * `duplicado`: la cuenta se trabajó dentro de los días en que entró este
   * contacto → es el mismo hecho registrado dos veces.
   * `cliente`: ya existe, pero de antes → NO es un duplicado, es alguien
   * conocido que vuelve a escribir y hay que derivarlo a su dueño de siempre
   * (en la bandeja del 25-08: Katya Sarría, de Operador Nacional de Hoteles,
   * cliente de C1 desde 2023).
   */
  clase: "duplicado" | "cliente";
}

/** Días entre el ingreso y la última gestión para considerarlo el mismo hecho. */
const DIAS_MISMO_HECHO = 4;

/** `in()` viaja en la URL: se parte para no armar una petición gigante. */
const TAMANO_LOTE = 120;

export interface LeadBandeja {
  id: string;
  telefono: string | null;
  num_doc: string | null;
  email: string | null;
  recibido_at: string;
}

interface FilaCuenta {
  id: string;
  razon_social: string;
  num_doc: string | null;
  comercial_id: string | null;
  perfiles: { nombre: string; codigo_comercial: string | null } | null;
}

function trozos<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += TAMANO_LOTE) out.push(xs.slice(i, i + TAMANO_LOTE));
  return out;
}

export async function coincidenciasDeLaBandeja(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leads: LeadBandeja[],
): Promise<Map<string, CoincidenciaBandeja>> {
  const resultado = new Map<string, CoincidenciaBandeja>();
  if (leads.length === 0) return resultado;

  // Qué buscar, y de qué lead vino cada dato.
  const porTelefono = new Map<string, string[]>();
  const porDoc = new Map<string, string[]>();
  const porCorreo = new Map<string, string[]>();
  // EL DOMINIO DE LA EMPRESA, no solo el correo entero.
  //
  // 09-09: el PRO-09219 entró por Google Ads como «Deysi J. peru», sin RUC y
  // sin razón social —el formulario de Ads solo pide nombre, teléfono y
  // ciudad— pero con el correo `aseguramientocalidad@candelaperu.net`. En el
  // sistema, CANDELA PERÚ es cliente de C4 desde 2021 y su contacto es
  // `monica.soto@candelaperu.net`: la misma empresa, otra persona. Como acá se
  // comparaba el correo COMPLETO, el aviso no salió, el contacto se derivó a
  // otro comercial como cliente nuevo y quedaron dos fichas del mismo cliente.
  // Central lo cazó a mano y pidió unirlas.
  //
  // Va DESPUÉS del correo exacto en el orden de confianza —dos personas del
  // mismo dominio son la misma empresa, no el mismo interlocutor— y solo con
  // dominios corporativos: un @gmail compartido no identifica a nadie.
  const porDominio = new Map<string, string[]>();
  const anotar = (m: Map<string, string[]>, clave: string | null, leadId: string) => {
    if (!clave) return;
    const ys = m.get(clave);
    if (ys) ys.push(leadId);
    else m.set(clave, [leadId]);
  };
  for (const l of leads) {
    const tel = normalizarTelefono(l.telefono);
    anotar(porTelefono, tel && tel.length >= 8 ? tel : null, l.id);
    // Y EL MISMO NÚMERO ESCRITO DE OTRA FORMA (0201). Central deriva mirando
    // este aviso; si el aviso no sale, deriva a ciegas. El 07-09 pasó dos
    // veces el mismo día: «1 956 181 464» (un 1 de más) y «987524031 /
    // 987524031» (dos veces el mismo número) no empataron con nada, y GRUPO
    // SANTA ELENA y NEWREST se derivaron como clientes nuevos teniendo su
    // ficha con RUC desde 2021. Acá el número se busca también por los
    // celulares que trae adentro.
    for (const cel of celularesDe(l.telefono)) if (cel !== tel) anotar(porTelefono, cel, l.id);
    const doc = l.num_doc?.replace(/\D/g, "") || null;
    anotar(porDoc, doc && doc.length >= 8 ? doc : null, l.id);
    const correo = l.email?.trim().toLowerCase() || null;
    anotar(porCorreo, correo && correo.includes("@") ? correo : null, l.id);
    anotar(porDominio, dominioDeCorreo(l.email), l.id);
  }

  // lead → cuenta, en orden de confianza: el documento pisa al teléfono y el
  // teléfono al correo (un correo de contacto puede ser el de quien llenó el
  // formulario; el RUC/DNI no se comparte).
  const cuentaDeLead = new Map<string, { cuentaId: string; motivo: CoincidenciaBandeja["motivo"] }>();
  const asignar = (leadIds: string[], cuentaId: string, motivo: CoincidenciaBandeja["motivo"]) => {
    for (const id of leadIds) if (!cuentaDeLead.has(id)) cuentaDeLead.set(id, { cuentaId, motivo });
  };

  for (const lote of trozos([...porDoc.keys()])) {
    const { data } = await supabase
      .from("cuentas")
      .select("id, num_doc")
      .in("num_doc", lote)
      .neq("tipo_doc", "SIN_DOC");
    for (const c of (data ?? []) as { id: string; num_doc: string | null }[]) {
      asignar(porDoc.get(c.num_doc ?? "") ?? [], c.id, "documento");
    }
  }
  for (const lote of trozos([...porTelefono.keys()])) {
    const { data } = await supabase
      .from("contactos")
      .select("cuenta_id, telefono_normalizado")
      .in("telefono_normalizado", lote);
    for (const c of (data ?? []) as { cuenta_id: string; telefono_normalizado: string | null }[]) {
      asignar(porTelefono.get(c.telefono_normalizado ?? "") ?? [], c.cuenta_id, "teléfono");
    }
  }
  for (const lote of trozos([...porCorreo.keys()])) {
    const { data } = await supabase.from("contactos").select("cuenta_id, email").in("email", lote);
    for (const c of (data ?? []) as { cuenta_id: string; email: string | null }[]) {
      asignar(porCorreo.get(c.email?.trim().toLowerCase() ?? "") ?? [], c.cuenta_id, "correo");
    }
  }
  // El dominio no se puede pedir con un `in()`: se busca uno por uno con
  // `ilike`. Son pocos —solo los contactos de la bandeja que traen correo
  // corporativo— y quedan fuera los que ya se resolvieron por dato más firme.
  const dominiosPendientes = [...porDominio.entries()].filter(([, ids]) =>
    ids.some((id) => !cuentaDeLead.has(id)),
  );
  for (const [dom, ids] of dominiosPendientes) {
    const { data } = await supabase.from("contactos").select("cuenta_id").ilike("email", `%@${dom}`).limit(4);
    const filas = (data ?? []) as { cuenta_id: string }[];
    // Si el dominio apunta a más de una ficha no se elige por nosotros: eso es
    // justamente lo que hay que mirar antes de unir, y el aviso decide solo
    // cuando no hay duda.
    const unicas = [...new Set(filas.map((f) => f.cuenta_id))];
    if (unicas.length === 1) asignar(ids, unicas[0], "dominio del correo");
  }
  if (cuentaDeLead.size === 0) return resultado;

  // Los datos de las cuentas encontradas y su última gestión.
  const ids = [...new Set([...cuentaDeLead.values()].map((x) => x.cuentaId))];
  const cuentas = new Map<string, FilaCuenta>();
  for (const lote of trozos(ids)) {
    const { data } = await supabase
      .from("cuentas")
      .select("id, razon_social, num_doc, comercial_id, perfiles(nombre, codigo_comercial)")
      .in("id", lote);
    for (const c of (data ?? []) as unknown as FilaCuenta[]) cuentas.set(c.id, c);
  }
  const ultima = new Map<string, { etapa: string; created_at: string }>();
  for (const lote of trozos(ids)) {
    const { data } = await supabase
      .from("oportunidades")
      .select("cuenta_id, etapa, created_at")
      .in("cuenta_id", lote);
    for (const o of (data ?? []) as { cuenta_id: string; etapa: string; created_at: string }[]) {
      const previa = ultima.get(o.cuenta_id);
      if (!previa || o.created_at > previa.created_at) ultima.set(o.cuenta_id, o);
    }
  }

  const recibidoDe = new Map(leads.map((l) => [l.id, l.recibido_at]));
  for (const [leadId, { cuentaId, motivo }] of cuentaDeLead) {
    const cuenta = cuentas.get(cuentaId);
    if (!cuenta) continue;
    const op = ultima.get(cuentaId) ?? null;
    const recibido = recibidoDe.get(leadId);
    const dias =
      op && recibido
        ? Math.abs(new Date(recibido).getTime() - new Date(op.created_at).getTime()) / 86_400_000
        : Number.POSITIVE_INFINITY;
    const p = cuenta.perfiles;
    resultado.set(leadId, {
      cuentaId,
      razonSocial: cuenta.razon_social,
      codigoComercial: p?.codigo_comercial ?? null,
      comercialNombre: p?.nombre ?? null,
      motivo,
      ultimaEtapa: op?.etapa ?? null,
      ultimaFecha: op?.created_at ?? null,
      clase: dias <= DIAS_MISMO_HECHO ? "duplicado" : "cliente",
    });
  }
  return resultado;
}
