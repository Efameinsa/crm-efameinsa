import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PantallaExistente } from "@/lib/propuesta/paginas";
import { SECCIONES, tipoDePerfil } from "@/lib/propuesta/menu";
import { VISTAS } from "@/lib/propuesta/vistas";
import { EncabezadoSeccion, PestanasConteo } from "@/components/propuesta/kit";

export const dynamic = "force-dynamic";

/**
 * Una sección de la propuesta: las pantallas que hoy están separadas con
 * nombres distintos, juntas bajo un nombre y en pestañas (menu.ts). Cada
 * pestaña es una ruta propia, así los filtros siguen funcionando.
 *
 * v2 (23-09): el encabezado dice para qué sirve la sección, cada pestaña
 * lleva cuántas hay (en rojo si alguien espera), y una pestaña puede ser una
 * vista rediseñada (`vista:<clave>`, ver vistas.tsx).
 */
export default async function SeccionPage({
  params,
  searchParams,
}: {
  params: Promise<{ seccion: string; pestana?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perfil = await requerirPerfil();
  const { seccion, pestana } = await params;
  const tipo = tipoDePerfil(perfil);
  const definicion = SECCIONES[`${tipo}/${seccion}`];
  if (!definicion) notFound();

  // Las máquinas del comercial solo existen para quien vende mantenimiento.
  const pestanas = definicion.pestanas.filter((p) => !(tipo === "comercial" && p.clave === "maquinas" && !perfil.hace_postventa));
  const actual = pestanas.find((p) => p.clave === (pestana?.[0] ?? "")) ?? pestanas[0];
  const hrefDe = (clave: string) => `/nuevo/${seccion}${clave ? `/${clave}` : ""}`;

  // Los conteos de las pestañas que son vistas nuevas, en paralelo.
  const supabase = await createClient();
  const modulos = await Promise.all(
    pestanas.map(async (p) => (p.pagina.startsWith("vista:") ? ((await VISTAS[p.pagina.slice(6)]?.()) ?? null) : null)),
  );
  const conteos = await Promise.all(modulos.map((m) => (m?.conteo ? m.conteo(supabase, perfil).catch(() => null) : Promise.resolve(null))));

  const iActual = pestanas.indexOf(actual);
  const moduloActual = modulos[iActual];
  const sp = await searchParams;

  return (
    <div className="space-y-4">
      <EncabezadoSeccion titulo={definicion.titulo} proposito={definicion.ayuda} />
      {pestanas.length > 1 && (
        <PestanasConteo
          etiqueta={`Pestañas de ${definicion.titulo}`}
          pestanas={pestanas.map((p, i) => ({
            etiqueta: p.etiqueta,
            href: hrefDe(p.clave),
            activa: p.clave === actual.clave,
            conteo: conteos[i],
            alerta: modulos[i]?.alerta,
          }))}
        />
      )}
      {actual.pagina.startsWith("vista:") ? (
        moduloActual ? (
          <moduloActual.default perfil={perfil} searchParams={{ ...sp, ...(actual.fijos ?? {}) }} base={hrefDe(actual.clave)} />
        ) : (
          <p className="text-sm text-muted-foreground">Esta vista todavía no está en la propuesta.</p>
        )
      ) : (
        <PantallaExistente clave={actual.pagina} searchParams={searchParams} fijos={actual.fijos} />
      )}
    </div>
  );
}
