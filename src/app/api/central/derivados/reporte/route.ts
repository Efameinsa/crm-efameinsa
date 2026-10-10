import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { resolverPeriodo } from "@/lib/periodo";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import {
  cargarDerivados,
  comercialDelFiltro,
  COMERCIAL_POSTVENTA,
  ETIQUETA_CANAL,
  ETIQUETA_FOCO,
  type FocoDerivado,
} from "@/lib/derivados-central";
import { libroDerivados } from "@/lib/reporte-derivados";

export const dynamic = "force-dynamic";

/**
 * «Lo que derivé» en Excel, con los mismos filtros de la pantalla (Central,
 * 10-10: las derivaciones del mes a postventa sin atender, para gerencia). La
 * consulta es la misma de /central/derivados y la protege el mismo RLS.
 */
export async function GET(request: Request) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const p = Object.fromEntries(new URL(request.url).searchParams);
  const periodo = resolverPeriodo(p, "semana");
  const { hasta: sinPinHasta } = await permisoSinPin();
  const modoEnsayo = sinPinHasta !== null;

  const { data: comerciales } = await supabase
    .from("perfiles")
    .select("id, nombre, codigo_comercial, es_prueba")
    .eq("rol", "comercial");

  let derivados;
  try {
    derivados = await cargarDerivados(supabase, {
      desde: periodo.desde,
      hasta: periodo.hasta,
      comercial: comercialDelFiltro(p.comercial, comerciales ?? [], modoEnsayo),
      registradoPor: p.registro ?? null,
      canal: p.canal ?? null,
      evidencia: p.evidencia ?? null,
      busqueda: (p.q ?? "").trim(),
      incluirPractica: modoEnsayo,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const foco = p.foco ?? null;
  const filas =
    foco === "atencion"
      ? derivados.filter((d) => d.alerta !== null)
      : foco
        ? derivados.filter((d) => d.foco === foco)
        : derivados;

  const elegido = (comerciales ?? []).find((c) => c.id === p.comercial);
  const nombreComercial =
    p.comercial === COMERCIAL_POSTVENTA
      ? "Toda postventa (PV, PV1, PV2…)"
      : elegido
        ? `${elegido.codigo_comercial ? `${elegido.codigo_comercial} · ` : ""}${elegido.nombre}`
        : null;
  const nombreFoco =
    foco === "atencion" ? "Requieren atención" : foco ? (ETIQUETA_FOCO[foco as FocoDerivado] ?? foco) : null;

  const otros: string[] = [];
  if (p.registro) otros.push(`Registrado por: ${p.registro === "sin_perfil" ? "formulario web" : ((await supabase.from("perfiles").select("nombre").eq("id", p.registro).maybeSingle()).data?.nombre ?? p.registro)}`);
  if (p.canal) otros.push(`Canal: ${ETIQUETA_CANAL[p.canal] ?? p.canal}`);
  if (p.evidencia === "sin") otros.push("Solo sin evidencia");
  if (p.q) otros.push(`Búsqueda: ${p.q}`);

  const buffer = libroDerivados(filas, {
    desde: periodo.desde,
    hasta: periodo.hasta,
    comercial: nombreComercial,
    foco: nombreFoco,
    otros,
    generadoPor: perfil.nombre,
  });

  const quien = p.comercial === COMERCIAL_POSTVENTA ? "postventa" : (elegido?.codigo_comercial ?? elegido?.nombre ?? "todos");
  const nombre = `Derivados ${quien}${nombreFoco ? ` ${nombreFoco.toLowerCase()}` : ""} ${periodo.desde} al ${periodo.hasta}`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": cabeceraArchivo(nombre, "xlsx"),
      "Cache-Control": "no-store",
    },
  });
}
