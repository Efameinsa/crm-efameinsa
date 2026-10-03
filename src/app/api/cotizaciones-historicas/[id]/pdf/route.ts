import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { puedeVerPrecios } from "@/lib/postventa";
import { taparMontosEnPdf } from "@/lib/pdf/tapar-montos";

export const runtime = "nodejs";

// Abre el PDF de una cotización anterior al CRM (los presupuestos que vivían
// en el servidor de archivos de la empresa, hoy en el bucket privado
// `archivo-presupuestos` del Storage de la VM; R2 solo como respaldo).
//
// POR QUÉ UNA RUTA Y NO EL ARCHIVO EN LA PÁGINA: el enlace es siempre el mismo
// (/api/cotizaciones-historicas/<id>/pdf) y el documento se lee en el momento
// del clic, así la ficha no lleva precios de clientes en su HTML.
//
// LA AUTORIZACIÓN LA HACE RLS, no este archivo: la consulta va con la sesión
// del usuario, así que la política de la migración 0039 ya decide si puede ver
// esa cotización (backoffice todo; el comercial, lo de las cuentas de SU
// cartera). Si no le corresponde, el select devuelve vacío y aquí sale un 404.

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

const BUCKET_LOCAL = "archivo-presupuestos";

async function leerPdf(ruta: string): Promise<Uint8Array | null> {
  const { data } = await createAdminClient().storage.from(BUCKET_LOCAL).download(ruta);
  if (data) return new Uint8Array(await data.arrayBuffer());
  if (!s3 || !R2_BUCKET) return null;
  try {
    const objeto = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: ruta }));
    return new Uint8Array(await objeto.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  // EL ARCHIVO VIVE EN LA VM (Santos, 01-10-2026: «todo debería ser aquí»):
  // bucket privado `archivo-presupuestos` del Storage local, con la misma
  // clave que tenía en R2. El documento se entrega desde acá, sin URL firmada
  // (la firma saldría con la dirección interna de la VM). R2 queda solo de
  // respaldo para el despliegue de Vercel, que no ve el Storage local.
  const original = await leerPdf(cotizacion.pdf_path);
  if (!original) return NextResponse.json({ error: "No se encontró el PDF de esta cotización" }, { status: 404 });

  if (sinMontos) {
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

  return new NextResponse(new Uint8Array(original), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreDescarga(cotizacion.archivo)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
