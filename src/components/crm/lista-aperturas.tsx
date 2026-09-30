import Link from "@/components/enlace";
import { PhoneForwarded, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  ETIQUETA_ESTADO_APERTURA,
  ETIQUETA_TIPO_APERTURA,
  aQuienLeToca,
  estadoApertura,
  limpiarBusqueda,
  numeroInforme,
  TIPOS_APERTURA,
  type AperturaLlamada,
  type TipoApertura,
} from "@/lib/aperturas-llamada";
import { cn } from "@/lib/utils";

type Fila = AperturaLlamada & {
  cuentas: { razon_social: string; num_doc?: string | null } | null;
  informes_servicio?: { correlativo: number | null; anio: number | null; es_prueba: boolean | null } | null;
};

const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const tituloDia = (dia: string, hoy: string, manana: string) => {
  const [y, m, d] = dia.split("-").map(Number);
  const texto = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-PE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  if (dia === hoy) return `Hoy · ${texto}`;
  if (dia === manana) return `Mañana · ${texto}`;
  if (dia < hoy) return `Atrasada · ${texto}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const horaLima = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "numeric", minute: "2-digit" });

/**
 * LAS APERTURAS, POR DÍA (0281). Lo abierto primero, agrupado por el día que
 * se le dio al cliente —Carlos, 23-09: «videollamadas agrupadas por fecha: 24,
 * 25, 26, solo las programadas»—; lo terminado de los últimos días, abajo.
 * La usan postventa y el almacén con la misma forma: cada fila dice a quién le
 * toca.
 */
/** Qué se lista (25-09, Lesly y Ruby): «llamadas» son las derivaciones de soporte técnico; «urgentes», las aperturas directas sin pedido. */
export type PestanaAperturas = "llamadas" | "urgentes";

/**
 * EL BUSCADOR (reunión 28-09 14:18). «Ahorita está bien sencillo identificar
 * acá en derivación de llamadas, porque hay 2 o 3. Pero imagínate que haya
 * 1 000… te tiene que permitir hacer la búsqueda del cliente, y en la búsqueda
 * te va a salir 10 llamadas, una de preinstalación, 10 de problemas…». Con
 * cliente, tipo o estado elegidos, la lista deja de ser «lo de estos días» y
 * busca en todo el historial, de la más reciente a la más antigua, por páginas.
 */
export type FiltrosAperturas = { q?: string; tipo?: string; estado?: string; pagina?: string };
const ESTADOS_BUSQUEDA = [
  { valor: "", etiqueta: "Todos los estados" },
  { valor: "abiertas", etiqueta: "Pendientes" },
  { valor: "cerradas", etiqueta: "Enviadas al cliente" },
  { valor: "anuladas", etiqueta: "Anuladas" },
] as const;
const POR_PAGINA = 50;
/** La hora de la consulta (una sola lectura del reloj por render del servidor). */
const ahoraMs = () => Date.now();

export async function ListaAperturas({
  vistaAlmacen = false,
  pestana = "llamadas",
  base,
  filtros = {},
}: {
  vistaAlmacen?: boolean;
  pestana?: PestanaAperturas;
  /** La ruta de la pantalla, para el buscador y las páginas. */
  base: string;
  filtros?: FiltrosAperturas;
}) {
  const q = limpiarBusqueda(filtros.q);
  const tipo = TIPOS_APERTURA.includes(filtros.tipo as TipoApertura) ? (filtros.tipo as TipoApertura) : null;
  const estado = ESTADOS_BUSQUEDA.some((e) => e.valor && e.valor === filtros.estado) ? (filtros.estado as string) : null;
  const buscador = <Buscador base={base} pestana={pestana} q={q} tipo={tipo} estado={estado} />;
  if (q || tipo || estado) {
    return (
      <div className="space-y-4">
        {buscador}
        <Resultados
          vistaAlmacen={vistaAlmacen}
          pestana={pestana}
          base={base}
          q={q}
          tipo={tipo}
          estado={estado}
          pagina={Math.max(1, Math.floor(Number(filtros.pagina) || 1))}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {buscador}
      <PorDia vistaAlmacen={vistaAlmacen} pestana={pestana} />
    </div>
  );
}

function Buscador({ base, pestana, q, tipo, estado }: { base: string; pestana: PestanaAperturas; q: string; tipo: string | null; estado: string | null }) {
  const campo = "h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground";
  return (
    <form action={base} method="get" role="search" className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
      {pestana === "urgentes" && <input type="hidden" name="ver" value="urgentes" />}
      <label className="relative min-w-[14rem] flex-1">
        <span className="sr-only">Cliente</span>
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Buscar cliente: razón social o RUC/DNI" className={cn(campo, "w-full pl-8")} autoComplete="off" />
      </label>
      <select name="tipo" defaultValue={tipo ?? ""} className={campo} aria-label="Tipo de llamada">
        <option value="">Todos los tipos</option>
        {TIPOS_APERTURA.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIPO_APERTURA[t]}
          </option>
        ))}
      </select>
      <select name="estado" defaultValue={estado ?? ""} className={campo} aria-label="Estado">
        {ESTADOS_BUSQUEDA.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>
      <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
        Buscar
      </button>
      {(q || tipo || estado) && (
        <Link href={pestana === "urgentes" ? `${base}?ver=urgentes` : base} className="text-xs text-muted-foreground hover:underline">
          Limpiar y volver a lo de estos días
        </Link>
      )}
    </form>
  );
}

async function Resultados({
  vistaAlmacen,
  pestana,
  base,
  q,
  tipo,
  estado,
  pagina,
}: {
  vistaAlmacen: boolean;
  pestana: PestanaAperturas;
  base: string;
  q: string;
  tipo: TipoApertura | null;
  estado: string | null;
  pagina: number;
}) {
  const supabase = await createClient();
  let consulta = supabase
    .from("aperturas_llamada")
    .select(`*, cuentas${q ? "!inner" : ""}(razon_social, num_doc), informes_servicio!aperturas_llamada_informe_servicio_id_fkey(correlativo, anio, es_prueba)`, {
      count: "exact",
    })
    .or(pestana === "urgentes" ? "urgente.eq.true" : "urgente.is.null,urgente.eq.false");
  const doc = q.replace(/\s/g, "");
  if (q) {
    // Un número es el RUC o el DNI; si no, cada palabra tiene que estar en la
    // razón social, en cualquier orden («yoni cruz» encuentra CRUZ GALLEGOS YONI).
    if (/^\d{3,}$/.test(doc)) consulta = consulta.ilike("cuentas.num_doc", `%${doc}%`);
    else for (const palabra of q.split(" ").filter(Boolean).slice(0, 5)) consulta = consulta.ilike("cuentas.razon_social", `%${palabra}%`);
  }
  if (tipo) consulta = consulta.eq("tipo", tipo);
  if (estado === "anuladas") consulta = consulta.not("anulada_at", "is", null);
  if (estado === "cerradas") consulta = consulta.is("anulada_at", null).not("enviada_cliente_at", "is", null);
  if (estado === "abiertas") consulta = consulta.is("anulada_at", null).is("enviada_cliente_at", null);
  const desde = (pagina - 1) * POR_PAGINA;
  const { data, count, error } = await consulta.order("programada_para", { ascending: false }).range(desde, desde + POR_PAGINA - 1);
  const filas = (data ?? []) as unknown as Fila[];
  const total = count ?? filas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (p: number) => {
    const u = new URLSearchParams();
    if (pestana === "urgentes") u.set("ver", "urgentes");
    if (q) u.set("q", q);
    if (tipo) u.set("tipo", tipo);
    if (estado) u.set("estado", estado);
    if (p > 1) u.set("pagina", String(p));
    return `${base}?${u.toString()}`;
  };

  if (error) {
    return <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">No se pudo buscar: {error.message}</p>;
  }
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {q ? `No hay llamadas derivadas de un cliente que diga «${q}»` : "No hay llamadas derivadas con esos filtros"}
        {tipo ? ` del tipo «${ETIQUETA_TIPO_APERTURA[tipo]}»` : ""}
        {estado ? ` en «${ESTADOS_BUSQUEDA.find((e) => e.valor === estado)?.etiqueta.toLowerCase()}»` : ""}.
        {q ? " Revise cómo está escrito o busque por el RUC." : ""}
      </p>
    );
  }
  // Cuántas de cada tipo, de un vistazo («una de preinstalación, 10 de problemas…»).
  const porTipo = new Map<string, number>();
  for (const f of filas) porTipo.set(f.tipo, (porTipo.get(f.tipo) ?? 0) + 1);
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
          {total} {total === 1 ? "llamada" : "llamadas"}
          {q ? <span className="font-medium normal-case text-muted-foreground"> · cliente «{q}»</span> : null}
        </h2>
        {paginas === 1 && porTipo.size > 1 && (
          <p className="text-[11px] text-muted-foreground">
            {[...porTipo.entries()].map(([t, n]) => `${n} · ${ETIQUETA_TIPO_APERTURA[t as TipoApertura] ?? t}`).join("   ")}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border">
        {filas.map((f) => (
          <Renglon key={f.id} f={f} vistaAlmacen={vistaAlmacen} conFecha />
        ))}
      </ul>
      {paginas > 1 && (
        <nav className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-xs" aria-label="Páginas">
          {pagina > 1 ? (
            <Link href={enlace(pagina - 1)} className="font-medium text-primary hover:underline">
              ← Más recientes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={enlace(pagina + 1)} className="font-medium text-primary hover:underline">
              Más antiguas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

/** Lo de estos días, agrupado por el día que se le dio al cliente (la vista de siempre). */
async function PorDia({ vistaAlmacen, pestana }: { vistaAlmacen: boolean; pestana: PestanaAperturas }) {
  const supabase = await createClient();
  const ahora = ahoraMs();
  const hace30 = new Date(ahora - 30 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("aperturas_llamada")
    .select("*, cuentas(razon_social), informes_servicio!aperturas_llamada_informe_servicio_id_fkey(correlativo, anio, es_prueba)")
    .or(`anulada_at.is.null,anulada_at.gte.${hace30}`)
    .gte("solicitada_at", new Date(ahora - 120 * 86_400_000).toISOString())
    .or(pestana === "urgentes" ? "urgente.eq.true" : "urgente.is.null,urgente.eq.false")
    .order("programada_para", { ascending: true })
    .limit(500);
  const filas = (data ?? []) as unknown as Fila[];
  const abiertas = filas.filter((f) => aQuienLeToca(estadoApertura(f)) !== null);
  const cerradas = filas
    .filter((f) => aQuienLeToca(estadoApertura(f)) === null && (f.enviada_cliente_at ?? f.anulada_at ?? "") >= hace30)
    .reverse()
    .slice(0, 40);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const manana = new Date(ahora + 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const porDia = new Map<string, Fila[]>();
  for (const f of abiertas) {
    const d = diaLima(f.programada_para);
    porDia.set(d, [...(porDia.get(d) ?? []), f]);
  }

  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <PhoneForwarded className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">{pestana === "urgentes" ? "No hay aperturas urgentes" : "Todavía no hay llamadas derivadas"}</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          {pestana === "urgentes"
            ? "Son las que se mandan sin pedido, con el código de gerencia, cuando hay que sacar algo del almacén de inmediato."
            : vistaAlmacen
              ? "Cuando postventa derive una videollamada o una atención técnica, llega acá con el día, la hora y los equipos."
              : "Se derivan desde el pedido (preinstalación o puesta en marcha), desde el caso técnico o desde la ficha del cliente con «Derivar llamada»."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {abiertas.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{pestana === "urgentes" ? "Nada pendiente: todas las aperturas urgentes están cerradas." : "Nada pendiente: todas las llamadas derivadas están cerradas."}</p>
      ) : (
        // En el almacén, el día más reciente arriba (Lesly, 30-09): las atrasadas de hace una semana tapaban lo de hoy.
        // Dentro del día sigue por hora; postventa conserva su agenda de la más antigua a la más nueva.
        (vistaAlmacen ? [...porDia.entries()].reverse() : [...porDia.entries()]).map(([dia, lista]) => (
          <section key={dia} className="rounded-xl border border-border bg-card shadow-sm">
            <h2
              className={cn(
                "border-b border-border px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide",
                dia < hoy ? "text-destructive" : "text-foreground",
              )}
            >
              {tituloDia(dia, hoy, manana)} <span className="font-medium text-muted-foreground">· {lista.length}</span>
            </h2>
            <ul className="divide-y divide-border">
              {lista.map((f) => (
                <Renglon key={f.id} f={f} vistaAlmacen={vistaAlmacen} />
              ))}
            </ul>
          </section>
        ))
      )}
      {cerradas.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
            Cerradas en los últimos 30 días · {cerradas.length}
          </h2>
          <ul className="divide-y divide-border">
            {cerradas.map((f) => (
              <Renglon key={f.id} f={f} vistaAlmacen={vistaAlmacen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const fechaCortaLima = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "2-digit" });

function Renglon({ f, vistaAlmacen, conFecha = false }: { f: Fila; vistaAlmacen: boolean; conFecha?: boolean }) {
  const estado = estadoApertura(f);
  const leToca = aQuienLeToca(estado);
  const mia = (vistaAlmacen && leToca === "almacen") || (!vistaAlmacen && leToca === "postventa");
  const n = numeroInforme(f.informes_servicio);
  const numero = n ? `Informe N.º ${n}` : null;
  return (
    <li>
      <Link href={`/aperturas/${f.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-accent">
        <span className={cn("shrink-0 whitespace-nowrap pt-0.5 text-sm font-semibold tabular-nums text-foreground", conFecha ? "w-32" : "w-20")}>
          {conFecha ? (
            <>
              {fechaCortaLima(f.programada_para)}
              <span className="block text-xs font-normal text-muted-foreground">{horaLima(f.programada_para)}</span>
            </>
          ) : (
            horaLima(f.programada_para)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{f.cuentas?.razon_social ?? "Cliente"}</span>
          <span className="block text-xs text-muted-foreground">
            {f.urgente && <span className="mr-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">URGENTE</span>}
            {ETIQUETA_TIPO_APERTURA[f.tipo]} · {f.equipos.split("\n")[0]}
            {f.tecnico ? ` · ${f.tecnico}` : ""}
            {numero ? ` · ${numero}` : ""}
          </span>
          {/* Por qué se anuló, a la vista (Rubí, 28-09: «sale anulada, yo no la anulé»). */}
          {f.anulada_at && f.anulada_motivo && <span className="block text-[11px] italic text-muted-foreground">Anulada: {f.anulada_motivo}</span>}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            estado === "anulada" && "bg-secondary text-muted-foreground",
            estado === "enviada_cliente" && "bg-[#E7F4EC] text-[#1E7F4F]",
            // Santos, 24-09: postventa ve en verde que el almacén ya la tomó.
            !vistaAlmacen && estado === "en_gestion" && "bg-[#E7F4EC] text-[#1E7F4F]",
            leToca && !(!vistaAlmacen && estado === "en_gestion") && (mia ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"),
          )}
        >
          {!vistaAlmacen && estado === "en_gestion" ? "✓ " : ""}
          {ETIQUETA_ESTADO_APERTURA[estado]}
          {f.faltantes && estado === "informe_almacen" ? " · hay para cotizar" : ""}
        </span>
      </Link>
    </li>
  );
}
