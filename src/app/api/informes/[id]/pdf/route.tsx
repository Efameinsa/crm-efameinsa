import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { InformeCierrePdf, type ItemInforme } from "@/lib/pdf/informe-cierre-pdf";
import { etiquetaTipo, type AdjuntoCierre } from "@/lib/adjuntos-cierre";

// PDF del informe de cierre de ventas que se le manda a Central.
// La autorización la hace RLS (migración 0049): el comercial ve los de SU
// cartera, gerencia y Central ven todos. Sin permiso el select viene vacío.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

interface ItemGuardado extends ItemInforme {
  bloque?: "venta" | "gratuito";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("*, perfiles!informes_cierre_creado_por_fkey(nombre, telefono, celular, email_contacto)")
    .eq("id", id)
    .maybeSingle();

  if (!informe) return NextResponse.json({ error: "Informe no encontrado" }, { status: 404 });

  const guardados = (informe.items ?? []) as ItemGuardado[];
  const comercial = informe.perfiles as unknown as {
    nombre: string;
    telefono: string | null;
    celular: string | null;
    email_contacto: string | null;
  } | null;

  const buffer = await renderToBuffer(
    <InformeCierrePdf
      logoBuffer={LOGO_BUFFER}
      serie={informe.serie}
      codigo={informe.codigo}
      fecha={new Date(`${informe.fecha}T12:00:00`).toLocaleDateString("es-PE")}
      referencia={informe.referencia}
      asunto={informe.asunto}
      presupuestoRef={informe.presupuesto_ref}
      comprobante={informe.comprobante}
      clienteNuevo={informe.cliente_nuevo}
      cliente={{
        nombre: informe.cliente_nombre,
        doc: informe.cliente_doc,
        direccion: informe.cliente_direccion,
        correo: informe.cliente_correo,
        ordenCompra: informe.orden_compra,
      }}
      contactoVenta={informe.contacto_venta ?? {}}
      contactoContabilidad={informe.contacto_contabilidad ?? {}}
      contactoDespacho={informe.contacto_despacho ?? {}}
      modalidadPago={informe.modalidad_pago ?? []}
      formaPago={informe.forma_pago}
      moneda={informe.moneda}
      notaCondiciones={informe.nota_condiciones}
      garantia={informe.garantia}
      entrega={{
        fecha: informe.entrega_fecha,
        hora: informe.entrega_hora,
        lugar: informe.entrega_lugar,
        direccion: informe.entrega_direccion,
      }}
      notaDespacho={informe.nota_despacho}
      urgente={informe.urgente}
      incluye={informe.incluye ?? []}
      gratis={informe.gratis}
      notaFinal={informe.nota_final}
      items={guardados.filter((i) => i.bloque !== "gratuito")}
      itemsGratuitos={guardados.filter((i) => i.bloque === "gratuito")}
      adjuntos={((informe.adjuntos ?? []) as AdjuntoCierre[]).map((a) => ({
        etiqueta: etiquetaTipo(a.tipo),
        nombre: a.nombre,
      }))}
      firma={{
        nombre: comercial?.nombre ?? "Área Comercial",
        telefono: comercial?.telefono ?? null,
        celular: comercial?.celular ?? null,
        email: comercial?.email_contacto ?? null,
      }}
    />,
  );

  // El asunto es texto libre y puede traer barras o comillas, que Windows no
  // admite en un nombre de archivo (ver lib/nombre-archivo.ts). Antes se le
  // quitaban las tildes a la fuerza para que entrara en la cabecera; ahora la
  // cabecera manda el nombre real codificado y el respaldo sin tildes, as\u00ed que
  // el archivo se guarda como est\u00e1 escrito.
  const nombre = `Informe ${informe.serie} ${informe.codigo ? "N" + informe.codigo : "BORRADOR"} - ${informe.asunto}`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(nombre),
      "Cache-Control": "no-store",
    },
  });
}
