import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { puedeVerPrecios } from "@/lib/postventa";
import { taparMontosEnPdf } from "@/lib/pdf/tapar-montos";

export const runtime = "nodejs";

// Abre el PDF de una cotización anterior al CRM (los presupuestos que vivían
// en las unidades de red S:, T: y O:, hoy en un bucket privado de R2).
//
// POR QUÉ UNA REDIRECCIÓN Y NO LA URL EN LA PÁGINA: el bucket es privado y la
// firma vence en minutos. Si la ficha del cliente trajera las URLs ya
// firmadas, una pestaña abierta media hora quedaría con enlaces muertos y
// además dejaría precios de clientes en el HTML de la página. Acá el enlace es
// siempre el mismo (/api/cotizaciones-historicas/<id>/pdf) y la firma se pide
// en el momento del clic.
//
// LA AUTORIZACIÓN LA HACE RLS, no este archivo: la consulta va con la sesión
// del usuario, así que la política de la migración 0039 ya decide si puede ver
// esa cotización (backoffice todo; el comercial, lo de las cuentas de SU
// cartera). Si no le corresponde, el select devuelve vacío y aquí sale un 404.

const VENCE_EN_SEGUNDOS = 300;

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;

const s3 =
  R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: "auto",
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      })
    : null;

// El nombre del archivo viaja en una cabecera: sin ASCII puro, R2 rechaza la
// firma. Las tildes y la "ñ" de las razones sociales se van, el nombre sigue
// siendo reconocible.
function nombreDescarga(archivo: string): string {
  const base = archivo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "") // comillas y barra invertida: romperían la cabecera
    .trim();
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!s3 || !R2_BUCKET) {
    // Se dicen los NOMBRES que faltan, nunca los valores: sin esto, un 503
    // seco obliga a adivinar cuál de las cuatro quedó mal escrita en Vercel.
    const faltan = Object.entries({ R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    return NextResponse.json(
      { error: "El archivo de cotizaciones no está configurado", faltan },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // POSTVENTA LA ABRE CON LOS IMPORTES TAPADOS (gerencia, 28-09: «postventa
  // tiene que ver todo y estarían borraditos los números… en los PDFs»). La
  // RLS de la 0039 no le abre el archivo, así que la fila se lee con la llave
  // del servidor y el documento se sirve desde acá —no por URL firmada—,
  // para que el original con precios nunca llegue a su navegador.
  const { data: perfil } = await supabase.from("perfiles").select("rol, es_postventa").eq("id", user.id).maybeSingle();
  const sinMontos = Boolean(perfil && !puedeVerPrecios(perfil));

  const { data: cotizacion } = await (sinMontos ? createAdminClient() : supabase)
    .from("cotizaciones_historicas")
    .select("pdf_path, archivo")
    .eq("id", id)
    .maybeSingle();

  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  // Hay documentos que solo existen en .doc, y la subida al bucket se hace por
  // tandas: mientras no tengan ruta, no hay nada que abrir.
  if (!cotizacion.pdf_path) {
    return NextResponse.json({ error: "Esta cotización no tiene PDF disponible" }, { status: 404 });
  }

  if (sinMontos) {
    const objeto = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: cotizacion.pdf_path }));
    const original = new Uint8Array(await objeto.Body!.transformToByteArray());
    try {
      const { pdf } = await taparMontosEnPdf(original);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${nombreDescarga(cotizacion.archivo).replace(/\.pdf$/i, "")} (sin montos).pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      // Si el documento no se deja leer, no se entrega con precios: se dice.
      console.error(`[cotizacion historica ${id}] no se pudieron tapar los montos:`, e);
      return NextResponse.json({ error: "No se pudo preparar este documento sin montos" }, { status: 500 });
    }
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: cotizacion.pdf_path,
      // Que el navegador lo muestre en vez de descargarlo, y con el nombre
      // original del presupuesto — no con el de la ruta interna del bucket.
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `inline; filename="${nombreDescarga(cotizacion.archivo)}"`,
    }),
    { expiresIn: VENCE_EN_SEGUNDOS },
  );

  // no-store: la URL firmada vence en minutos, guardarla en una caché
  // intermedia solo produce enlaces caducados.
  return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
}
