import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { lunesSemana } from "@/lib/potenciales-semana";
import { cargarCierreSemanal } from "@/lib/cierre-semanal";
import { renderizarCierreSemanal } from "@/lib/pdf/cierre-semanal-render";

/**
 * PDF del cierre de la semana (ing. Carlos, 27-08): lo proyectado contra lo
 * vendido, día por día, con lo que quedó pendiente.
 *
 * Cada quien baja el suyo. Gerencia puede pedir el de otro pasando ?comercial,
 * igual que en el reporte diario — y como allá, quien no sea backoffice solo
 * puede pedir el propio: las consultas van con la sesión del usuario, así que
 * RLS ya filtra, pero se corta acá para no devolver un PDF vacío que parezca
 * una semana sin trabajo.
 *
 * EL CIERRE HECHO SE SIRVE TAL COMO SE GUARDÓ (0229). Carlos, 12-09: «este
 * cierre debe guardarse como histórico». Si esa semana ya se cerró y el PDF
 * quedó congelado, se devuelve ese archivo —lo que gerencia leyó ese sábado—
 * y no uno recalculado con la proyección de hoy. Con ?vivo=1 se fuerza el
 * recálculo (para la semana en curso siempre es en vivo, porque todavía se
 * está trabajando).
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const semanaParam = url.searchParams.get("semana");
  const lunes = lunesSemana(semanaParam && RE_FECHA.test(semanaParam) ? semanaParam : undefined);
  const pedido = url.searchParams.get("comercial");

  if (pedido && pedido !== user.id) {
    const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (!perfil || !["gerencia", "admin", "central"].includes(String(perfil.rol))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }
  const comercialId = pedido ?? user.id;

  const cabeceras = (nombre: string) => ({
    "Content-Type": "application/pdf",
    "Content-Disposition": cabeceraArchivo(nombre),
    "Cache-Control": "no-store",
  });

  // El congelado, si lo hay y no es la semana en curso. Se lee con la sesión
  // del usuario (RLS decide si esa declaración es suya o si es gerencia) y el
  // archivo se baja con la llave de servicio, que es la que lo guardó.
  if (lunes !== lunesSemana() && url.searchParams.get("vivo") !== "1") {
    const { data: guardado } = await supabase
      .from("declaraciones_semana")
      .select("pdf_path")
      .eq("comercial_id", comercialId)
      .eq("lunes", lunes)
      .maybeSingle();
    if (guardado?.pdf_path) {
      const { data: archivo } = await createAdminClient().storage.from("adjuntos").download(guardado.pdf_path);
      if (archivo) {
        const { data: quien } = await supabase.from("perfiles").select("codigo_comercial").eq("id", comercialId).maybeSingle();
        const nombre = `Cierre semanal ${quien?.codigo_comercial ?? ""} ${lunes}`.replace(/\s+/g, " ").trim();
        return new NextResponse(archivo, { headers: cabeceras(nombre) });
      }
    }
  }

  const cierre = await cargarCierreSemanal(lunes, comercialId);
  const buffer = await renderizarCierreSemanal(cierre, lunes);
  const nombre = `Cierre semanal ${cierre.comercial.codigo ?? ""} ${lunes}`.replace(/\s+/g, " ").trim();
  return new NextResponse(buffer as unknown as BodyInit, { headers: cabeceras(nombre) });
}
