import type { SupabaseClient } from "@supabase/supabase-js";

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
  razon_social: string | null;
  nombre_contacto: string | null;
  recibido_at: string;
  asignado_at: string | null;
  asignado_a: string | null;
  oportunidad_id: string | null;
}

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
  const campos = "id, codigo, estado, razon_social, nombre_contacto, recibido_at, asignado_at, asignado_a, oportunidad_id";
  const desde24h = new Date(Date.now() - 24 * 36e5).toISOString();

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
      .gte("recibido_at", desde24h)
      .order("recibido_at", { ascending: false })
      .limit(10),
  ]);

  const filas = [...((esperando ?? []) as FilaLead[]), ...((resueltos ?? []) as FilaLead[])];
  if (filas.length === 0) return [];

  // El nombre de quien lo recibió, para poder decir A QUIÉN se lo derivaron.
  // Va en su propia consulta y no como embebido: `leads.asignado_a` no tiene
  // clave foránea declarada hacia `perfiles`, así que el join de PostgREST no
  // existe y pedirlo devuelve el error crudo en vez de la lista.
  const ids = [...new Set(filas.map((f) => f.asignado_a).filter((x): x is string => Boolean(x)))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: perfiles } = await supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids);
    for (const p of (perfiles ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]) {
      nombres.set(p.id, p.codigo_comercial ? `${p.nombre} (${p.codigo_comercial})` : p.nombre);
    }
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
    };
  });
}
