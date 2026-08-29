import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderizarCotizacionPdf, type CotizacionParaPdf } from "@/lib/pdf/armar-cotizacion";
import { cabeceraArchivo } from "@/lib/nombre-archivo";
import { quitarPaginasEnBlanco } from "@/lib/pdf/paginas-en-blanco";

export const runtime = "nodejs";

/**
 * Cómo se vería este equipo en una cotización, antes de que exista ninguna.
 *
 * Es la herramienta de trabajo de operaciones: cargó una ficha, cambió un
 * precio, corrigió una descripción — ¿sale bien impreso? Hasta hoy la única
 * forma de saberlo era pedirle a un comercial que cotizara ese equipo a un
 * cliente de verdad y mirar el PDF.
 *
 * NO ES UNA IMITACIÓN. Arma el MISMO documento que recibe el cliente, con el
 * mismo código (`renderizarCotizacionPdf`): la foto, el logo del fabricante, la
 * imagen del panel, las especificaciones en su orden y el corte de páginas. Una
 * vista previa «parecida» aprobaría fichas que después salen mal, que es
 * exactamente lo que hay que evitar.
 *
 * Lo único inventado son los datos del cliente y la cantidad —un ejemplo
 * rotulado como tal—, y el documento sale sin número, o sea marcado BORRADOR
 * por el propio PDF, para que no pueda confundirse con uno enviado.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase.from("perfiles").select("rol, nombre, cargo").eq("id", user.id).maybeSingle();
  const rol = perfil?.rol as string | undefined;
  if (!rol || !["operaciones", "gerencia", "admin"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { data: producto } = await supabase
    .from("productos")
    .select("id, sku, marca, modelo, nombre, capacidad, categoria, ficha, foto_path, precios_producto(tier, precio, vigente_hasta)")
    .eq("id", id)
    .maybeSingle();

  if (!producto) return NextResponse.json({ error: "Ese equipo no existe" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const serie = searchParams.get("serie") === "OPEN" ? "OPEN" : "EFAMEINSA";
  const color = searchParams.get("color");

  // El precio que se muestra es el vigente del tier pedido —o el «base», que es
  // el que tiene el 97 % del catálogo—. Si el equipo no tuviera ninguno, sale
  // en cero: también es información, y en la lista ya está avisado.
  const precios = (producto.precios_producto ?? []) as { tier: string; precio: number; vigente_hasta: string | null }[];
  const vigentes = precios.filter((p) => p.vigente_hasta === null);
  const tierPedido = searchParams.get("tier");
  const precio =
    vigentes.find((p) => p.tier === tierPedido)?.precio ?? vigentes.find((p) => p.tier === "base")?.precio ?? vigentes[0]?.precio ?? 0;

  const ejemplo: CotizacionParaPdf = {
    codigo: null, // sin número: el PDF lo rotula BORRADOR solo
    correlativo: null,
    serie,
    moneda: "USD",
    condiciones: null,
    vigencia_dias: 15,
    entrega_lugar: "Lima",
    tiempo_entrega: "A convenir",
    garantia: "12 meses",
    forma_pago: "50 % adelanto, 50 % contra entrega",
    saldo: null,
    created_at: new Date().toISOString(),
    cliente_snapshot: {
      razon_social: "VISTA PREVIA — CLIENTE DE EJEMPLO",
      tipo_doc: "RUC",
      num_doc: "20000000001",
      direccion: "Este documento es una vista previa del catálogo, no una cotización",
    },
    cotizacion_items: [
      {
        cantidad: 1,
        precio_unitario: precio,
        descripcion: null,
        color,
        productos: {
          sku: producto.sku,
          marca: producto.marca,
          modelo: producto.modelo,
          nombre: producto.nombre,
          capacidad: producto.capacidad,
          categoria: producto.categoria,
          ficha: producto.ficha,
          foto_path: producto.foto_path,
        },
      },
    ],
    oportunidades: { cuentas: { contactos: [] } },
    perfiles: {
      nombre: perfil?.nombre ?? "Operaciones",
      cargo: perfil?.cargo ?? "Operaciones",
      telefono: null,
      celular: null,
      email_contacto: null,
      email_open: null,
    },
  };

  const buffer = await renderizarCotizacionPdf(ejemplo);
  const { pdf: limpio } = await quitarPaginasEnBlanco(new Uint8Array(buffer));

  return new NextResponse(new Uint8Array(limpio), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": cabeceraArchivo(`Vista previa, ${producto.marca} ${producto.modelo}`),
    },
  });
}
