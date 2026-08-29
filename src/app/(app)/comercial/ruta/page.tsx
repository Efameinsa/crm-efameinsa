import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FilaRutaMantenimiento } from "@/components/crm/fila-ruta";
import {
  columnaDe,
  ordenarRuta,
  ETIQUETA_COLUMNA,
  type ColumnaRuta,
  type FilaRuta,
} from "@/lib/ruta-mantenimiento";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La ruta de mantenimiento: la campaña de postventa vista como campaña.
 *
 * Es la ÚNICA pantalla nueva del oficio de Ariana (D1 del plan 16): ella vende
 * mantenimiento y repuestos, no ejecuta el servicio, así que no tiene nada que
 * hacer en /postventa. Lo que sí necesitaba y no existía es esto: una lista de
 * a quién llamar hoy, ordenada por la única pregunta que ordena una campaña
 * —hace cuánto compró sin haberse hecho un mantenimiento— y con el desenlace
 * de la llamada a un clic.
 *
 * De dónde sale el trabajo: las oportunidades de `tipo_postventa =
 * 'mantenimiento'` —103 suyas, importadas de su propio Excel el 27-08, más las
 * que nazcan—. No es una tabla nueva: es su pipeline, mirado por la pregunta
 * correcta. Hever ve las suyas por el mismo camino (D2), y gerencia las de
 * todos.
 */

const PESTANAS: ColumnaRuta[] = ["por_llamar", "llamados", "cotizados", "cerrados"];

/**
 * Cuántas filas se pintan de entrada.
 *
 * Con los tres años de cierres importados esta pantalla pasó a tener 248 filas
 * para Ariana, y pintarlas todas mandaba 800 KB de HTML por una lista que se
 * trabaja de a diez llamadas. Se muestran las primeras y el resto está a un
 * clic — el orden ya pone arriba lo que hay que hacer hoy, así que la fila 200
 * no es urgente por definición.
 */
const POR_PAGINA = 40;

interface OportunidadRuta {
  id: string;
  etapa: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  created_at: string;
  cerrada_at: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  cuenta_id: string | null;
  cuentas: {
    id: string;
    razon_social: string;
    distrito: string | null;
    provincia: string | null;
    ultima_venta_at: string | null;
    comercial_id: string | null;
  } | null;
}

export default async function RutaMantenimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; q?: string; todos?: string }>;
}) {
  const sp = await searchParams;
  const pestana: ColumnaRuta = PESTANAS.includes(sp.ver as ColumnaRuta) ? (sp.ver as ColumnaRuta) : "por_llamar";
  const busqueda = (sp.q ?? "").trim();

  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  // Quien tiene la llave de servicios ve la campaña entera — Carlos, 28-08:
  // «veo que ha sido el último mantenimiento del equipo… ya pasó más de un
  // año, agarro, reviso, gestiono, cotizo. Solo si tiene acceso a la
  // información; si no, agarra el archivador». Eso vale para el área
  // (es_postventa), para Ariana y para el comercial al que operaciones le
  // abrió la vista (hace_postventa, 0116). Ver no es contabilizar: cada venta
  // sigue siendo de su dueño. La RLS (0124) ya lo garantiza — este filtro es
  // para no traer de la base lo que igual se iba a descartar.
  const verTodo =
    perfil.rol === "gerencia" ||
    perfil.rol === "admin" ||
    Boolean(perfil.es_postventa) ||
    Boolean(perfil.hace_postventa);
  let consulta = supabase
    .from("oportunidades")
    .select(
      "id, etapa, proxima_accion, proxima_accion_at, created_at, cerrada_at, monto_estimado, moneda, cuenta_id, cuentas(id, razon_social, distrito, provincia, ultima_venta_at, comercial_id)",
    )
    .eq("tipo_postventa", "mantenimiento")
    .limit(500);
  if (!verTodo) consulta = consulta.eq("comercial_id", perfil.id);

  const { data: oportunidades } = await consulta;
  const lista = (oportunidades ?? []) as unknown as OportunidadRuta[];
  const ids = lista.map((o) => o.id);
  const cuentaIds = [...new Set(lista.map((o) => o.cuenta_id).filter((x): x is string => !!x))];

  // La última gestión de cada oportunidad y el equipo de cada cliente, en dos
  // consultas y no en 103: la lista completa cabe de sobra en memoria.
  const [{ data: actividades }, { data: equipos }, { data: perfiles }, { data: contactos }, { data: ventas }] =
    await Promise.all([
    ids.length
      ? supabase
          .from("actividades")
          .select("oportunidad_id, realizada_at, nota")
          .in("oportunidad_id", ids)
          .order("realizada_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
    cuentaIds.length
      ? supabase
          .from("equipos_instalados")
          .select("cuenta_id, serie, modelo_texto, ultimo_mantenimiento, fecha_venta")
          .in("cuenta_id", cuentaIds)
      : Promise.resolve({ data: [] }),
      supabase.from("perfiles").select("id, nombre"),
      // El teléfono al que hay que llamar. Sin esto, cada llamada empieza
      // abriendo la ficha del cliente.
      cuentaIds.length
        ? supabase
            .from("contactos")
            .select("cuenta_id, nombre, telefono, es_principal")
            .in("cuenta_id", cuentaIds)
            .not("telefono", "is", null)
        : Promise.resolve({ data: [] }),
      // Cuándo compró de verdad. `cuentas.ultima_venta_at` está vacío en la
      // mayoría de estos clientes —viene del CRM, y estas ventas son de los
      // Excel y de los informes—, y una columna que dice «—» en ocho de cada
      // diez filas no informa nada.
      cuentaIds.length
        ? supabase
            .from("ventas")
            .select("fecha_venta, oportunidades!inner(cuenta_id)")
            .in("oportunidades.cuenta_id", cuentaIds)
            .is("anulada_at", null)
            .order("fecha_venta", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [] }),
    ]);

  const ultimaGestion = new Map<string, { realizada_at: string; nota: string | null }>();
  for (const a of (actividades ?? []) as { oportunidad_id: string; realizada_at: string; nota: string | null }[]) {
    // Vienen ordenadas de la más nueva a la más vieja: la primera de cada
    // oportunidad es la última gestión.
    if (!ultimaGestion.has(a.oportunidad_id)) ultimaGestion.set(a.oportunidad_id, a);
  }

  const equipoPorCuenta = new Map<
    string,
    { serie: string | null; modelo_texto: string | null; ultimo_mantenimiento: string | null; fecha_venta: string | null }
  >();
  for (const e of (equipos ?? []) as {
    cuenta_id: string | null;
    serie: string | null;
    modelo_texto: string | null;
    ultimo_mantenimiento: string | null;
    fecha_venta: string | null;
  }[]) {
    if (!e.cuenta_id) continue;
    const previo = equipoPorCuenta.get(e.cuenta_id);
    // Con varias máquinas manda la que hace más que no se toca: es la que
    // justifica la llamada.
    if (!previo || (previo.ultimo_mantenimiento ?? "") > (e.ultimo_mantenimiento ?? "")) {
      equipoPorCuenta.set(e.cuenta_id, e);
    }
  }

  const nombrePorPerfil = new Map((perfiles ?? []).map((p) => [p.id as string, p.nombre as string]));

  // Un contacto por cuenta: manda el marcado como principal.
  const contactoPorCuenta = new Map<string, { nombre: string | null; telefono: string | null }>();
  for (const c of (contactos ?? []) as {
    cuenta_id: string;
    nombre: string | null;
    telefono: string | null;
    es_principal: boolean | null;
  }[]) {
    const previo = contactoPorCuenta.get(c.cuenta_id);
    if (!previo || c.es_principal) contactoPorCuenta.set(c.cuenta_id, { nombre: c.nombre, telefono: c.telefono });
  }

  const ultimaCompra = new Map<string, string>();
  for (const v of (ventas ?? []) as unknown as {
    fecha_venta: string;
    oportunidades: { cuenta_id: string } | null;
  }[]) {
    const cuentaId = v.oportunidades?.cuenta_id;
    // Vienen de la más nueva a la más vieja: la primera de cada cuenta manda.
    if (cuentaId && !ultimaCompra.has(cuentaId)) ultimaCompra.set(cuentaId, v.fecha_venta);
  }

  const filas: FilaRuta[] = lista.map((o) => {
    const gestion = ultimaGestion.get(o.id);
    const equipo = o.cuenta_id ? equipoPorCuenta.get(o.cuenta_id) : undefined;
    const duenoCuenta = o.cuentas?.comercial_id ?? null;
    return {
      id: o.id,
      cuentaId: o.cuenta_id,
      razonSocial: o.cuentas?.razon_social ?? "Cliente sin identificar",
      zona: o.cuentas?.distrito ?? o.cuentas?.provincia ?? null,
      etapa: o.etapa,
      compraAt:
        (o.cuenta_id ? ultimaCompra.get(o.cuenta_id) : null) ??
        o.cuentas?.ultima_venta_at ??
        equipo?.fecha_venta ??
        null,
      ultimoMantenimiento: equipo?.ultimo_mantenimiento ?? null,
      serie: equipo?.serie ?? null,
      equipo: equipo?.modelo_texto ?? null,
      ultimaGestionAt: gestion?.realizada_at ?? null,
      ultimaNota: gestion?.nota ?? null,
      proximaAccion: o.proxima_accion,
      proximaAccionAt: o.proxima_accion_at,
      monto: o.monto_estimado,
      moneda: o.moneda,
      cerradaAt: o.cerrada_at,
      contacto: o.cuenta_id ? (contactoPorCuenta.get(o.cuenta_id)?.nombre ?? null) : null,
      telefono: o.cuenta_id ? (contactoPorCuenta.get(o.cuenta_id)?.telefono ?? null) : null,
      carteraDe:
        duenoCuenta && duenoCuenta !== perfil.id ? (nombrePorPerfil.get(duenoCuenta) ?? "otro comercial") : null,
    };
  });

  const cuenta = (c: ColumnaRuta) => filas.filter((f) => columnaDe(f, hoy) === c).length;
  const patron = busqueda.toLowerCase();
  const visibles = ordenarRuta(
    filas.filter(
      (f) =>
        columnaDe(f, hoy) === pestana &&
        (!patron ||
          f.razonSocial.toLowerCase().includes(patron) ||
          (f.zona ?? "").toLowerCase().includes(patron) ||
          (f.serie ?? "").toLowerCase().includes(patron)),
    ),
    hoy,
  );
  const todos = sp.todos === "1";
  const mostradas = todos ? visibles : visibles.slice(0, POR_PAGINA);
  const cerrada = pestana === "cerrados" || pestana === "cotizados";

  return (
    <SeccionPanel
      titulo="Ruta de mantenimiento"
      accion={
        <div className="flex flex-wrap items-center gap-1.5">
          {PESTANAS.map((p) => (
            <Link
              key={p}
              href={`/comercial/ruta?ver=${p}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
                pestana === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {ETIQUETA_COLUMNA[p]} {cuenta(p)}
            </Link>
          ))}
        </div>
      }
    >
      <p className="mb-3 max-w-prose text-xs text-muted-foreground">
        Clientes de la base instalada a los que hay que ofrecerles el mantenimiento. Arriba, lo que nunca se llamó y
        lo más atrasado; después, lo que lleva más tiempo sin mantenimiento. La cuenta sigue siendo del comercial que
        la vendió: acá está la oportunidad de mantenimiento, no el cliente.
      </p>

      <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="ver" value={pestana} />
        <label className="flex flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
          <Search className="size-3.5 flex-none text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={busqueda}
            placeholder="Cliente, zona o serie"
            className="w-full min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          Buscar
        </button>
      </form>

      {visibles.length === 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {busqueda
            ? `Nada que coincida con «${busqueda}».`
            : pestana === "por_llamar"
              ? "No queda nadie por llamar hoy. Los recontactos programados están en «Llamados»."
              : "Todavía no hay nada acá."}
        </p>
      ) : (
        <div className="space-y-2">
          {mostradas.map((f) => (
            <FilaRutaMantenimiento key={f.id} fila={f} hoy={hoy} cerrada={cerrada} />
          ))}
          {mostradas.length < visibles.length && (
            <Link
              href={`/comercial/ruta?ver=${pestana}&todos=1${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}
              className="block rounded-md border border-dashed border-border p-2.5 text-center text-xs font-medium text-primary hover:bg-accent"
            >
              Ver los {visibles.length - mostradas.length} restantes
            </Link>
          )}
        </div>
      )}
    </SeccionPanel>
  );
}
