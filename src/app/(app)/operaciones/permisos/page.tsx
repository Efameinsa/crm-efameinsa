import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { PermisoMantenimiento } from "@/components/crm/permiso-mantenimiento";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

/**
 * Los permisos que se dan y se quitan (reunión con gerencia del 28-08).
 *
 * El caso concreto: los comerciales también cotizan mantenimiento, pero muy de
 * vez en cuando —«en agosto, ¿cuántas cotizaciones de mantenimiento hizo
 * Katerine? Ninguna. ¿Brenda? Dos, tres»—. Dejarles el área abierta todo el año
 * para eso no tiene sentido, y negársela tampoco. La solución que Carlos actuó
 * en la reunión es esta: se pide, se abre, se cotiza, se cierra.
 *
 * LA PANTALLA ESTÁ ESCRITA PARA CERRAR, no para abrir. Abrir siempre lo va a
 * pedir alguien; cerrar no lo pide nadie, y un permiso que nadie recuerda haber
 * dado no se revoca nunca. Por eso arriba están los que están abiertos, con
 * desde cuándo, y el botón de esa fila dice «Cerrar».
 */

interface Fila {
  id: string;
  nombre: string;
  codigo_comercial: string | null;
  hace_postventa: boolean | null;
  mantenimiento_desde: string | null;
}

export default async function PermisosPage() {
  const perfil = await requerirPerfil();
  if (!(perfil.rol === "operaciones" || perfil.rol === "gerencia" || perfil.rol === "admin")) {
    redirect("/comercial");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, hace_postventa, mantenimiento_desde")
    .eq("rol", "comercial")
    .eq("activo", true)
    .eq("es_prueba", false)
    .order("codigo_comercial");

  const filas = (data ?? []) as Fila[];
  const abiertos = filas.filter((f) => f.hace_postventa);
  const cerrados = filas.filter((f) => !f.hace_postventa);

  return (
    <div className="space-y-4">
      <SeccionPanel
        titulo="Cotizar mantenimiento"
        accion={
          <span className="text-xs text-muted-foreground">
            {abiertos.length === 0 ? "ninguno abierto" : `${abiertos.length} abierto${abiertos.length === 1 ? "" : "s"}`}
          </span>
        }
      >
        <p className="mb-3 max-w-prose text-sm leading-snug text-muted-foreground">
          Un comercial cotiza mantenimiento cada tanto —dos o tres al mes entre todos—. Se le abre la vista cuando lo
          pide y <strong className="text-foreground">se le cierra cuando termina</strong>: mientras está abierta ve las
          cotizaciones de mantenimiento del área.
        </p>

        {abiertos.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Abiertos ahora</p>
            {abiertos.map((f) => (
              <article
                key={f.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3"
              >
                <span className="min-w-[180px] flex-1">
                  <span className="text-sm font-semibold text-foreground">{f.nombre}</span>
                  {f.codigo_comercial && (
                    <span className="ml-2 font-mono text-[11px] text-muted-foreground">{f.codigo_comercial}</span>
                  )}
                  <span className="block text-[11px] text-muted-foreground">
                    {f.mantenimiento_desde
                      ? `abierto desde el ${fechaHoraLima(f.mantenimiento_desde)}`
                      : "abierto desde antes de que esto se registrara"}
                  </span>
                </span>
                <PermisoMantenimiento comercialId={f.id} nombre={f.nombre} abierto />
              </article>
            ))}
          </div>
        )}

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <Wrench className="mr-1 inline size-3" />
          Los demás comerciales
        </p>
        <div className="space-y-1.5">
          {cerrados.map((f) => (
            <article
              key={f.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border p-2.5"
            >
              <span className="min-w-[180px] flex-1 text-sm text-foreground">
                {f.nombre}
                {f.codigo_comercial && (
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{f.codigo_comercial}</span>
                )}
              </span>
              <PermisoMantenimiento comercialId={f.id} nombre={f.nombre} abierto={false} />
            </article>
          ))}
        </div>
      </SeccionPanel>
    </div>
  );
}
