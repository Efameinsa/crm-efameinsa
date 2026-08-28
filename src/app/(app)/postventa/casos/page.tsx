import Link from "next/link";
import { Camera, ChevronRight, Cpu, Plus, PackageSearch, ShieldCheck, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { seriesDeTexto, etiquetaTipoServicio, slaCaso, etiquetaEtapaPostventa } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Los casos del área: lo abierto arriba, el historial abajo.
 *
 * Se llamaba «Soporte técnico» y era solo el historial de informes. Carlos usó
 * otra palabra todo el tiempo —la misma con la que Central deriva— y le faltaba
 * la mitad: los casos que están corriendo AHORA, con su reloj. Un historial no
 * dice a quién hay que llamar antes del mediodía.
 *
 * DOS ORÍGENES EN UNA SOLA LISTA de historial, como ya estaba. Arriba los
 * informes nuevos (`informes_servicio`, con fotos, ciclos y conformidad), abajo
 * los que vinieron de la hoja SOPORTE TECNICO del Excel. Para quien busca «qué
 * se le hizo a esta máquina» son lo mismo, y separarlos en dos pantallas
 * obligaría a mirar dos veces.
 *
 * QUÉ SE PUEDE CLIQUEAR. Los informes nuevos abren su ficha. Y en cualquiera de
 * los dos, la SERIE escrita dentro de la descripción del equipo («LAVADORA
 * TITAN MAX S: 509KWSB0A214») se vuelve un enlace a la ficha de esa máquina, si
 * ya está en el parque instalado. Los del Excel no tienen ficha propia: son una
 * línea de una planilla, no un documento — se muestran completos acá.
 */

const ETIQUETA_TIPO: Record<string, string> = {
  garantia: "Garantía",
  repuesto: "Repuesto",
  mantenimiento: "Mantenimiento",
};

interface InformeNuevo {
  id: string;
  correlativo: number | null;
  anio: number;
  tipo: string;
  modalidad: string;
  ejecutado_at: string;
  tecnico: string | null;
  detalle: string | null;
  observaciones: string | null;
  ciclos: number | null;
  cliente_texto: string | null;
  equipo_texto: string | null;
  fotos: unknown[];
  cuentas: { razon_social: string } | null;
}

interface InformeExcel {
  id: string;
  cliente_texto: string | null;
  equipo: string | null;
  detalle: string | null;
  fecha_ejecutado: string | null;
  fecha_envio: string | null;
}

interface CasoAbierto {
  id: string;
  etapa: string;
  intencion: string | null;
  tipo_postventa: string | null;
  serie_texto: string | null;
  codigo_error: string | null;
  created_at: string;
  proxima_accion: string | null;
  proxima_accion_at: string | null;
  equipo_id: string | null;
  cuentas: { razon_social: string } | null;
}

export default async function CasosPostventaPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const verTodo = perfil.rol === "gerencia" || perfil.rol === "admin";

  // UN CASO ES UN CASO: lo que llegó por Central o se registró acá mismo
  // (origen = crm). Las campañas de mantenimiento y los tres años de cierres
  // importados también tienen `tipo_postventa`, y sin este filtro llenaban esta
  // lista con 145 clientes por llamar que no son casos abiertos — esos viven en
  // la ruta de mantenimiento, que es otra pregunta y otra pantalla.
  let consultaCasos = supabase
    .from("oportunidades")
    .select(
      "id, etapa, intencion, tipo_postventa, serie_texto, codigo_error, created_at, proxima_accion, proxima_accion_at, equipo_id, cuentas(razon_social)",
    )
    .not("tipo_postventa", "is", null)
    .eq("origen", "crm")
    .not("etapa", "in", "(venta,rechazada)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (!verTodo) consultaCasos = consultaCasos.eq("comercial_id", perfil.id);

  const [{ data: casos }, { data: nuevos }, { data: historicos }, { data: equipos }] = await Promise.all([
    consultaCasos,
    supabase
      .from("informes_servicio")
      .select(
        "id, correlativo, anio, tipo, modalidad, ejecutado_at, tecnico, detalle, observaciones, ciclos, cliente_texto, equipo_texto, fotos, cuentas(razon_social)",
      )
      .order("ejecutado_at", { ascending: false })
      .limit(200),
    supabase
      .from("soporte_tecnico")
      .select("id, cliente_texto, equipo, detalle, fecha_ejecutado, fecha_envio")
      .order("fecha_ejecutado", { ascending: false, nullsFirst: false })
      .limit(300),
    // El parque instalado, para saber qué serie tiene ficha adónde ir.
    supabase.from("equipos_instalados").select("id, serie"),
  ]);

  const fichaPorSerie = new Map(
    (equipos ?? []).map((e) => [String(e.serie).toUpperCase(), e.id as string]),
  );

  const abiertos = (casos ?? []) as unknown as CasoAbierto[];
  const listaNuevos = (nuevos ?? []) as unknown as InformeNuevo[];
  const listaExcel = (historicos ?? []) as unknown as InformeExcel[];
  const total = listaNuevos.length + listaExcel.length;

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo="Casos abiertos"
        accion={
          <div className="flex items-center gap-2">
            {abiertos.length > 0 && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
                {abiertos.length}
              </span>
            )}
            <Link
              href="/postventa/casos/nuevo"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-3.5" /> Registrar caso
            </Link>
          </div>
        }
      >
        {abiertos.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            No hay casos abiertos. Acá caen los que deriva Central y los que se registran acá mismo cuando el cliente
            llama — empezando por el número de serie, que es lo que trae garantía, ciclos y último mantenimiento. Los
            clientes a los que hay que ofrecerles el mantenimiento no son casos: están en{" "}
            <Link href="/comercial/ruta" className="font-medium text-primary hover:underline">
              la ruta de mantenimiento
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            {abiertos.map((c) => {
              const atendido = c.etapa !== "asignada";
              const sla = slaCaso(c.tipo_postventa, c.created_at, atendido);
              const serie = c.serie_texto;
              const fichaEquipo = c.equipo_id ?? (serie ? fichaPorSerie.get(serie.toUpperCase()) : undefined);
              return (
                <Link
                  key={c.id}
                  href={`/comercial/oportunidades/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-9 flex-none items-center justify-center rounded-full",
                      sla.estado === "rojo"
                        ? "bg-destructive/10 text-destructive"
                        : sla.estado === "ambar"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-secondary text-foreground",
                    )}
                  >
                    {c.tipo_postventa === "garantia" ? (
                      <ShieldCheck className="size-4" />
                    ) : c.tipo_postventa === "repuesto" ? (
                      <PackageSearch className="size-4" />
                    ) : (
                      <Wrench className="size-4" />
                    )}
                  </span>
                  <div className="min-w-[220px] flex-1">
                    <p className="break-words text-sm font-semibold text-foreground">
                      {c.cuentas?.razon_social ?? "Cliente sin nombre"}
                    </p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {c.tipo_postventa ? (ETIQUETA_TIPO[c.tipo_postventa] ?? c.tipo_postventa) : "Sin clasificar"}
                      {c.proxima_accion && ` · ${c.proxima_accion}`}
                      {c.proxima_accion_at && ` · ${fechaCalendario(c.proxima_accion_at)}`}
                    </p>
                    {/* La serie es el eje de la trazabilidad (D6): va en la
                        fila, no escondida adentro del caso. */}
                    <p className="text-[11px] text-muted-foreground">
                      {serie ? (
                        <span className="font-mono font-semibold text-foreground">
                          {fichaEquipo ? "" : "⚠ "}
                          serie {serie}
                        </span>
                      ) : (
                        <span className="text-amber-800">⚠ equipo sin identificar</span>
                      )}
                      {c.codigo_error && <span className="ml-1.5 font-mono">· error {c.codigo_error}</span>}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
                      {etiquetaEtapaPostventa(c.etapa)}
                    </span>
                    <br />
                    {!atendido && (
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          sla.estado === "rojo"
                            ? "text-destructive"
                            : sla.estado === "ambar"
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        {sla.horas < 1 ? "recién llegado" : `${Math.round(sla.horas)} h sin atender · límite ${sla.limite} h`}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel
        titulo="Historial de atenciones"
        accion={
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {total} informe{total === 1 ? "" : "s"}
          </span>
        }
      >
        {total === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Sin informes cargados. Acá van a aparecer las puestas en marcha, las garantías, los mantenimientos y las
            verificaciones de preinstalación, con sus fotos y su lectura de ciclos.
          </p>
        ) : (
          <div className="space-y-5">
            {listaNuevos.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Informes del sistema ({listaNuevos.length})
                </h3>
                {listaNuevos.map((i) => (
                  <Link
                    key={i.id}
                    href={`/postventa/informes/${i.id}`}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-[220px] flex-1 space-y-0.5">
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {i.cuentas?.razon_social ?? i.cliente_texto ?? "Cliente sin identificar"}
                      </p>
                      <Equipo texto={i.equipo_texto} fichaPorSerie={fichaPorSerie} />
                      <p className="text-xs leading-snug text-muted-foreground">
                        {etiquetaTipoServicio(i.tipo)}
                        {i.tecnico && ` · ${i.tecnico}`}
                        {i.modalidad === "videollamada" && " · videollamada"}
                      </p>
                      {i.detalle && (
                        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{i.detalle}</p>
                      )}
                    </div>
                    <div className="flex flex-none items-start gap-2 text-right">
                      <div className="space-y-0.5 text-[11px] text-muted-foreground">
                        {i.correlativo != null && (
                          <p className="font-mono font-semibold text-foreground">
                            N.º {String(i.correlativo).padStart(3, "0")}-{i.anio}
                          </p>
                        )}
                        <p className="font-mono tabular-nums">{fechaHoraLima(i.ejecutado_at)}</p>
                        <p className="flex items-center justify-end gap-2">
                          {Array.isArray(i.fotos) && i.fotos.length > 0 && (
                            <span className="inline-flex items-center gap-0.5">
                              <Camera className="size-3" />
                              {i.fotos.length}
                            </span>
                          )}
                          {i.ciclos != null && <span>{i.ciclos.toLocaleString("es-PE")} ciclos</span>}
                        </p>
                      </div>
                      <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {listaExcel.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Del Excel del área ({listaExcel.length})
                </h3>
                {listaExcel.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-border p-3"
                  >
                    <div className="min-w-[220px] flex-1 space-y-0.5">
                      {/* `break-words` porque acá hay razones sociales de 60
                          caracteres sin espacios cómodos donde partir. */}
                      <p className="break-words text-sm font-semibold leading-snug text-foreground">
                        {s.cliente_texto ?? "Cliente sin identificar"}
                      </p>
                      <Equipo texto={s.equipo} fichaPorSerie={fichaPorSerie} />
                      <p className="text-xs leading-snug text-muted-foreground">{s.detalle ?? "Sin detalle"}</p>
                    </div>
                    <div className="flex-none space-y-0.5 text-right text-[11px] text-muted-foreground">
                      <p className="font-mono tabular-nums">
                        {s.fecha_ejecutado ? `ejecutado ${fechaCalendario(s.fecha_ejecutado)}` : "sin fecha"}
                      </p>
                      {s.fecha_envio && (
                        <p className="font-mono tabular-nums">enviado {fechaCalendario(s.fecha_envio)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

/**
 * La descripción del equipo, con su serie convertida en enlace cuando esa
 * máquina ya está en el parque instalado.
 *
 * Cuando todavía no lo está, la serie se muestra igual, resaltada en
 * monoespaciada. Sigue siendo el dato que identifica la máquina; lo único que
 * falta es adónde llevar.
 */
function Equipo({ texto, fichaPorSerie }: { texto: string | null; fichaPorSerie: Map<string, string> }) {
  if (!texto) return null;
  const series = seriesDeTexto(texto);
  if (series.length === 0) {
    return <p className="break-words text-xs leading-snug text-muted-foreground">{texto}</p>;
  }

  // Se parte la frase por las series encontradas para poder enlazar solo esa
  // parte y dejar el resto como está escrito.
  const patron = new RegExp(`(${series.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const trozos = texto.split(patron);

  return (
    <p className="break-words text-xs leading-snug text-muted-foreground">
      {trozos.map((trozo, i) => {
        const id = fichaPorSerie.get(trozo.toUpperCase());
        if (!id) {
          const esSerie = series.includes(trozo.toUpperCase());
          return esSerie ? (
            <span key={i} className="font-mono font-semibold text-foreground">
              {trozo}
            </span>
          ) : (
            <span key={i}>{trozo}</span>
          );
        }
        return (
          <Link
            key={i}
            href={`/postventa/equipos/${id}`}
            className="inline-flex items-center gap-0.5 font-mono font-semibold text-primary hover:underline"
          >
            <Cpu className="size-3" />
            {trozo}
          </Link>
        );
      })}
    </p>
  );
}
