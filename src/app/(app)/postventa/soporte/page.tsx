import Link from "next/link";
import { Camera, ChevronRight, Cpu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { seriesDeTexto, etiquetaTipoServicio } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El registro de informes del área: puestas en marcha, garantías,
 * mantenimientos y verificaciones de preinstalación.
 *
 * POR QUÉ DEJÓ DE SER UNA TABLA. Lo era, y el texto se montaba encima del de
 * la columna siguiente: `TableCell` trae `whitespace-nowrap` de base, así que
 * un cliente de 60 caracteres dentro de una celda de 240 px no se parte — se
 * desborda sobre la vecina. Se podía forzar el corte celda por celda, pero una
 * tabla de cinco columnas donde tres son texto largo es la forma equivocada de
 * mostrar esto: son fichas, no una planilla. Con filas-tarjeta el texto tiene
 * dónde caer y además entra en un celular, que es donde se consultan.
 *
 * DOS ORÍGENES EN UNA SOLA LISTA. Arriba los informes nuevos
 * (`informes_servicio`, con fotos, ciclos y conformidad), abajo los que vinieron
 * de la hoja SOPORTE TECNICO del Excel. Para quien busca «qué se le hizo a esta
 * máquina» son lo mismo y separarlos en dos pantallas obligaría a mirar dos
 * veces.
 *
 * QUÉ SE PUEDE CLIQUEAR. Los informes nuevos abren su ficha. Y en cualquiera de
 * los dos, la SERIE que viene escrita dentro de la descripción del equipo
 * («LAVADORA TITAN MAX S: 509KWSB0A214») se vuelve un enlace a la ficha de esa
 * máquina, si ya está en el parque instalado. Los del Excel no tienen ficha
 * propia: son una línea de una planilla, no un documento — se muestran
 * completos acá, que es todo lo que hay de ellos.
 */

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

export default async function SoportePostventaPage() {
  const supabase = await createClient();

  const [{ data: nuevos }, { data: historicos }, { data: equipos }] = await Promise.all([
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

  const listaNuevos = (nuevos ?? []) as unknown as InformeNuevo[];
  const listaExcel = (historicos ?? []) as unknown as InformeExcel[];
  const total = listaNuevos.length + listaExcel.length;

  return (
    <SeccionPanel
      titulo="Historial de casos e incidencias"
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
                <div key={s.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-border p-3">
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
  );
}

/**
 * La descripción del equipo, con su serie convertida en enlace cuando esa
 * máquina ya está en el parque instalado.
 *
 * Cuando todavía no lo está —hoy el parque está vacío— la serie se muestra
 * igual, resaltada en monoespaciada. Sigue siendo el dato que identifica la
 * máquina; lo único que falta es adónde llevar.
 */
function Equipo({
  texto,
  fichaPorSerie,
}: {
  texto: string | null;
  fichaPorSerie: Map<string, string>;
}) {
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
            className={cn(
              "inline-flex items-center gap-0.5 font-mono font-semibold text-primary hover:underline",
            )}
          >
            <Cpu className="size-3" />
            {trozo}
          </Link>
        );
      })}
    </p>
  );
}
