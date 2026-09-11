import type { createClient } from "@/lib/supabase/server";
import { inicioVentanaOtraFicha } from "@/lib/derivados-central";
import { traerPorLotes } from "@/lib/lotes";

/**
 * ¿A ESTE CLIENTE YA LO ATENDIERON, PERO EN OTRA FICHA?
 *
 * Ariana, por Santos (09-09): «como ellos ya fueron gestionados anteriormente
 * en el Excel, no deberían aparecer en Mi día». JOEL ORTEGA, ELI FARFAN y
 * VILMA GARCIA entraron por la web el 17-18/08, ella los llamó el 18 y el 19
 * —el CRM todavía no existía— y Central derivó esos mismos leads el 24-08 a
 * fichas nuevas y vacías. «Mi día» las mostraba como «Primer contacto
 * pendiente · llegó hace 16 días», que es exactamente lo contrario de lo que
 * pasó.
 *
 * La ficha ya lo dice desde hoy; esto es la misma pregunta contestada para una
 * LISTA de fichas de una sola vez, sin una consulta por fila.
 *
 * La ventana de cada ficha arranca cuando entró la consulta —no cuando se
 * derivó— con el margen de `inicioVentanaOtraFicha`. Antes de eso es historia
 * del cliente, no atención a esto.
 */

// NO se filtra por tipo de actividad, y es a propósito: el importador del
// Excel escribió TODA la gestión histórica como `nota` (que en los reportes
// no cuenta como contacto, 0090), y son justamente esas notas las que prueban
// que Ariana ya había llamado a JOEL ORTEGA y a ELI FARFAN antes de que
// existiera el CRM. Filtrarlas dejaba afuera los tres casos que originaron
// esto. Acá la pregunta no es «¿cuántas gestiones cuentan?» sino «¿este
// cliente ya fue atendido por esta consulta?».

export interface FichaAConsultar {
  id: string;
  cuentaId: string | null;
  /** Cuándo llegó el lead; si no nació de un lead, cuándo se creó la ficha. */
  recibidoAt: string | null;
  creadaAt: string | null;
}

export interface AtencionAlLado {
  /** La PRIMERA gestión al lado dentro de la ventana: prueba que se atendió cuando llegó. */
  fecha: string;
  /**
   * La ÚLTIMA. Para una vencida es la que importa: INVERSIONES FISA (Ariana,
   * 11-09) salía «venció hace 25 días» en un expediente gemelo del Excel
   * mientras en el otro la había llamado ayer y agendado para el 29. Decirle
   * «ya lo atendió el 22 ago» era verdad pero no era la respuesta.
   */
  ultima: string;
  tipo: string;
}

/**
 * Devuelve, por id de ficha, la PRIMERA atención que el cliente recibió en
 * otra ficha dentro de la ventana de esa consulta. Las fichas que no tengan
 * ninguna no aparecen en el mapa.
 *
 * Solo cuenta lo que el usuario puede ver: la consulta va con su sesión, así
 * que una ficha de otra cartera no entra. Es a propósito — afirmar algo que
 * no se le puede mostrar deja al comercial sin cómo comprobarlo.
 */
export async function atencionesEnOtraFicha(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fichas: FichaAConsultar[],
): Promise<Map<string, AtencionAlLado>> {
  const resultado = new Map<string, AtencionAlLado>();
  const conCuenta = fichas.filter((f) => f.cuentaId);
  if (conCuenta.length === 0) return resultado;

  const ventanaDe = new Map<string, number>();
  for (const f of conCuenta) {
    const inicio = inicioVentanaOtraFicha(f.recibidoAt, f.creadaAt);
    if (inicio !== null) ventanaDe.set(f.id, inicio);
  }
  if (ventanaDe.size === 0) return resultado;

  const cuentaIds = [...new Set(conCuenta.map((f) => f.cuentaId as string))];
  // Por lotes: `.in` con muchos ids muere en la URL y devuelve data:null, que
  // acá se leería como «no hay nada al lado» — o sea, el reclamo falso otra vez.
  const { data: opsDeEsasCuentas } = await traerPorLotes<{ id: string; cuenta_id: string }>(cuentaIds, (lote) =>
    supabase.from("oportunidades").select("id, cuenta_id").in("cuenta_id", lote),
  );

  const propias = new Set(fichas.map((f) => f.id));
  const gemelasDeCuenta = new Map<string, string[]>();
  for (const o of opsDeEsasCuentas) {
    if (propias.has(o.id)) continue;
    gemelasDeCuenta.set(o.cuenta_id, [...(gemelasDeCuenta.get(o.cuenta_id) ?? []), o.id]);
  }
  const idsGemelas = [...new Set([...gemelasDeCuenta.values()].flat())];
  if (idsGemelas.length === 0) return resultado;

  const desdeLaMasVieja = Math.min(...ventanaDe.values());
  type ActCruda = {
    oportunidad_id: string;
    tipo: string;
    realizada_at: string;
    realizada_por: string | null;
    // Sin tipos generados, supabase-js tipa el embed «muchos a uno» como
    // arreglo; en tiempo de ejecución llega un objeto. Se aceptan los dos.
    perfiles: { rol: string }[] | { rol: string } | null;
  };
  const { data: actividades } = await traerPorLotes<ActCruda>(idsGemelas, (lote) =>
    supabase
      .from("actividades")
      .select("oportunidad_id, tipo, realizada_at, realizada_por, perfiles!actividades_realizada_por_fkey(rol)")
      .in("oportunidad_id", lote)
      .gte("realizada_at", new Date(desdeLaMasVieja).toISOString())
      .order("realizada_at", { ascending: true }),
  );
  if (actividades.length === 0) return resultado;

  // UNA NOTA DEL SISTEMA NO ES ATENCIÓN. La reposición del histórico (02-09,
  // sin autor) y las notas «Expediente unificado» (firmadas por el
  // Administrador) viven en expedientes gemelos archivados, con fecha del día
  // en que se corrieron. Contadas como gestión, a Ariana le salían como «ya
  // atendidas» cinco vencidas de las que solo dos lo estaban (11-09), y en
  // CORDOVA VENTURO el gemelo del Excel parecía más reciente que el hilo real
  // solo por la nota del 02-09. Atención es lo que hizo una persona que
  // atiende clientes; las notas del Excel importadas cuentan porque van a
  // nombre del comercial que las escribió.
  const actsDeOp = new Map<string, { tipo: string; realizada_at: string }[]>();
  for (const a of actividades) {
    const rol = Array.isArray(a.perfiles) ? a.perfiles[0]?.rol : a.perfiles?.rol;
    if (!a.realizada_por || rol === "admin") continue;
    actsDeOp.set(a.oportunidad_id, [...(actsDeOp.get(a.oportunidad_id) ?? []), a]);
  }

  for (const f of conCuenta) {
    const desde = ventanaDe.get(f.id);
    if (desde === undefined) continue;
    let hallada: AtencionAlLado | null = null;
    for (const opGemela of gemelasDeCuenta.get(f.cuentaId as string) ?? []) {
      for (const a of actsDeOp.get(opGemela) ?? []) {
        if (new Date(a.realizada_at).getTime() < desde) continue;
        if (!hallada) {
          hallada = { fecha: a.realizada_at, ultima: a.realizada_at, tipo: a.tipo };
        } else {
          if (a.realizada_at < hallada.fecha) {
            hallada.fecha = a.realizada_at;
            hallada.tipo = a.tipo;
          }
          if (a.realizada_at > hallada.ultima) hallada.ultima = a.realizada_at;
        }
      }
    }
    if (hallada) resultado.set(f.id, hallada);
  }
  return resultado;
}
