import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { sumarDias } from "@/lib/calendario";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { colaDelDia } from "@/lib/propuesta/cola-del-dia";
import { agruparTareas, hechosDelAlmacen, indicadoresDelAlmacen, resumenDeHechos } from "@/lib/almacen-dia";
import { ETIQUETA_TIPO_APERTURA, type TipoApertura } from "@/lib/aperturas-llamada";
import { ReporteAlmacenPdf } from "@/lib/pdf/reporte-almacen-pdf";
import type { Perfil } from "@/types/database";

/**
 * EL REPORTE DEL DÍA DEL ALMACÉN (Santos, 21-10): el mismo botón de cierre
 * que tienen postventa y comercial, con lo propio del área. Se graba en
 * `reportes_diarios` a nombre de quien lo genera, así gerencia ve en «Cierre
 * del día» si el almacén cerró, igual que los demás.
 *
 * `/api/reportes/diario` manda acá cuando la cuenta es de almacén (gerencia
 * abre los reportes desde esa ruta).
 */
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const fechaParam = url.searchParams.get("fecha");
  const hoy = hoyLima();
  const fecha = fechaParam && RE_FECHA.test(fechaParam) ? fechaParam : hoy;
  // A nombre de quién se graba: el que lo pide, o la cuenta que gerencia está mirando.
  const comercialId = url.searchParams.get("comercial") ?? user.id;

  const [{ data: yo }, { data: dueno }] = await Promise.all([
    supabase.from("perfiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("perfiles").select("id, nombre, codigo_comercial").eq("id", comercialId).maybeSingle(),
  ]);
  const perfil = yo as Perfil | null;
  const puede = perfil && (perfil.es_almacen || perfil.es_operaciones || ["gerencia", "admin", "operaciones"].includes(perfil.rol));
  if (!perfil || !puede) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!dueno) return NextResponse.json({ error: "Esa cuenta no existe" }, { status: 404 });

  // El pendiente es el de HOY (la cola del día no tiene memoria); lo hecho sí es del día pedido.
  const [cola, hechos, { data: despachosManana }, { data: llamadasManana }] = await Promise.all([
    colaDelDia(supabase, perfil, "almacen"),
    hechosDelAlmacen(supabase, fecha),
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, apertura_despacho_at, almacen_listo_at")
      .eq("fecha_despacho", sumarDias(fecha, 1))
      .is("despachado_at", null)
      .is("cerrado_at", null)
      .limit(50),
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, programada_para, cuentas(razon_social)")
      .is("anulada_at", null)
      .is("informe_at", null)
      .gte("programada_para", `${sumarDias(fecha, 1)}T00:00:00-05:00`)
      .lt("programada_para", `${sumarDias(fecha, 2)}T00:00:00-05:00`)
      .order("programada_para")
      .limit(50),
  ]);

  const manana = {
    fecha: fechaCalendarioLarga(sumarDias(fecha, 1)),
    despachos: ((despachosManana ?? []) as { cliente_texto: string | null; equipo: string | null; apertura_despacho_at: string | null; almacen_listo_at: string | null }[]).map((s) => ({
      cliente: sinRuc(s.cliente_texto),
      equipo: (s.equipo ?? "").split("\n")[0].trim(),
      estado: !s.apertura_despacho_at ? "Sin apertura" : s.almacen_listo_at ? "Listo" : "Falta confirmar listo",
    })),
    pruebasEnCola: cola.tareas.filter((t) => t.id.startsWith("pr-")).length,
    llamadas: ((llamadasManana ?? []) as unknown as { tipo: TipoApertura; programada_para: string; cuentas: { razon_social: string } | null }[]).map((a) => ({
      cliente: sinRuc(a.cuentas?.razon_social),
      tipo: ETIQUETA_TIPO_APERTURA[a.tipo] ?? a.tipo,
      hora: new Date(a.programada_para).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" }),
    })),
  };

  const grupos = agruparTareas(cola.tareas).map((g) => ({ clave: g.clave, titulo: g.titulo, tareas: g.tareas }));
  const indicadores = indicadoresDelAlmacen(cola.tareas);
  const resumen = resumenDeHechos(hechos);
  const fechaLarga = fechaCalendarioLarga(fecha);

  const buffer = await renderToBuffer(
    <ReporteAlmacenPdf
      logoBuffer={LOGO_BUFFER}
      fecha={fechaLarga}
      fechaCorta={fecha}
      quien={{ nombre: dueno.nombre as string, codigo: (dueno.codigo_comercial as string | null) ?? "Almacén" }}
      indicadores={indicadores}
      resumen={resumen}
      hechos={hechos}
      grupos={grupos}
      manana={manana}
    />,
  );

  // Queda grabado como el de los demás (0100): la última generación del día es
  // la que vale; un día pasado ya grabado no se pisa.
  try {
    let yaGrabado = false;
    if (fecha < hoy) {
      const { data: previo } = await supabase.from("reportes_diarios").select("id").eq("comercial_id", comercialId).eq("fecha", fecha).maybeSingle();
      yaGrabado = Boolean(previo);
    }
    if (!yaGrabado) {
      await supabase.rpc("guardar_reporte_diario", {
        p_comercial: comercialId,
        p_fecha: fecha,
        p_contenido: { area: "almacen", fecha_larga: fechaLarga, indicadores, resumen, hechos, pendientes: grupos.map((g) => ({ titulo: g.titulo, tareas: g.tareas.map((t) => ({ cliente: t.cliente, que: t.que, porque: t.porque, urgencia: t.urgencia })) })), manana },
      });
    }
  } catch {
    // Sin registro, pero con reporte.
  }

  const nombre = `Reporte almacén ${fecha}.pdf`;
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": cabeceraArchivo(nombre), "Cache-Control": "no-store" },
  });
}
