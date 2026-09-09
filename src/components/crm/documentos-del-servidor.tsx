import { Image as ImagenIcono, FileText, Link2, Unlink } from "lucide-react";
import { MarcaServidor } from "@/components/crm/marca-servidor";
import { SeccionPlegable } from "@/components/crm/seccion-panel";
import { VisorArchivos } from "@/components/crm/visor-archivos";
import { createClient } from "@/lib/supabase/server";
import { servidorDeArchivosActivo } from "@/lib/archivos-servidor";
import { vincularCarpetaServidor } from "@/lib/acciones/cuentas";

/**
 * «Documentos del servidor»: los informes y las fotos de este cliente, tal
 * como viven en el servidor de la oficina — a un clic desde la ficha.
 *
 * Plan 24, fase 1. Todo se abre en pestaña nueva: la carpeta-página del
 * servicio, con la marca y su buscador.
 *
 * Si el cliente todavía no está vinculado con su carpeta, se sugieren las
 * más parecidas del índice (0135) — comparando también contra el nombre
 * comercial: la lección COINREFRI es que la carpeta puede llamarse como el
 * nombre de fantasía, no como la razón social.
 *
 * DÓNDE SE VE (Santos, 07-09): en TODAS las pantallas donde el comercial
 * trabaja al cliente, no solo en «Mi cartera». Las fotos y los informes son
 * del CLIENTE, no de una oportunidad: quien está por llamar mira la foto de
 * la instalación antes de marcar, y desde «Mi día» se entra a la oportunidad,
 * no a la ficha. Es la misma lección del C5 del plan 11 —«si voy a ver ficha
 * completa, ni siquiera está completa, porque son menos cosas»—, que se
 * resolvió montando la sección en las dos pantallas en vez de copiarla: acá
 * `plegable` elige el envoltorio y el contenido es uno solo.
 */

const CLASES = [
  { clave: "informes" as const, etiqueta: "Informes técnicos", icono: FileText },
  { clave: "fotos" as const, etiqueta: "Fotos del cliente", icono: ImagenIcono },
];

/** Palabras con peso para comparar nombres (sin tildes, sin siglas de forma societaria). */
function palabrasDe(texto: string): string[] {
  return texto
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9Ñ ]+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !["SA", "SAC", "SRL", "EIRL", "SCRL", "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y"].includes(p));
}

function parecido(carpeta: string, objetivo: string[][]): number {
  const c = new Set(palabrasDe(carpeta));
  if (c.size === 0) return 0;
  let mejor = 0;
  for (const palabras of objetivo) {
    if (palabras.length === 0) continue;
    const comunes = palabras.filter((p) => c.has(p)).length;
    mejor = Math.max(mejor, comunes / Math.max(c.size, palabras.length));
  }
  return mejor;
}

export async function DocumentosDelServidor({
  cuentaId,
  razonSocial,
  nombreComercial,
  carpetas,
  plegable = false,
}: {
  cuentaId: string;
  razonSocial: string;
  nombreComercial?: string | null;
  /** `cuentas.carpetas_servidor`, tal cual viene de la ficha. */
  carpetas: Record<string, string> | null;
  /** `true` en las pantallas que ya hablan de otra cosa (la oportunidad): el
   *  mismo contenido, plegado y sin encabezado propio. */
  plegable?: boolean;
}) {
  // Sin servidor configurado no se anuncia lo que no existe.
  if (!servidorDeArchivosActivo()) return null;

  const vinculadas = carpetas ?? {};
  const faltantes = CLASES.filter((c) => !vinculadas[c.clave]);

  // Las sugerencias solo se buscan si falta algún vínculo. Y se buscan POR
  // PALABRA, no trayendo el índice entero: son 2.422 carpetas y Supabase
  // corta en 1.000 filas SIN AVISAR — el mismo corte que ya rompió Mi
  // cartera, los reportes y la agenda. Encontrado acá el 31-08: COINREFRI
  // quedaba después del corte y el panel no la sugería.
  const sugerencias: Record<string, { ruta: string; nombre: string; puntaje: number }[]> = {};
  if (faltantes.length > 0) {
    const supabase = await createClient();
    const objetivo = [palabrasDe(razonSocial), ...(nombreComercial ? [palabrasDe(nombreComercial)] : [])];
    const palabrasClave = [...new Set(objetivo.flat())].slice(0, 8);
    const { data } = palabrasClave.length
      ? await supabase
          .from("carpetas_servidor")
          .select("ruta, nombre, clase")
          .in("clase", faltantes.map((c) => c.clave))
          .or(palabrasClave.map((p) => `nombre.ilike.%${p}%`).join(","))
          .limit(200)
      : { data: [] };
    for (const c of faltantes) {
      sugerencias[c.clave] = ((data ?? []) as { ruta: string; nombre: string; clase: string }[])
        .filter((f) => f.clase === c.clave)
        .map((f) => ({ ruta: f.ruta, nombre: f.nombre, puntaje: parecido(f.nombre, objetivo) }))
        .filter((f) => f.puntaje > 0.3)
        .sort((a, b) => b.puntaje - a.puntaje)
        .slice(0, 3);
    }
  }

  const cuerpo = (
    <>
      <div className="space-y-2">
        {CLASES.map(({ clave, etiqueta, icono: Icono }) => {
          const ruta = vinculadas[clave];
          if (ruta) {
            return (
              <div key={clave} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icono className="size-5" />
                </span>
                <div className="min-w-[140px] flex-1">
                  <p className="text-sm font-semibold text-foreground">{etiqueta}</p>
                  <p className="text-[11px] text-muted-foreground">Se abren aquí, dentro del CRM</p>
                </div>
                <VisorArchivos
                  cuentaId={cuentaId}
                  clase={clave}
                  titulo={`${etiqueta} · ${razonSocial}`}
                  etiquetaBoton={clave === "fotos" ? "Ver fotos" : "Ver informes"}
                />
                <form
                  action={async () => {
                    "use server";
                    await vincularCarpetaServidor({ cuentaId, clase: clave, ruta: null });
                  }}
                >
                  <button
                    type="submit"
                    title="Quitar el vínculo"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Unlink className="size-3" /> Cambiar
                  </button>
                </form>
              </div>
            );
          }

          const opciones = sugerencias[clave] ?? [];
          return (
            <div key={clave} className="rounded-lg border border-dashed border-border p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icono className="size-4 text-muted-foreground" /> {etiqueta}
                <span className="text-[11px] font-normal text-muted-foreground">— sin carpeta vinculada</span>
              </p>
              {opciones.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Ninguna carpeta del servidor se parece a este cliente. Si la carpeta existe con otro nombre, avise
                  para vincularla a mano; si es nueva, hay que refrescar el índice.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">¿Es alguna de estas?</p>
                  {opciones.map((o) => (
                    <form
                      key={o.ruta}
                      action={async () => {
                        "use server";
                        await vincularCarpetaServidor({ cuentaId, clase: clave, ruta: o.ruta });
                      }}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="min-w-[160px] flex-1 truncate font-mono text-xs text-foreground">{o.nombre}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        parecido {Math.round(o.puntaje * 100)} %
                      </span>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
                      >
                        <Link2 className="size-3" /> Vincular
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Las fotos y los informes se abren aquí mismo, dentro del CRM y de la aplicación, sin abrir otra ventana. Los
        trae el servidor de la empresa al instante.
      </p>
    </>
  );

  if (plegable) {
    return (
      <SeccionPlegable titulo="Documentos del servidor" cantidad={Object.keys(vinculadas).length || undefined}>
        {cuerpo}
      </SeccionPlegable>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          Documentos del servidor <MarcaServidor />
        </h2>
        <span className="text-[11px] text-muted-foreground">archivo de la empresa</span>
      </div>
      {cuerpo}
    </section>
  );
}
