import type { SupabaseClient } from "@supabase/supabase-js";
import { firmarAdjuntosDeLeads, type AdjuntoLeadFirmado } from "@/lib/adjuntos-lead";
import type { AdjuntoLead } from "@/lib/validaciones/lead";
import { ETIQUETA_TIPO_ATENCION, type TipoAtencion } from "@/lib/atenciones";
import { ETIQUETA_CANAL } from "@/lib/derivados-central";

/**
 * LO QUE MANDÉ A CENTRAL Y TODAVÍA NO ME DEVUELVEN.
 *
 * Por qué existe. El 10-09 postventa registró DOS VECES la misma solicitud de
 * INVERSIONES TURISTICAS DEL CAMPO S.A.C - HOSTAL LA ARBOLEDA (PRO-09252 a las
 * 15:25 y PRO-09254 a las 15:38) y Santos tuvo que pedir que se borrara la
 * repetida. Su razón, textual: «no aparecían los que había emitido».
 *
 * Y tenía razón. Desde la 0132 —la orden de Lesly del 31-08: «cualquier caso
 * que reciba postventa tiene que ser derivado a Central»— lo que ella registra
 * NO nace suyo: nace como lead `pendiente_triaje` en la bandeja de CENTRAL, y
 * recién vuelve a su lista cuando Central se lo asigna. Ese día esperó 10
 * minutos; el 07-09, 28. En esa ventana el caso no está en ninguna pantalla
 * suya: `pendiente_triaje` solo lo listan Central y gerencia. El aviso existe
 * —«Registrado como PRO-09252. Está en la bandeja de Central para que lo
 * derive»— pero es un mensaje que se desvanece, así que a los cinco minutos no
 * tiene dónde comprobarlo. Registró de nuevo, y con razón.
 *
 * Esto es esa comprobación: una lista de lo suyo con su código y desde cuándo
 * espera. No hace falta migración — la política `leads_comercial_ve_los_suyos`
 * ya la deja leer los leads con `recibido_por = auth.uid()`.
 *
 * NO ES SOLO DE POSTVENTA. El comercial que pasa un contacto a Central (0125,
 * «Pasar contacto a Central») tiene exactamente el mismo hueco, así que la
 * lista se usa igual en su «Mi día».
 */

/** Lo que pasó con lo que mandó, dicho como se lo diría un compañero. */
export type EstadoMandado = "esperando" | "en_camino" | "devuelto" | "derivado" | "cerrado";

export interface Mandado {
  id: string;
  codigo: string;
  cliente: string;
  estado: EstadoMandado;
  /** La frase que se lee en la fila. */
  frase: string;
  /** Desde que se registró, en horas. */
  horas: number;
  /** Se pone ámbar cuando lleva demasiado esperando sin que Central lo toque. */
  demorado: boolean;
  /** A dónde lleva la fila, cuando ya hay algo que abrir. */
  href: string | null;
  /** Todo lo que se mandó, tal cual quedó registrado: se abre al tocar la fila. */
  detalle: DetalleMandado;
}

/**
 * LO QUE SE MANDÓ, ENTERO.
 *
 * Brenda (C1), 17-09: la lista le decía QUÉ mandó y QUÉ pasó, pero al tocar
 * una fila derivada a otra área no pasaba nada, y ella quería «recordar qué
 * fue lo que le envié a Central a detalle, con todo lo adjuntado». Tiene
 * sentido: cuando el cliente vuelve a llamar —DUO LAVANDERIA escribió cuatro
 * veces en dos días— lo primero que se necesita es leer qué se dijo la vez
 * anterior, y el texto se tecleó con el cliente al teléfono, así que no está
 * en ningún otro lado.
 *
 * Es lo que el lead ya guarda; no hay nada nuevo que escribir. La política
 * `leads_comercial_ve_los_suyos` (0060) le deja leer lo que registró, y los
 * adjuntos del bucket se firman igual que para Central.
 */
export interface DetalleMandado {
  registradoAt: string;
  canal: string;
  contacto: string | null;
  razonSocial: string | null;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  /** El texto que se escribió al registrarlo, completo y con sus saltos de línea. */
  mensaje: string | null;
  /** Qué tipo de atención se sugirió al mandarlo, cuando se sugirió algo. */
  sugerencia: string | null;
  adjuntos: AdjuntoLeadFirmado[];
  /** A quién se lo dio Central y cuándo, cuando ya lo derivó. */
  derivadoA: string | null;
  derivadoAt: string | null;
}

/**
 * El punto en que esperar deja de ser normal y pasa a ser un olvido.
 *
 * Media hora: las derivaciones reales del área tardan entre 3 y 28 minutos
 * (medido sobre los leads que registró postventa en la semana del 07-09). Más
 * que eso y conviene que se vea distinto, no que se esconda.
 */
const HORAS_PARA_PREOCUPARSE = 0.5;

interface FilaLead {
  id: string;
  codigo: string;
  estado: string;
  canal: string;
  razon_social: string | null;
  nombre_contacto: string | null;
  num_doc: string | null;
  telefono: string | null;
  email: string | null;
  mensaje: string | null;
  sugerido_atencion: TipoAtencion | null;
  sugerido_tipo: string | null;
  adjuntos: AdjuntoLead[] | null;
  recibido_at: string;
  asignado_at: string | null;
  asignado_a: string | null;
  oportunidad_id: string | null;
}

/** El enum viejo de tres clases (0080), para lo que se mandó antes de la pista técnica. */
const ETIQUETA_SUGERIDO_TIPO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

/** "12 min", "3 h", "2 días" — la resta la hace la pantalla, no quien lee. */
function haceCuanto(horas: number): string {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} días`;
}

/**
 * Lo que esta persona mandó a Central: todo lo que sigue esperando (sin tope de
 * antigüedad — si Central se olvidó de uno de hace tres días, ESE es el que hay
 * que ver) y lo resuelto en las últimas 24 horas, para que el que desaparece de
 * la cola no parezca perdido.
 */
export async function listarMandadoACentral(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<Mandado[]> {
  const campos =
    "id, codigo, estado, canal, razon_social, nombre_contacto, num_doc, telefono, email, mensaje, sugerido_atencion, sugerido_tipo, adjuntos, recibido_at, asignado_at, asignado_a, oportunidad_id";
  // SIETE DÍAS, NO VEINTICUATRO HORAS (Carlos, 22-09). Brenda derivó a
  // Central el contacto de Inversiones Huamán Ruiz el lunes; el martes a las
  // 11 de la mañana buscaron en su cuenta qué había mandado y no había nada:
  // la lista solo miraba un día atrás. «Central recibió una derivación de
  // Brenda y no aparece en la cuenta de Brenda lo que Brenda le derivó».
  // Una semana cubre el fin de semana y la conversación del lunes siguiente,
  // que es cuando el cliente vuelve a llamar preguntando por lo mismo.
  const desdeUnaSemana = new Date(Date.now() - 7 * 24 * 36e5).toISOString();

  const [{ data: esperando }, { data: resueltos }] = await Promise.all([
    supabase
      .from("leads")
      .select(campos)
      .eq("recibido_por", perfilId)
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: true })
      .limit(20),
    supabase
      .from("leads")
      .select(campos)
      .eq("recibido_por", perfilId)
      .neq("estado", "pendiente_triaje")
      .gte("recibido_at", desdeUnaSemana)
      .order("recibido_at", { ascending: false })
      .limit(30),
  ]);

  const filas = [...((esperando ?? []) as FilaLead[]), ...((resueltos ?? []) as FilaLead[])];
  if (filas.length === 0) return [];

  // El nombre de quien lo recibió, para poder decir A QUIÉN se lo derivaron.
  // Va en su propia consulta y no como embebido: `leads.asignado_a` no tiene
  // clave foránea declarada hacia `perfiles`, así que el join de PostgREST no
  // existe y pedirlo devuelve el error crudo en vez de la lista.
  const ids = [...new Set(filas.map((f) => f.asignado_a).filter((x): x is string => Boolean(x)))];
  const nombres = new Map<string, string>();
  const [{ data: perfiles }, adjuntosPorLead] = await Promise.all([
    ids.length > 0
      ? supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; nombre: string; codigo_comercial: string | null }[] }),
    firmarAdjuntosDeLeads(supabase, filas),
  ]);
  for (const p of (perfiles ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]) {
    nombres.set(p.id, p.codigo_comercial ? `${p.nombre} (${p.codigo_comercial})` : p.nombre);
  }

  return filas.map((f) => {
    const horas = (Date.now() - new Date(f.recibido_at).getTime()) / 36e5;
    const cuanto = haceCuanto(horas);
    const paraQuien = f.asignado_a ? nombres.get(f.asignado_a) ?? null : null;
    const mio = f.asignado_a === perfilId;

    let estado: EstadoMandado = "esperando";
    let frase = `Esperando que Central lo derive · hace ${cuanto}`;
    if (f.estado === "asignado") {
      estado = mio ? "devuelto" : "derivado";
      frase = mio
        ? `Central se lo devolvió a usted · lo registró hace ${cuanto}`
        : `Central lo derivó a ${paraQuien ?? "otra persona"} · lo registró hace ${cuanto}`;
    } else if (f.estado === "derivado_area") {
      estado = "en_camino";
      frase = `Central ya lo derivó al área · falta que alguien lo tome · hace ${cuanto}`;
    } else if (f.estado === "duplicado") {
      estado = "cerrado";
      frase = `Central lo marcó como repetido: ya estaba registrado · hace ${cuanto}`;
    } else if (f.estado === "descartado") {
      estado = "cerrado";
      frase = `Central lo descartó · hace ${cuanto}`;
    } else if (f.estado === "historico") {
      estado = "cerrado";
      frase = `Archivado · hace ${cuanto}`;
    }

    return {
      id: f.id,
      codigo: f.codigo,
      cliente: f.razon_social ?? f.nombre_contacto ?? "Cliente sin nombre",
      estado,
      frase,
      horas,
      demorado: estado === "esperando" && horas > HORAS_PARA_PREOCUPARSE,
      // Solo se enlaza lo que de verdad se puede abrir: el expediente que
      // Central devolvió. Un lead que sigue en la cola de Central no tiene
      // pantalla propia para quien lo registró, y un enlace que lleva a un
      // «no encontrado» es peor que ningún enlace.
      href: f.oportunidad_id && mio ? `/comercial/oportunidades/${f.oportunidad_id}` : null,
      detalle: {
        registradoAt: f.recibido_at,
        canal: ETIQUETA_CANAL[f.canal] ?? f.canal,
        contacto: f.nombre_contacto,
        razonSocial: f.razon_social,
        ruc: f.num_doc,
        telefono: f.telefono,
        email: f.email,
        mensaje: f.mensaje,
        sugerencia: f.sugerido_atencion
          ? ETIQUETA_TIPO_ATENCION[f.sugerido_atencion]
          : f.sugerido_tipo
            ? ETIQUETA_SUGERIDO_TIPO[f.sugerido_tipo] ?? f.sugerido_tipo
            : null,
        adjuntos: adjuntosPorLead.get(f.id) ?? [],
        derivadoA: f.asignado_a ? paraQuien : null,
        derivadoAt: f.asignado_a ? f.asignado_at : null,
      },
    };
  });
}
