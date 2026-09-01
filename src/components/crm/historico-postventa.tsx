import Link from "next/link";
import { Camera, ChevronRight, Cpu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { seriesDeTexto, etiquetaTipoServicio } from "@/lib/postventa";

/**
 * El archivo del área: los informes del sistema y lo que vino del Excel.
 *
 * Extraído tal cual de «Historial de atenciones» en `/postventa/casos`
 * (regla del repo: no copiar, compartir) — el plan 23 lo reubica en la
 * pestaña «Histórico» de Atenciones, junto con los despachos del Excel
 * (que se muestran aparte, con `ColaDespachos` en modo `historico`).
 */

interface InformeNuevo {
  id: string;
  correlativo: number | null;
  anio: number;
  es_prueba?: boolean | null;
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

export async function HistoricoPostventa() {
  const supabase = await createClient();

  const [{ data: nuevos }, { data: historicos }, { data: equipos }] = await Promise.all([
    supabase
      .from("informes_servicio")
      .select(
        "id, correlativo, anio, es_prueba, tipo, modalidad, ejecutado_at, tecnico, detalle, observaciones, ciclos, cliente_texto, equipo_texto, fotos, cuentas(razon_social)",
      )
      .order("ejecutado_at", { ascending: false })
      .limit(200),
    supabase
      .from("soporte_tecnico")
      .select("id, cliente_texto, equipo, detalle, fecha_ejecutado, fecha_envio")
      .order("fecha_ejecutado", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from("equipos_instalados").select("id, serie"),
  ]);

  const fichaPorSerie = new Map((equipos ?? []).map((e) => [String(e.serie).toUpperCase(), e.id as string]));
  const listaNuevos = (nuevos ?? []) as unknown as InformeNuevo[];
  const listaExcel = (historicos ?? []) as unknown as InformeExcel[];
  const total = listaNuevos.length + listaExcel.length;

  if (total === 0) {
    return (
      <p className="max-w-prose text-sm text-muted-foreground">
        Sin informes cargados. Acá van a aparecer las puestas en marcha, las garantías, los mantenimientos y las
        verificaciones de preinstalación, con sus fotos y su lectura de ciclos.
      </p>
    );
  }

  return (
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
                      N.º {i.es_prueba ? "PRUEBA " : ""}{String(i.correlativo).padStart(3, "0")}-{i.anio}
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
                {s.fecha_envio && <p className="font-mono tabular-nums">enviado {fechaCalendario(s.fecha_envio)}</p>}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * La descripción del equipo, con su serie convertida en enlace cuando esa
 * máquina ya está en el parque instalado.
 */
function Equipo({ texto, fichaPorSerie }: { texto: string | null; fichaPorSerie: Map<string, string> }) {
  if (!texto) return null;
  const series = seriesDeTexto(texto);
  if (series.length === 0) {
    return <p className="break-words text-xs leading-snug text-muted-foreground">{texto}</p>;
  }

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
