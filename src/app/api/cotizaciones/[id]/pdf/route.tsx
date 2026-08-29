import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { quitarPaginasEnBlanco } from "@/lib/pdf/paginas-en-blanco";

export const runtime = "nodejs";

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
      `codigo, correlativo, serie, moneda, condiciones, vigencia_dias, entrega_lugar,
       tiempo_entrega, garantia, forma_pago, saldo, cliente_snapshot, created_at,
       cotizacion_items(cantidad, precio_unitario, descripcion, color, productos(sku, marca, modelo, nombre, capacidad, categoria, ficha, foto_path)),
       oportunidades(cuentas(contactos(nombre, telefono, email, es_principal))),
       perfiles!cotizaciones_creada_por_fkey(nombre, cargo, telefono, celular, email_contacto, email_open)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!cotizacion) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const buffer = await renderizarCotizacionPdf(cotizacion as unknown as CotizacionParaPdf);
  const snapshot = cotizacion.cliente_snapshot as { razon_social: string };

  // Red de seguridad: si alguna ficha se pasó del alto por poco, react-pdf deja
  // una hoja con el membrete y nada más. Al cliente no le llega.
  const { pdf: limpio, quitadas } = await quitarPaginasEnBlanco(new Uint8Array(buffer));
  if (quitadas.length > 0) {
    // Se avisa aunque el documento salga bien: cada aviso es una ficha que se
    // pasó del alto y conviene mirarla, no dejarla tapada por la red.
    console.warn(`[cotizacion ${id}] hojas en blanco quitadas: ${quitadas.join(", ")}`);
  }

  return new NextResponse(new Uint8Array(limpio), {
    headers: {
      "Content-Type": "application/pdf",
      // "Presu_2195-26, WAYRA INMOBILIARIA.pdf": pedido del área comercial el
      // 24-08 — «cosa que lo que descarga ya está listo para enviar por
      // correo», sin renombrarlo a mano. El borrador todavía no tiene número.
      "Content-Disposition": cabeceraArchivo(
        `${cotizacion.codigo ?? "Presupuesto BORRADOR"}, ${snapshot.razon_social}`,
      ),
    },
  });
}
