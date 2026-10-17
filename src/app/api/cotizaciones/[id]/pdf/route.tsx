import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarPdfCotizacion, SELECT_PDF_COTIZACION, type CotizacionGuardada } from "@/lib/pdf/pdf-cotizacion-servidor";
import { puedeVerPrecios } from "@/lib/postventa";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?version=1 abre una versión ARCHIVADA de una cotización corregida (0123).
  // Sin el parámetro, la vigente: la final, que es lo que se manda.
  const pedida = Number(new URL(request.url).searchParams.get("version") ?? "");
  // ?descargar=1 lo baja como archivo en vez de abrirlo en el visor (Moisés, 16-10).
  const descargar = new URL(request.url).searchParams.get("descargar") === "1";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // POSTVENTA VE TODAS LAS COTIZACIONES DEL CLIENTE, CON LOS NÚMEROS TAPADOS
  // (gerencia, 28-09: «postventa tiene que ver todo y estarían borraditos los
  // números… en los PDFs»). La RLS solo le abre las de sus expedientes; las del
  // comercial se leen con la llave del servidor, y SIEMPRE salen sin cifras.
  const { data: perfil } = await supabase.from("perfiles").select("rol, es_postventa, hace_postventa").eq("id", user.id).maybeSingle();
  const sinMontos = Boolean(perfil && !puedeVerPrecios(perfil));
  const esAreaPostventa = Boolean(perfil?.es_postventa || perfil?.hace_postventa);

  const consulta = (cliente: typeof supabase) =>
    cliente
      .from("cotizaciones")
      .select(SELECT_PDF_COTIZACION)
      .eq("id", id)
      .maybeSingle();
  let { data: cotizacion, error } = await consulta(supabase);
  let lectura = supabase;
  if (!cotizacion && !error && esAreaPostventa) {
    lectura = createAdminClient() as unknown as typeof supabase;
    ({ data: cotizacion, error } = await consulta(lectura));
  }
  // Una cotización de otro que se leyó con la llave del servidor va sin cifras,
  // aunque quien la pide sea un comercial que hace postventa.
  // Lo que cotiza postventa en SUS expedientes sale completo, con precio
  // unitario y total (Santos, 28-09): se tapa solo lo que vendió un comercial.
  const { data: expediente } = cotizacion
    ? await lectura.from("oportunidades").select("tipo_postventa").eq("id", (cotizacion as { oportunidad_id: string }).oportunidad_id).maybeSingle()
    : { data: null };
  const dePostventa = expediente?.tipo_postventa != null;
  const taparCifras = !dePostventa && (sinMontos || lectura !== supabase);

  // Un fallo de la consulta NO es «no encontrada». El 05-09 la migración 0179
  // agregó una segunda relación entre cotizaciones y oportunidades, PostgREST
  // dejó de saber por cuál embeber, y este endpoint respondió «Cotización no
  // encontrada» a TODAS las descargas: la cotización de Brenda estaba en la
  // base y nadie podía explicar el 404. El error de la consulta se dice y se
  // registra; el 404 queda para lo que de verdad no existe o no le toca ver.
  if (error) {
    console.error(`[cotizacion ${id}] la consulta falló:`, error);
    return NextResponse.json({ error: "No se pudo leer la cotización", detalle: error.message }, { status: 500 });
  }
  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const hecho = await generarPdfCotizacion(lectura, cotizacion as unknown as CotizacionGuardada, id, { pedida, sinMontos: taparCifras, postventa: dePostventa });
  if ("error" in hecho) return NextResponse.json({ error: hecho.error }, { status: hecho.status });
  const { pdf: limpio, nombre } = hecho;

  return new NextResponse(new Uint8Array(limpio), {
    headers: {
      "Content-Type": "application/pdf",
      // El borrador cambia mientras se cotiza: que el navegador no muestre el
      // PDF de antes (Gabriela, 29-09: «tengo 11 ítems y solo aparecen 8»).
      "Cache-Control": "no-store",
      // "Presu_2195-26, WAYRA INMOBILIARIA.pdf": pedido del área comercial el
      // 24-08 — «cosa que lo que descarga ya está listo para enviar por
      // correo», sin renombrarlo a mano. El borrador todavía no tiene número.
      "Content-Disposition": cabeceraArchivo(nombre, "pdf", descargar),
    },
  });
}
