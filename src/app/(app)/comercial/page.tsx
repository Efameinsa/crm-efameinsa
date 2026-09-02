import Link from "next/link";
import { Archive, FileWarning, Search, X } from "lucide-react";
import { TrabajarHistoricaBoton } from "@/components/crm/trabajar-historica-boton";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PuntoInteres } from "@/components/crm/punto-interes";
import { cn } from "@/lib/utils";
import { hoyLima } from "@/lib/periodo";
import { PasarContactoCentral } from "@/components/crm/pasar-contacto-central";
import { BarraSemana } from "@/components/crm/barra-semana";
import { cargarPulsoSemana } from "@/lib/pulso-semana";
import { lunesDe } from "@/lib/calendario";
import { llegoHace, vencioHace } from "@/lib/mi-dia";

interface FilaMiDia {
  id: string;
  etapa: string;
  intencion: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  razon_social: string;
  /** 'crm' si nació acá; cualquier otra cosa vino de la importación del Excel. */
  origen: string;
  /** Cuándo entró a la cartera: en una recién asignada es cuándo la derivó Central. */
  creada_at: string | null;
}

interface FilaInactiva {
  id: string;
  etapa: string;
  intencion: string;
  motivo_inactividad: string;
  razon_social: string;
}

// Lo que gerencia preguntó mirando la pantalla de Katerine (Word del 01.09,
// punto 2): «¿depende de que los comerciales completen alguna información?».
// Sí, y ahora la fila lo dice en vez de esconderlo:
//   · «Excel» al lado del nombre cuando la oportunidad vino de la importación
//     (la misma pastilla de «Mis oportunidades»): distingue lo que nació en
//     el CRM de lo que se rescató del histórico.
//   · La vencida dice HACE CUÁNTO («venció hace 6 días»), no solo «Vencida»:
//     una de ayer y una de marzo no son la misma urgencia.
//   · Si falta la próxima acción, se dice en ámbar como tarea («Falta indicar
//     qué hacer»), no en gris como si fuera un dato. 19 de las 30 de hoy de
//     Katerine estaban así: ella pone la fecha y deja el texto vacío.
function Fila({ op, urgencia, hoy }: { op: FilaMiDia; urgencia: "vencida" | "hoy" | "nueva"; hoy: string }) {
  const sinAccion = !op.proxima_accion && urgencia !== "nueva";
  return (
    <Link
      href={`/comercial/oportunidades/${op.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md",
        "border-l-4",
        urgencia === "vencida" && "border-l-destructive",
        urgencia === "hoy" && "border-l-primary",
        urgencia === "nueva" && "border-l-amber-500",
      )}
    >
      <PuntoInteres intencion={op.intencion} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="truncate">{op.razon_social}</span>
          {op.origen !== "crm" && (
            <span
              className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Vino de la importación del Excel; la gestión que se le hizo en el CRM está en su ficha"
            >
              Excel
            </span>
          )}
        </p>
        <p className={cn("truncate text-xs", sinAccion ? "font-medium text-amber-700" : "text-muted-foreground")}>
          {op.proxima_accion ?? (urgencia === "nueva" ? "Primer contacto pendiente" : "Falta indicar qué hacer")}
        </p>
      </div>
      {urgencia === "vencida" && (
        <span className="whitespace-nowrap rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold text-destructive">
          {op.proxima_accion_at ? vencioHace(op.proxima_accion_at, hoy) : "Vencida"}
        </span>
      )}
      {urgencia === "nueva" && (
        <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          {op.creada_at ? llegoHace(op.creada_at, hoy) : "Nuevo"}
        </span>
      )}
    </Link>
  );
}

function Grupo({
  titulo,
  filas,
  urgencia,
  hoy,
  total,
}: {
  titulo: string;
  filas: FilaMiDia[];
  urgencia: "vencida" | "hoy" | "nueva";
  hoy: string;
  /** Cuántas hay de verdad cuando la lista está acotada: el título dice «60 de 6.178», no «60». */
  total?: number;
}) {
  if (filas.length === 0) return null;
  const recortado = total !== undefined && total > filas.length;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {titulo}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {recortado ? `${filas.length} de ${total.toLocaleString("es-PE")}` : filas.length}
        </span>
      </h4>
      <div className="space-y-2">
        {filas.map((op) => (
          <Fila key={op.id} op={op} urgencia={urgencia} hoy={hoy} />
        ))}
      </div>
    </div>
  );
}

// Distinto de "Vencidas": esto no viene de una próxima_accion_at que se
// pasó, sino de que Efameinsa lleva desde 2020 tratando "N meses sin
// respuesta" como candidato a Rechazado (docs/08). Nunca cambia el estado
// solo — el botón exige el motivo, igual que un rechazo manual.
function FilaCorrespondeCerrar({ op }: { op: FilaInactiva }) {
  return (
    <Link
      href={`/comercial/oportunidades/${op.id}`}
      className="flex items-center gap-3 rounded-lg border border-l-4 border-border border-l-muted-foreground/40 bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
    >
      <PuntoInteres intencion={op.intencion} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{op.razon_social}</p>
        <p className="truncate text-xs text-muted-foreground">{op.motivo_inactividad}</p>
      </div>
    </Link>
  );
}

function GrupoCorrespondeCerrar({ filas }: { filas: FilaInactiva[] }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Corresponde cerrar
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">{filas.length}</span>
      </h4>
      <div className="space-y-2">
        {filas.map((op) => (
          <FilaCorrespondeCerrar key={op.id} op={op} />
        ))}
      </div>
    </div>
  );
}

interface VentaSinInformeFila {
  id: string;
  cuentaId: string;
  razonSocial: string;
  fecha: string;
  monto: number;
  moneda: string;
}

// Ventas cerradas a las que les falta el informe para Central. Va en "Mi día"
// y no en un ítem del menú porque emitirlo NO es una sección que uno visita:
// es la consecuencia de haber cerrado una venta, y pasa dos o tres veces al
// mes. Un ítem de menú para eso se vuelve invisible por costumbre; acá el
// sistema lo pone delante en el momento en que corresponde.
//
// Solo cuenta las ventas nacidas EN el CRM: las 626 importadas del Excel son
// anteriores al sistema y nadie va a emitirles un informe a destiempo. Mientras
// las ventas se sigan cerrando fuera de la plataforma, este bloque va a estar
// vacío — y eso es correcto: es el mismo motivo por el que gerencia tiene
// pendiente decidir que toda venta nazca en el CRM.
function GrupoSinInforme({ filas }: { filas: VentaSinInformeFila[] }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Ventas sin informe de cierre
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          {filas.length}
        </span>
      </h4>
      <p className="mb-2 text-xs text-muted-foreground">
        Central necesita el informe para facturar, cobrar y despachar.
      </p>
      <div className="space-y-2">
        {filas.map((v) => (
          <Link
            key={v.id}
            href={`/comercial/informes/nuevo?cuenta=${v.cuentaId}&venta=${v.id}`}
            className="flex items-center gap-3 rounded-lg border border-border border-l-4 border-l-amber-500 bg-card p-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
          >
            <FileWarning className="size-4 flex-none text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{v.razonSocial}</p>
              <p className="truncate text-xs text-muted-foreground">
                Vendido el {new Date(`${v.fecha}T12:00:00`).toLocaleDateString("es-PE")} · {v.moneda}{" "}
                {Number(v.monto).toLocaleString("es-PE")}
              </p>
            </div>
            <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              Emitir informe
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface FilaBase {
  id: string;
  intencion: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  razon_social: string;
  rubro: string | null;
}

// LA BASE DEL EXCEL, al pie de Mi día (Santos, 02-09). Lo de arriba es lo real:
// lo que nació en el CRM o ya se gestiona en el CRM. Esto es lo que vino del
// Excel y nadie tocó (etapa `historico`, 0130): no cuenta en Mi día ni en
// ningún reporte hasta que alguien lo RETOME. Plegada por defecto; al abrirla
// se despliega acá mismo con buscador y rubro, porque con miles de filas
// nadie hace scroll: se busca a alguien o se trabaja una tanda. Retomar es un
// toque y la fila sube a «Para hoy»; proyectar el cierre (Potencial) es otro
// paso, desde la ficha, cuando ya hubo contacto —una intención no es una
// promesa a gerencia—.
function SeccionBase({
  abierta,
  total,
  filas,
  q,
  rubro,
  rubros,
  hoy,
}: {
  abierta: boolean;
  total: number;
  filas: FilaBase[];
  q: string;
  rubro: string;
  rubros: { id: number; nombre: string }[];
  hoy: string;
}) {
  if (total === 0 && !abierta) return null;
  const n = total.toLocaleString("es-PE");
  if (!abierta) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3">
        <div className="flex items-start gap-2">
          <Archive className="mt-0.5 size-4 flex-none text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold text-foreground">La base del Excel · {n} sin tocar</p>
            <p className="text-xs text-muted-foreground">
              Clientes que vinieron del Excel y nadie retomó en el CRM. No cuentan aquí ni en ningún reporte hasta que los
              retome.
            </p>
          </div>
        </div>
        <Link
          href="/comercial?base=1"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary/50 bg-background px-3 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          Abrir la base
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Archive className="size-4 text-muted-foreground" /> La base del Excel · {n} sin tocar
        </p>
        <div className="flex items-center gap-3 text-xs">
          <Link href="/comercial/oportunidades?etapa=historico" className="font-medium text-primary hover:underline">
            Ver la base completa →
          </Link>
          <Link href="/comercial" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" /> Cerrar
          </Link>
        </div>
      </div>
      <form action="/comercial" className="flex flex-wrap gap-2">
        <input type="hidden" name="base" value="1" />
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por cliente…"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm"
          />
        </div>
        <select name="rubro" defaultValue={rubro} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {r.nombre}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90">
          Buscar
        </button>
      </form>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada en la base con ese filtro.</p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((op) => (
            <div key={op.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 shadow-sm">
              <Link href={`/comercial/oportunidades/${op.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <PuntoInteres intencion={op.intencion} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                    <span className="truncate">{op.razon_social}</span>
                    <span className="flex-none rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Excel</span>
                    {op.rubro && <span className="hidden flex-none text-[11px] font-normal text-muted-foreground sm:inline">· {op.rubro}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {op.proxima_accion ?? "Sin acción anotada en el Excel"}
                    {op.proxima_accion_at && ` · ${vencioHace(op.proxima_accion_at, hoy)}`}
                  </p>
                </div>
              </Link>
              <TrabajarHistoricaBoton oportunidadId={op.id} compacto />
            </div>
          ))}
          {total > filas.length && (
            <p className="text-xs text-muted-foreground">
              Se muestran {filas.length} de {n}. Afine la búsqueda o{" "}
              <Link href="/comercial/oportunidades?etapa=historico" className="font-medium text-primary hover:underline">
                vea la base completa
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ base?: string; q?: string; rubro?: string }>;
}) {
  const sp = await searchParams;
  const baseAbierta = sp.base === "1";
  const baseQ = (sp.q ?? "").trim();
  const baseRubro = /^\d+$/.test(sp.rubro ?? "") ? (sp.rubro as string) : "";
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  // Antes: new Date().toISOString() — eso es UTC. A las 7 pm de Lima el
  // servidor ya cree que es mañana y "Para hoy" se vaciaba (A5 del plan 11).
  const hoy = hoyLima();

  // ⚠️ HISTORIA DE ESTE FILTRO (leer antes de tocarlo).
  //
  // Hasta el 24-08 acá había un `.eq("origen", "crm")`. La razón era buena: el
  // 21-08 se importaron ~23 mil oportunidades del Excel con proxima_accion_at
  // de años pasados (algunas de 1900), y TODAS calzan con "<= hoy" — sin
  // filtro, "Vencidas" mostraba miles de filas.
  //
  // Pero ninguna oportunidad de los comerciales tiene origen='crm': todas
  // vienen del import. O sea que el filtro no acotaba la pantalla, la vaciaba.
  // Darwin lo reportó el 23-08 —«en Mi día supuestamente están todos los
  // pendientes para hoy; aparece por defecto vacío»— y es el mismo agujero que
  // dejaba el Kanban en blanco.
  //
  // La solución no es el origen sino el ALCANCE: se piden tres consultas
  // acotadas en Postgres, y las vencidas se traen de la más reciente hacia
  // atrás y con tope. Lo de 1900 queda fuera solo, sin filtro ad hoc, y el
  // comercial ve lo que de verdad puede retomar.
  const TOPE_VENCIDAS = 60;
  const TOPE_NUEVAS = 40;
  const CAMPOS_MI_DIA = "id, etapa, intencion, origen, proxima_accion, proxima_accion_at, created_at, cuentas(razon_social)";
  //
  // 31-08 (migración 0130): a las tres cerradas se sumó `historico`. Brenda
  // veía 1.035 vencidas cuando las suyas de verdad son 41 — las otras 994 eran
  // etiquetas congeladas del Excel que nadie tocó desde el import del 18-08.
  // No es un filtro escondido: son visibles en su propia pestaña de «Mis
  // oportunidades» y en la ficha del cliente, con botón para retomarlas.
  const abiertasDe = () =>
    supabase
      .from("oportunidades")
      .select(CAMPOS_MI_DIA)
      .eq("comercial_id", perfil.id)
      .not("etapa", "in", "(venta,rechazada,derivada,historico)");

  const [
    { data: hoyData },
    { data: vencidasData, count: vencidasTotal },
    { data: nuevasData, count: nuevasTotal },
    { count: historicoTotal },
  ] = await Promise.all([
    abiertasDe().eq("proxima_accion_at", hoy).order("proxima_accion_hora", { ascending: true, nullsFirst: true }),
    supabase
      .from("oportunidades")
      .select(CAMPOS_MI_DIA, { count: "exact" })
      .eq("comercial_id", perfil.id)
      .not("etapa", "in", "(venta,rechazada,derivada,historico)")
      .lt("proxima_accion_at", hoy)
      .order("proxima_accion_at", { ascending: false })
      .limit(TOPE_VENCIDAS),
    supabase
      .from("oportunidades")
      .select(CAMPOS_MI_DIA, { count: "exact" })
      .eq("comercial_id", perfil.id)
      .eq("etapa", "asignada")
      .is("proxima_accion_at", null)
      .order("created_at", { ascending: false })
      .limit(TOPE_NUEVAS),
    // Lo que quedó del Excel y se archivó (0130): se dice al pie con su
    // número, para que nadie crea que desapareció. Gerencia vio «60 vencidas»
    // y no tenía cómo saber que atrás había 6.000 filas importadas.
    supabase
      .from("oportunidades")
      .select("id", { count: "exact", head: true })
      .eq("comercial_id", perfil.id)
      .eq("etapa", "historico"),
  ]);

  const aFila = (op: NonNullable<typeof hoyData>[number]): FilaMiDia => ({
    id: op.id,
    etapa: op.etapa,
    intencion: op.intencion,
    origen: op.origen ?? "crm",
    proxima_accion: op.proxima_accion,
    proxima_accion_at: op.proxima_accion_at,
    creada_at: op.created_at ?? null,
    razon_social: (op.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
  });

  const paraHoy = (hoyData ?? []).map(aFila);
  const vencidas = (vencidasData ?? []).map(aFila);
  const nuevas = (nuevasData ?? []).map(aFila);
  const oportunidades = [...nuevas, ...paraHoy, ...vencidas];
  const vencidasOcultas = Math.max(0, (vencidasTotal ?? vencidas.length) - vencidas.length);
  const nuevasOcultas = Math.max(0, (nuevasTotal ?? nuevas.length) - nuevas.length);

  // Distinta de "Vencidas": no depende de proxima_accion_at, sino de los
  // umbrales del manual de Efameinsa (1 mes prospecto / 3 meses cotización,
  // ver migración 0018). Puede haber candidatos acá aunque "Mi día" esté
  // vacío arriba, así que se consulta y se muestra aparte.
  const { data: inactivasData } = await supabase
    .from("v_oportunidades_inactivas")
    .select("id, etapa, intencion, motivo_inactividad, cuentas(razon_social)")
    .eq("comercial_id", perfil.id)
    // ⚠️ ACÁ el filtro por origen SÍ se mantiene, y a propósito (24-08).
    // Medido con datos reales: sin él, "Corresponde cerrar" mostraría 724
    // filas a Brenda, 5.438 a C4 y 12.814 a Katerine — son oportunidades del
    // Excel que ya pasaron los umbrales del manual (1 mes prospecto / 3 meses
    // cotización, migración 0018). No es un bug de la pantalla: es que el
    // histórico entero está vencido. Cerrar eso en bloque es decisión de
    // gerencia (con qué motivo, y si se cierran o se reasignan), no algo que
    // el CRM deba empujarle a cada comercial en su pantalla de inicio.
    // Queda como pregunta abierta en el plan 11 junto con D1.
    .eq("origen", "crm");

  const inactivas: FilaInactiva[] = (inactivasData ?? []).map((op) => ({
    id: op.id,
    etapa: op.etapa,
    intencion: op.intencion,
    motivo_inactividad: op.motivo_inactividad,
    razon_social: (op.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cuenta sin nombre",
  }));

  // Ventas del CRM sin informe. La consulta trae los informes atados a cada
  // venta y se descartan acá: son pocas filas y evita una función nueva.
  const { data: ventasData } = await supabase
    .from("ventas")
    .select(
      "id, fecha_venta, monto_total, moneda, origen, oportunidades!inner(comercial_id, cuenta_id, cuentas(razon_social)), informes_cierre(id)",
    )
    .eq("oportunidades.comercial_id", perfil.id)
    .eq("origen", "crm")
    // Una venta anulada no cuenta: el cierre se queda con su número, pero el
    // récord no lo suma (reunión con gerencia del 28-08, migración 0110).
    .is("anulada_at", null)
    .order("fecha_venta", { ascending: false });

  const sinInforme: VentaSinInformeFila[] = (ventasData ?? [])
    .filter((v) => ((v.informes_cierre as unknown as unknown[]) ?? []).length === 0)
    .map((v) => {
      const op = v.oportunidades as unknown as { cuenta_id: string; cuentas: { razon_social: string } | null };
      return {
        id: v.id,
        cuentaId: op.cuenta_id,
        razonSocial: op.cuentas?.razon_social ?? "Cuenta sin nombre",
        fecha: v.fecha_venta,
        monto: v.monto_total,
        moneda: v.moneda,
      };
    });

  // La barra de la semana va ARRIBA de todo y no en «Mi gestión»: es lo
  // primero que ve el comercial al entrar, que es cuando la barra puede
  // cambiarle el día. En «Mi gestión» estaría a dos clics y no la vería nadie.
  const [pulso] = await cargarPulsoSemana(supabase, lunesDe(hoy), perfil.id);

  // La base del Excel, solo si se abrió: buscador por cliente y rubro, las 40
  // más recientes por fecha de retomar.
  let filasBase: FilaBase[] = [];
  let totalBase = historicoTotal ?? 0;
  let rubros: { id: number; nombre: string }[] = [];
  if (baseAbierta) {
    let consulta = supabase
      .from("oportunidades")
      .select("id, intencion, proxima_accion, proxima_accion_at, cuentas!inner(razon_social, rubro_id, catalogo_rubros(nombre))", {
        count: "exact",
      })
      .eq("comercial_id", perfil.id)
      .eq("etapa", "historico");
    if (baseQ) consulta = consulta.ilike("cuentas.razon_social", `%${baseQ}%`);
    if (baseRubro) consulta = consulta.eq("cuentas.rubro_id", Number(baseRubro));
    const [{ data: baseData, count }, { data: rubrosData }] = await Promise.all([
      consulta.order("proxima_accion_at", { ascending: false, nullsFirst: false }).limit(40),
      supabase.from("catalogo_rubros").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    totalBase = count ?? 0;
    rubros = (rubrosData ?? []) as { id: number; nombre: string }[];
    filasBase = (baseData ?? []).map((op) => {
      const c = op.cuentas as unknown as { razon_social: string; catalogo_rubros: { nombre: string } | null } | null;
      return {
        id: op.id,
        intencion: op.intencion,
        proxima_accion: op.proxima_accion,
        proxima_accion_at: op.proxima_accion_at,
        razon_social: c?.razon_social ?? "Cuenta sin nombre",
        rubro: c?.catalogo_rubros?.nombre ?? null,
      };
    });
  }

  return (
    <div className="space-y-5">
      {pulso && <BarraSemana pulso={pulso} href="/comercial/mi-gestion" />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Mi día</CardTitle>
            {/* El resumen en una línea, con los totales de verdad: lo que
                gerencia leyó como «60 vencidas» eran 60 de 6.178. */}
            {oportunidades.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  (nuevasTotal ?? nuevas.length) > 0 &&
                    `${(nuevasTotal ?? nuevas.length).toLocaleString("es-PE")} recién asignada${(nuevasTotal ?? nuevas.length) === 1 ? "" : "s"}`,
                  paraHoy.length > 0 && `${paraHoy.length} para hoy`,
                  (vencidasTotal ?? vencidas.length) > 0 &&
                    `${(vencidasTotal ?? vencidas.length).toLocaleString("es-PE")} vencida${(vencidasTotal ?? vencidas.length) === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {/* Para el WhatsApp o la llamada que le entra directo: lo registra
              acá y Central lo deriva, en vez de mandarlo por correo para que
              lo vuelvan a tipear. */}
          <PasarContactoCentral />
        </CardHeader>
        <CardContent className="space-y-5">
          {oportunidades.length === 0 && inactivas.length === 0 && sinInforme.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tiene acciones pendientes para hoy.</p>
          ) : (
            <>
              {/* Primero, porque es plata ya cerrada que no puede despacharse
                  hasta que Central reciba el informe. */}
              {/* EL ORDEN ES LA TEMPERATURA (Santos, 02-09: «primero las
                  recién asignadas por Central, que es lo más calientito»).
                  1) plata cerrada que Central no puede facturar; 2) lo que
                  Central derivó y espera respuesta —cada hora enfría el
                  contacto—; 3) lo que ella agendó para hoy; 4) lo que se le
                  pasó, de lo más reciente a lo más viejo. Antes las vencidas
                  iban arriba y una derivación de hace una hora quedaba al
                  fondo, debajo de 15 vencidas. */}
              <GrupoSinInforme filas={sinInforme} />
              <Grupo titulo="Recién asignadas por Central" filas={nuevas} urgencia="nueva" hoy={hoy} total={nuevasTotal ?? undefined} />
              {nuevasOcultas > 0 && (
                <p className="-mt-3 text-xs text-muted-foreground">
                  Se muestran las {nuevas.length} más recientes ·{" "}
                  <Link
                    href="/comercial/oportunidades?etapa=asignada"
                    className="font-medium text-primary hover:underline"
                  >
                    hay {nuevasOcultas.toLocaleString("es-PE")} sin primer contacto más
                  </Link>
                </p>
              )}
              <Grupo titulo="Para hoy" filas={paraHoy} urgencia="hoy" hoy={hoy} />
              <Grupo titulo="Vencidas" filas={vencidas} urgencia="vencida" hoy={hoy} total={vencidasTotal ?? undefined} />
              {vencidasOcultas > 0 && (
                <p className="-mt-3 text-xs text-muted-foreground">
                  Se muestran las {vencidas.length} más recientes ·{" "}
                  <Link href="/comercial/oportunidades" className="font-medium text-primary hover:underline">
                    hay {vencidasOcultas.toLocaleString("es-PE")} vencidas más en Mis oportunidades
                  </Link>
                </p>
              )}
              <GrupoCorrespondeCerrar filas={inactivas} />
            </>
          )}
          <SeccionBase
            abierta={baseAbierta}
            total={totalBase}
            filas={filasBase}
            q={baseQ}
            rubro={baseRubro}
            rubros={rubros}
            hoy={hoy}
          />
        </CardContent>
      </Card>
    </div>
  );
}
