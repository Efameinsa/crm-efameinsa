import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { CotizacionPdf } from "@/lib/pdf/cotizacion-pdf";

// Se lee una sola vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select("codigo, serie, total, moneda, condiciones, vigencia_dias, cliente_snapshot, created_at, cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre))")
    .eq("id", id)
    .maybeSingle();

  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const cliente = cotizacion.cliente_snapshot as {
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
  };

  const items = (
    cotizacion.cotizacion_items as unknown as {
      cantidad: number;
      precio_unitario: number;
      productos: { marca: string; modelo: string; nombre: string } | null;
    }[]
  ).map((item) => ({
    nombre: item.productos ? `${item.productos.marca} ${item.productos.modelo} — ${item.productos.nombre}` : "Producto",
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
  }));

  const buffer = await renderToBuffer(
    <CotizacionPdf
      logoBuffer={LOGO_BUFFER}
      codigo={cotizacion.codigo ?? ""}
      serie={cotizacion.serie}
      fecha={new Date(cotizacion.created_at).toLocaleDateString("es-PE")}
      cliente={cliente}
      items={items}
      subtotal={cotizacion.total}
      total={cotizacion.total}
      moneda={cotizacion.moneda}
      condiciones={cotizacion.condiciones}
      vigenciaDias={cotizacion.vigencia_dias}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cotizacion.codigo}.pdf"`,
    },
  });
}
