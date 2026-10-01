import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { hoyLima } from "@/lib/periodo";
import type { ServicioPostventa } from "@/lib/postventa";
import { cargarPedidosPendientes, libroPendientes } from "@/lib/reporte-pendientes";

export const dynamic = "force-dynamic";

/**
 * El reporte de los pendientes en Excel (Lesly, 30-09). La misma consulta que
 * /postventa/control; el libro lo arma `libroPendientes`. `?de=almacen` pone
 * primero la hoja del almacén y le da su nombre al archivo.
 */
export async function GET(request: Request) {
  await requerirPerfil();
  const supabase = await createClient();
  const deAlmacen = new URL(request.url).searchParams.get("de") === "almacen";

  const { data, error } = await cargarPedidosPendientes(supabase);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hoy = hoyLima();
  const buffer = libroPendientes((data ?? []) as unknown as ServicioPostventa[], hoy, deAlmacen);
  const nombre = `${deAlmacen ? "Pendientes del almacen" : "Pendientes de pedidos"} ${hoy}`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": cabeceraArchivo(nombre, "xlsx"),
      "Cache-Control": "no-store",
    },
  });
}
