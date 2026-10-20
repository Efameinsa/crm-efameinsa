import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { duracionLegible, fechaLima, numeroParaMostrar } from "@/lib/llamadas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Fila = {
  user_id: string;
  numero: string;
  iniciada_at: string;
  duracion_s: number;
  contestada: boolean;
  origen: string;
  estado_audio: string;
  ruta_audio: string | null;
  resumen: string | null;
  ia: { proxima_accion?: string | null } | null;
  cuentas: { razon_social: string | null; nombre_comercial: string | null; num_doc: string | null } | null;
  contactos: { nombre: string } | null;
};

/**
 * EXPORTAR LAS LLAMADAS DE UN DÍA A EXCEL (Santos, 19-10-2026). Con la sesión de
 * quien pide: la RLS de `llamadas` decide qué ve (gerencia y admin, todas).
 * `?dia=AAAA-MM-DD` (por defecto, hoy en Lima) y, opcional, `&comercial=<uuid>`.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const url = new URL(request.url);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("dia") ?? "") ? (url.searchParams.get("dia") as string) : fechaLima(new Date()).fecha;
  const comercial = url.searchParams.get("comercial") ?? "";
  const desde = new Date(`${dia}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 86_400_000);

  let consulta = supabase
    .from("llamadas")
    .select("user_id, numero, iniciada_at, duracion_s, contestada, origen, estado_audio, ruta_audio, resumen, ia, cuentas(razon_social, nombre_comercial, num_doc), contactos(nombre)")
    .gte("iniciada_at", desde.toISOString())
    .lt("iniciada_at", hasta.toISOString())
    .order("iniciada_at")
    .limit(5000);
  if (/^[0-9a-f-]{36}$/i.test(comercial)) consulta = consulta.eq("user_id", comercial);
  const { data } = await consulta;
  const filas = (data ?? []) as unknown as Fila[];

  const ids = [...new Set(filas.map((f) => f.user_id))];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre, codigo_comercial").in("id", ids) : { data: [] };
  const nombre = new Map(((gente ?? []) as { id: string; nombre: string; codigo_comercial: string | null }[]).map((g) => [g.id, `${g.codigo_comercial ? `${g.codigo_comercial} · ` : ""}${g.nombre}`]));

  const hoja = XLSX.utils.json_to_sheet(
    filas.map((f) => ({
      Hora: fechaLima(f.iniciada_at).horaPantalla,
      Comercial: nombre.get(f.user_id) ?? "",
      Cliente: f.cuentas?.razon_social || f.cuentas?.nombre_comercial || "Sin ficha",
      "RUC/DNI": f.cuentas?.num_doc ?? "",
      Contacto: f.contactos?.nombre ?? "",
      Número: numeroParaMostrar(f.numero),
      Contestó: f.contestada ? "Sí" : "No",
      Duración: f.contestada ? duracionLegible(f.duracion_s) : "",
      Origen: f.origen === "app" ? "App" : "Navegador",
      Audio: f.estado_audio === "subido" ? "Sí" : "No",
      "Archivo en el servidor": f.ruta_audio ?? "",
      Resumen: f.resumen ?? "",
      "Próxima acción": f.ia?.proxima_accion ?? "",
    })),
  );
  hoja["!cols"] = [8, 24, 36, 14, 22, 14, 9, 12, 10, 7, 60, 70, 40].map((wch) => ({ wch }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Llamadas");
  const bytes = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="Llamadas-${dia}.xlsx"`,
      "cache-control": "private, no-store",
    },
  });
}
