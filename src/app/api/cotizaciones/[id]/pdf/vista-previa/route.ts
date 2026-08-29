import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";
import { quitarPaginasEnBlanco } from "@/lib/pdf/paginas-en-blanco";

export const runtime = "nodejs";

/**
 * El PDF de una corrección ANTES de guardarla.
 *
 * Es el único control que de verdad sirve al corregir una cotización numerada:
 * cambiar el equipo cambia la PÁGINA ENTERA de la ficha técnica, y eso solo se
 * ve mirándolo. Sin esto habría que guardar para poder revisar — y guardar
 * quema la autorización, así que un error tipográfico costaría otra llamada a
 * operaciones.
 *
 * Va como POST porque lleva los equipos que todavía no están en la base. No
 * escribe nada: arma el mismo documento que `GET .../pdf` pero con los ítems
 * de la pantalla.
 *
 * La identidad —número, serie, cliente, comercial, fecha— sale SIEMPRE de la
 * base, nunca de lo que mande el navegador: es justo lo que una corrección no
 * puede tocar. Y RLS filtra la cotización, así que quien no la puede ver
 * tampoco puede pedir su vista previa.
 */

interface ItemPedido {
  producto_id: string | null;
  descripcion?: string | null;
  cantidad: number;
  precio_unitario: number;
  color?: string | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const cuerpo = (await request.json()) as {
    items?: ItemPedido[];
    condiciones?: string | null;
    vigencia_dias?: number;
    entrega_lugar?: string | null;
    tiempo_entrega?: string | null;
    garantia?: string | null;
    forma_pago?: string | null;
    saldo?: string | null;
  };
  const items = cuerpo.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "La cotización necesita al menos un equipo" }, { status: 400 });
  }

  const { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select(
      `codigo, correlativo, serie, moneda, cliente_snapshot, created_at,
       oportunidades(cuentas(contactos(nombre, telefono, email, es_principal))),
       perfiles!cotizaciones_creada_por_fkey(nombre, cargo, telefono, celular, email_contacto, email_open)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const ids = items.map((i) => i.producto_id).filter((x): x is string => Boolean(x));
  const { data: productos } = await supabase
    .from("productos")
    .select("id, sku, marca, modelo, nombre, capacidad, categoria, ficha, foto_path")
    .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const porId = new Map((productos ?? []).map((p) => [p.id as string, p]));

  const paraPdf: CotizacionParaPdf = {
    ...cotizacion,
    condiciones: cuerpo.condiciones ?? null,
    vigencia_dias: cuerpo.vigencia_dias ?? 15,
    entrega_lugar: cuerpo.entrega_lugar ?? null,
    tiempo_entrega: cuerpo.tiempo_entrega ?? null,
    garantia: cuerpo.garantia ?? null,
    forma_pago: cuerpo.forma_pago ?? null,
    saldo: cuerpo.saldo ?? null,
    cotizacion_items: items.map((i) => ({
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      descripcion: i.descripcion ?? null,
      color: i.color ?? null,
      productos: i.producto_id ? (porId.get(i.producto_id) ?? null) : null,
    })),
  } as CotizacionParaPdf;

  const buffer = await renderizarCotizacionPdf(paraPdf);
  const { pdf: limpio } = await quitarPaginasEnBlanco(new Uint8Array(buffer));

  return new NextResponse(Buffer.from(limpio), {
    headers: {
      "Content-Type": "application/pdf",
      // Se abre en una pestaña: es para mirarlo, no para archivarlo. El
      // documento de verdad se baja después de guardar la corrección.
      "Content-Disposition": `inline; filename="vista-previa-${cotizacion.codigo ?? "cotizacion"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
