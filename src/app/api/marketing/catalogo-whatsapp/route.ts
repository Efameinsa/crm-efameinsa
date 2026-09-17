import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// El catálogo de WhatsApp sale del CRM (Santos, 17-09-2026: «crea también el
// catálogo sincronizando desde el CRM»). Meta lee este CSV todos los días desde
// Commerce Manager (feed programado) y lo que Lesly mantenga en `productos`
// aparece en el botón «Catálogo» del número de WhatsApp sin volver a cargar
// nada a mano. Formato: el «product feed» de Meta (campos obligatorios id,
// title, description, availability, condition, price, link, image_link, brand).
//
// Solo equipos: los repuestos y servicios no van al catálogo público. La foto es
// la del CRM (public/productos), que es la misma ficha que ven los comerciales;
// el enlace es la página del equipo en www.efameinsa.com cuando existe, y si no
// la página de equipos.
//
// Precio: Meta exige un precio por ítem. Sale del tier configurado en
// CATALOGO_WA_TIER (deseado | medio | base | optimo); decisión de gerencia.
// La URL lleva una clave (CATALOGO_WA_CLAVE) para que no sea pública.

const WEB = "https://www.efameinsa.com";
const CRM = "https://crm.efameinsa.com";
const CATEGORIAS_EQUIPO = new Set(["lavadora", "lavadora-secadora", "secadora", "planchador", "coche"]);
const NOMBRE_CATEGORIA: Record<string, string> = {
  lavadora: "Lavadoras industriales",
  "lavadora-secadora": "Lavadoras-secadoras",
  secadora: "Secadoras industriales",
  planchador: "Planchadores y calandrias",
  coche: "Coches de lavandería",
};

interface BloqueFicha {
  t?: string;
  texto?: string;
}

function textoDeFicha(ficha: unknown): string {
  const bloques = (ficha as { bloques?: BloqueFicha[] } | null)?.bloques ?? [];
  const lineas: string[] = [];
  for (const b of bloques) {
    if (!b.texto) continue;
    if (b.t === "titulo") lineas.push(`\n${b.texto.trim()}`);
    else lineas.push(`• ${b.texto.trim()}`);
  }
  return lineas.join("\n").trim().slice(0, 4900);
}

const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: NextRequest) {
  const clave = process.env.CATALOGO_WA_CLAVE;
  if (!clave || request.nextUrl.searchParams.get("clave") !== clave) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const tier = process.env.CATALOGO_WA_TIER ?? "deseado";
  const admin = createAdminClient();
  const [{ data: productos }, { data: precios }, paginasWeb] = await Promise.all([
    admin.from("productos").select("id, sku, marca, modelo, nombre, categoria, segmento, capacidad, foto_path, ficha").eq("activo", true).order("categoria").order("sku"),
    admin.from("precios_producto").select("producto_id, precio, moneda").eq("tier", tier).is("vigente_hasta", null),
    paginasDeLaWeb(),
  ]);
  const precioDe = new Map((precios ?? []).map((p) => [p.producto_id, p]));

  const filas = [["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "product_type", "custom_label_0"]];
  for (const p of productos ?? []) {
    if (!CATEGORIAS_EQUIPO.has(p.categoria) || !p.foto_path) continue;
    const precio = precioDe.get(p.id);
    if (!precio) continue; // sin precio vigente no hay ítem: Meta lo rechazaría
    const capacidad = p.capacidad ? ` · ${p.capacidad}` : "";
    const titulo = `${p.marca} ${p.modelo}${capacidad} — ${NOMBRE_CATEGORIA[p.categoria] ?? p.categoria}`.slice(0, 150);
    const descripcion = textoDeFicha(p.ficha) || p.nombre;
    const pagina = paginasWeb.get(normalizar(p.modelo));
    filas.push([
      p.sku,
      titulo,
      descripcion,
      "in stock",
      "new",
      `${Number(precio.precio).toFixed(2)} ${precio.moneda}`,
      pagina ? `${WEB}/${pagina}` : `${WEB}/equipos-de-lavanderia`,
      `${CRM}${p.foto_path}`,
      p.marca,
      NOMBRE_CATEGORIA[p.categoria] ?? p.categoria,
      p.segmento ?? "",
    ]);
  }
  const cuerpo = filas.map((f) => f.map(csv).join(",")).join("\r\n");
  return new NextResponse(cuerpo, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'inline; filename="catalogo-whatsapp.csv"', "Cache-Control": "no-store" },
  });
}

const normalizar = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Los slugs de la web por modelo, leídos del sitemap público: así el enlace del
 * ítem lleva a la página del equipo cuando existe. Si el sitemap no responde,
 * todos enlazan a la página de equipos y el catálogo sale igual.
 */
async function paginasDeLaWeb(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const xml = await fetch(`${WEB}/sitemap-0.xml`, { cache: "no-store", signal: AbortSignal.timeout(8000) }).then((r) => r.text());
    for (const m of xml.matchAll(/<loc>https:\/\/www\.efameinsa\.com\/([^<]+)<\/loc>/g)) {
      const slug = m[1];
      if (slug.includes("/") || slug.startsWith("blog")) continue;
      // El modelo suele ser un tramo del slug: «lavadora-industrial-uw45-unimac» → UW45.
      for (const tramo of slug.split("-")) if (tramo.length >= 3) mapa.set(normalizar(tramo), slug);
    }
  } catch {
    /* sin sitemap: enlaces genéricos */
  }
  return mapa;
}
