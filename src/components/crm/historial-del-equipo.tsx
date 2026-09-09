import Link from "next/link";
import { AlertTriangle, FileText, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaLima } from "@/lib/fechas";
import { ETIQUETA_TIPO_ATENCION, type TipoAtencion } from "@/lib/atenciones";

/**
 * Lo que ya se le hizo a ESTA MÁQUINA. No al cliente: a la máquina.
 *
 * Carlos, 09-09, explicando qué le falta a una derivación: «cuando deriva esa
 * llamada, tiene que ir con el histórico de las incidencias de ese equipo… y
 * no solo el histórico de la llamada, porque lo vas a poder ver, sino más bien
 * los INFORMES. Porque si yo he tenido dos incidencias, han habido dos
 * informes técnicos». Su comparación: el comercial puede mirar el presupuesto
 * del año pasado antes de cotizar; postventa tiene que poder mirar el informe
 * anterior antes de mandar a alguien.
 *
 * EL CASO QUE LO HACE VALER LA PENA, con sus palabras: «a veces le mandan la
 * orden al almacén que haga puesta en marcha, pero ya no viene a ser puesta en
 * marcha porque hace un mes la hicimos… en el informe tiene que estar la
 * cantidad de ciclos ejecutada. Hoy día ya tienen mil ciclos pidiendo puesta en
 * marcha». Por eso los ciclos salen en grande cuando el informe los trae: son
 * el dato que desmiente el pedido.
 *
 * Es distinto de «Lo que ya se le hizo a este cliente», que junta TODO lo del
 * cliente: un hotel con seis lavadoras necesita las dos vistas, y la pregunta
 * «¿esta máquina ya falló antes?» solo la contesta esta.
 */
interface Hito {
  clave: string;
  fecha: string | null;
  icono: typeof Wrench;
  etiqueta: string;
  texto: string;
  ciclos?: number | null;
  href?: string;
}

export async function HistorialDelEquipo({
  equipoId,
  atencionActualId,
}: {
  equipoId: string;
  atencionActualId: string;
}) {
  const supabase = await createClient();
  const [{ data: antes }, { data: informes }] = await Promise.all([
    supabase
      .from("atenciones")
      .select("id, tipo, etapa, solicitado_at, cerrado_at, diagnostico, trabajo_realizado, ciclos, motivo_cierre")
      .eq("equipo_id", equipoId)
      .neq("id", atencionActualId)
      .order("solicitado_at", { ascending: false })
      .limit(10),
    supabase
      .from("informes_servicio")
      .select("id, correlativo, anio, tipo, ejecutado_at, asunto, detalle, ciclos, tecnico")
      .eq("equipo_id", equipoId)
      .order("ejecutado_at", { ascending: false })
      .limit(10),
  ]);

  const hitos: Hito[] = [
    ...(antes ?? []).map((x) => {
      const a = x as unknown as {
        id: string; tipo: string; etapa: string; solicitado_at: string; cerrado_at: string | null;
        diagnostico: string | null; trabajo_realizado: string | null; ciclos: number | null; motivo_cierre: string | null;
      };
      return {
        clave: `at-${a.id}`,
        fecha: a.solicitado_at,
        icono: AlertTriangle,
        etiqueta: ETIQUETA_TIPO_ATENCION[a.tipo as TipoAtencion] ?? "Atención",
        // Lo que el técnico ENCONTRÓ vale más que lo que el cliente dijo: es lo
        // que evita repetir el diagnóstico desde cero.
        texto:
          a.trabajo_realizado?.trim() ||
          a.diagnostico?.trim() ||
          a.motivo_cierre?.trim() ||
          (a.cerrado_at ? "Cerrada, sin nota" : "En curso"),
        ciclos: a.ciclos,
        href: `/postventa/atenciones/${a.id}`,
      };
    }),
    ...(informes ?? []).map((x) => {
      const i = x as unknown as {
        id: string; correlativo: number | null; anio: number | null; tipo: string | null;
        ejecutado_at: string | null; asunto: string | null; detalle: string | null; ciclos: number | null; tecnico: string | null;
      };
      return {
        clave: `inf-${i.id}`,
        fecha: i.ejecutado_at,
        icono: FileText,
        etiqueta: `Informe ${i.correlativo ? `N.º ${i.correlativo}-${i.anio ?? ""}` : "de servicio"}`,
        texto: i.asunto?.trim() || i.detalle?.trim() || i.tipo || "Informe de servicio",
        ciclos: i.ciclos,
        href: `/postventa/informes/${i.id}`,
      };
    }),
  ]
    .filter((h) => h.fecha)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  if (hitos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Es la primera vez que esta máquina entra al circuito. Lo que se anote acá va a ser el antecedente de la
        próxima llamada.
      </p>
    );
  }

  // El último conteo de ciclos que dejó alguien. Es el dato con el que se
  // discute si un pedido de «puesta en marcha» es de verdad una puesta en
  // marcha o una máquina que ya lleva meses trabajando.
  const ultimoCiclos = hitos.find((h) => h.ciclos != null);

  return (
    <div className="space-y-2">
      {ultimoCiclos && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800">
          La última lectura dice <b>{Number(ultimoCiclos.ciclos).toLocaleString("es-PE")} ciclos</b> el{" "}
          {fechaLima(ultimoCiclos.fecha!)}. Una máquina con ciclos ya trabajó: si le están pidiendo «puesta en
          marcha», conviene confirmar de qué se trata antes de mandar a alguien.
        </p>
      )}
      <ul className="space-y-1.5">
        {hitos.map((h) => {
          const Icono = h.icono;
          const fila = (
            <span className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-7 flex-none items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Icono className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-foreground">
                  {h.etiqueta}
                  <span className="ml-1.5 font-normal text-muted-foreground">{fechaLima(h.fecha!)}</span>
                  {h.ciclos != null && (
                    <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                      · {Number(h.ciclos).toLocaleString("es-PE")} ciclos
                    </span>
                  )}
                </span>
                <span className="line-clamp-2 block text-xs text-muted-foreground">{h.texto}</span>
              </span>
            </span>
          );
          return (
            <li key={h.clave} className="rounded-lg border border-border p-2.5 transition-colors hover:bg-accent">
              {h.href ? <Link href={h.href}>{fila}</Link> : fila}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
