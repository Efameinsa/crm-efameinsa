import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createClient } from "@/lib/supabase/server";
import { CotizacionPdf, type ItemPdf } from "@/lib/pdf/cotizacion-pdf";

// Se lee una sola vez al cargar el módulo, no en cada request.
const LOGO_BUFFER = readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"));


// Fotos de producto: viven en public/productos/ (repo) y foto_path guarda la
// ruta pública ("/productos/x.png"). basename() evita salirse de la carpeta
// aunque foto_path viniera manipulado. En Vercel la carpeta se incluye vía
// outputFileTracingIncludes (next.config.ts).
function leerFotoProducto(fotoPath: string | null): Buffer | null {
  if (!fotoPath) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", basename(fotoPath)));
  } catch {
    return null; // foto declarada pero archivo ausente: el PDF sale sin foto
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select(
      `codigo, correlativo, serie, moneda, condiciones, vigencia_dias, cliente_snapshot, created_at,
       cotizacion_items(cantidad, precio_unitario, productos(marca, modelo, nombre, capacidad, categoria, ficha, foto_path)),
       oportunidades(cuentas(contactos(nombre, telefono, email, es_principal))),
       perfiles!cotizaciones_creada_por_fkey(nombre, telefono, celular, email_contacto)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const snapshot = cotizacion.cliente_snapshot as {
    razon_social: string;
    tipo_doc: string;
    num_doc: string | null;
    direccion: string | null;
  };

  // Datos de contacto: del contacto principal actual de la cuenta (no van en el
  // snapshot porque son datos de comunicación, no de identidad fiscal).
  const contactos =
    ((cotizacion.oportunidades as unknown as {
      cuentas: { contactos: { nombre: string; telefono: string | null; email: string | null; es_principal: boolean }[] } | null;
    } | null)?.cuentas?.contactos ?? []);
  const contactoPrincipal = contactos.find((c) => c.es_principal) ?? contactos[0] ?? null;

  const perfilComercial = cotizacion.perfiles as unknown as {
    nombre: string;
    telefono: string | null;
    celular: string | null;
    email_contacto: string | null;
  } | null;

  function listaDeFicha(ficha: Record<string, unknown> | null | undefined, clave: string): string[] {
    const valor = ficha?.[clave];
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  }

  function textoDeFicha(ficha: Record<string, unknown> | null | undefined, clave: string): string | null {
    const valor = ficha?.[clave];
    return typeof valor === "string" && valor ? valor : null;
  }

  const items: ItemPdf[] = (
    cotizacion.cotizacion_items as unknown as {
      cantidad: number;
      precio_unitario: number;
      productos: {
        marca: string;
        modelo: string;
        nombre: string;
        capacidad: string | null;
        categoria: string | null;
        ficha: Record<string, unknown> | null;
        foto_path: string | null;
      } | null;
    }[]
  ).map((item) => {
    const ficha = item.productos?.ficha;
    return {
      nombre: item.productos?.nombre ?? "Producto",
      marca: item.productos?.marca ?? "—",
      modelo: item.productos?.modelo ?? "—",
      capacidad: item.productos?.capacidad ?? null,
      categoria: item.productos?.categoria ?? null,
      calentamiento: textoDeFicha(ficha, "calentamiento"),
      panel: textoDeFicha(ficha, "panel"),
      controles: textoDeFicha(ficha, "controles"),
      caracteristicas: listaDeFicha(ficha, "caracteristicas"),
      dimensiones: listaDeFicha(ficha, "dimensiones"),
      medidas: listaDeFicha(ficha, "medidas"),
      fotoBuffer: leerFotoProducto(item.productos?.foto_path ?? null),
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
    };
  });

  const creada = new Date(cotizacion.created_at);
  // Numeración del documento impreso como en los modelos: "{correlativo}-{yy}".
  const numeroDocumento = `${cotizacion.correlativo}-${String(creada.getFullYear()).slice(-2)}`;
  const fecha = creada.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const buffer = await renderToBuffer(
    <CotizacionPdf
      logoBuffer={LOGO_BUFFER}
      serie={cotizacion.serie}
      numeroDocumento={numeroDocumento}
      fecha={fecha}
      cliente={{
        razon_social: snapshot.razon_social,
        tipo_doc: snapshot.tipo_doc,
        num_doc: snapshot.num_doc,
        direccion: snapshot.direccion,
        telefono: contactoPrincipal?.telefono ?? null,
        email: contactoPrincipal?.email ?? null,
        atencion: contactoPrincipal?.nombre ?? null,
      }}
      items={items}
      moneda={cotizacion.moneda}
      condiciones={cotizacion.condiciones}
      vigenciaDias={cotizacion.vigencia_dias}
      firma={{
        nombre: perfilComercial?.nombre ?? "Área Comercial",
        telefono: perfilComercial?.telefono ?? null,
        celular: perfilComercial?.celular ?? null,
        email: perfilComercial?.email_contacto ?? null,
      }}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cotizacion.codigo}.pdf"`,
    },
  });
}
