import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { PantallaExistente } from "@/lib/propuesta/paginas";
import { SECCIONES, tipoDePerfil } from "@/lib/propuesta/menu";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Una sección de la propuesta: las pantallas que hoy están separadas con
 * nombres distintos, juntas bajo un nombre y en pestañas (menu.ts). Cada
 * pestaña es una ruta propia, así los filtros de cada pantalla siguen
 * funcionando igual que en su lugar de siempre.
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{definicion.titulo}</h1>
        <p className="text-sm text-muted-foreground">{definicion.ayuda}</p>
      </div>
      {pestanas.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={`Pestañas de ${definicion.titulo}`}>
          {pestanas.map((p) => {
            const activa = p.clave === actual.clave;
            return (
              <Link
                key={p.clave || "inicio"}
                href={`/nuevo/${seccion}${p.clave ? `/${p.clave}` : ""}`}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  activa ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {p.etiqueta}
              </Link>
            );
          })}
        </nav>
      )}
      <PantallaExistente clave={actual.pagina} searchParams={searchParams} fijos={actual.fijos} />
    </div>
  );
}
