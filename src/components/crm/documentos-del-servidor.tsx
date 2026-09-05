import { ExternalLink, FolderOpen, Image as ImagenIcono, FileText, Link2, Unlink } from "lucide-react";
import { MarcaServidor } from "@/components/crm/marca-servidor";
import { createClient } from "@/lib/supabase/server";
import { enlaceCarpetaFirmado, servidorDeArchivosActivo } from "@/lib/archivos-servidor";
import { vincularCarpetaServidor } from "@/lib/acciones/cuentas";

/**
 * «Documentos del servidor»: los informes y las fotos de este cliente, tal
 * como viven en el servidor de la oficina — a un clic desde la ficha.
 *
 * Plan 24, fase 1. El CRM es https y el servicio del servidor es http: el
 * navegador no deja LEER datos entre los dos, pero sí NAVEGAR — por eso todo
 * se abre en pestaña nueva (la carpeta-página del servicio, con la marca y su
 * buscador). Nada se incrusta hasta que Sistemas ponga el certificado.
 *
 * Si el cliente todavía no está vinculado con su carpeta, se sugieren las
 * más parecidas del índice (0135) — comparando también contra el nombre
 * comercial: la lección COINREFRI es que la carpeta puede llamarse como el
 * nombre de fantasía, no como la razón social.
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
}: {
  cuentaId: string;
  razonSocial: string;
  nombreComercial?: string | null;
  /** `cuentas.carpetas_servidor`, tal cual viene de la ficha. */
  carpetas: Record<string, string> | null;
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

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          Documentos del servidor <MarcaServidor />
        </h2>
        <span className="text-[11px] text-muted-foreground">archivo de la empresa</span>
      </div>

      <div className="space-y-2">
        {CLASES.map(({ clave, etiqueta, icono: Icono }) => {
          const ruta = vinculadas[clave];
          if (ruta) {
            const enlace = enlaceCarpetaFirmado(ruta);
            return (
              <div key={clave} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                <Icono className="size-4 flex-none text-muted-foreground" />
                <div className="min-w-[160px] flex-1">
                  <p className="text-sm font-medium text-foreground">{etiqueta}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{ruta}</p>
                </div>
                {enlace && (
                  <a
                    href={enlace}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
                  >
                    <FolderOpen className="size-3.5" /> Abrir carpeta <ExternalLink className="size-3" />
                  </a>
                )}
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
        Se abren en una pestaña nueva con un enlace que vence a los cinco minutos. Funcionan desde la oficina y
        desde fuera, siempre con la sesión del CRM.
      </p>
    </section>
  );
}
