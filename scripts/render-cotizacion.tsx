// Renderiza el PDF de UNA cotización real, con los mismos datos y el mismo
// componente que usa /api/cotizaciones/[id]/pdf, para poder mirarlo página por
// página sin pasar por el navegador ni por la sesión.
//
// Nació el 25-08 para encontrar de dónde salía una hoja en blanco.
//
// Uso: npx tsx scripts/render-cotizacion.tsx <id> [salida.pdf]

import { readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { Client } from "pg";
import { CotizacionPdf, type ItemPdf, type SeccionFicha, type BloqueFicha } from "../src/lib/pdf/cotizacion-pdf";
import { correoEnSerie } from "../src/lib/pdf/series";

if (!process.env.DATABASE_URL) {
  for (const linea of readFileSync(".env.local", "utf-8").split("\n")) {
    const i = linea.indexOf("=");
    if (i > 0 && !linea.trimStart().startsWith("#")) process.env[linea.slice(0, i).trim()] ??= linea.slice(i + 1).trim();
  }
}

const ID = process.argv[2];
const SALIDA = process.argv[3] ?? "scripts/data/cotizacion-revision.pdf";
if (!ID) {
  console.error("Falta el id de la cotización.");
  process.exit(1);
}

async function main() {
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: cots } = await bd.query(
  `select c.codigo, c.correlativo, c.serie, c.moneda, c.condiciones, c.vigencia_dias, c.entrega_lugar,
          c.tiempo_entrega, c.garantia, c.forma_pago, c.saldo,
          c.cliente_snapshot, c.created_at, c.oportunidad_id, c.creada_por
     from cotizaciones c where c.id = $1`,
  [ID],
);
if (cots.length === 0) throw new Error("No existe esa cotización");
const c = cots[0];

const { rows: items } = await bd.query(
  `select i.cantidad, i.precio_unitario, i.descripcion, i.color,
          p.sku, p.marca, p.modelo, p.nombre, p.capacidad, p.categoria, p.ficha, p.foto_path
     from cotizacion_items i left join productos p on p.id = i.producto_id
    where i.cotizacion_id = $1`,
  [ID],
);
const { rows: contactos } = await bd.query(
  `select ct.nombre, ct.telefono, ct.email, ct.es_principal
     from contactos ct join oportunidades o on o.cuenta_id = ct.cuenta_id
    where o.id = $1 order by ct.es_principal desc`,
  [c.oportunidad_id],
);
const { rows: perfiles } = await bd.query(
  `select nombre, cargo, telefono, celular, email_contacto, email_open from perfiles where id = $1`,
  [c.creada_por],
);

const lista = (f: Record<string, unknown> | null, k: string): string[] =>
  Array.isArray(f?.[k]) ? (f![k] as unknown[]).filter((v): v is string => typeof v === "string") : [];
const texto = (f: Record<string, unknown> | null, k: string): string | null =>
  typeof f?.[k] === "string" && f[k] ? (f[k] as string) : null;
type ClaveSeccion = "caracteristicas" | "disenoConstruccion" | "dimensiones" | "medidas";
const CLAVES_SECCION: ClaveSeccion[] = ["caracteristicas", "disenoConstruccion", "dimensiones", "medidas"];
function orden(f: Record<string, unknown> | null): ClaveSeccion[] | null {
  const v = f?.ordenSecciones;
  if (!Array.isArray(v)) return null;
  const claves = v.filter((c): c is ClaveSeccion => CLAVES_SECCION.includes(c as ClaveSeccion));
  return claves.length === CLAVES_SECCION.length ? claves : null;
}
function secciones(f: Record<string, unknown> | null): SeccionFicha[] | undefined {
  const v = f?.secciones;
  if (!Array.isArray(v) || v.length < 2) return undefined;
  return v.map((s) => {
    const sec = s as Record<string, unknown>;
    return {
      titulo: typeof sec.titulo === "string" ? sec.titulo : null,
      caracteristicas: lista(sec, "caracteristicas"),
      caracteristicasTitulo: texto(sec, "caracteristicasTitulo"),
      disenoConstruccion: lista(sec, "disenoConstruccion"),
      dimensiones: lista(sec, "dimensiones"),
      dimensionesTitulo: texto(sec, "dimensionesTitulo"),
      medidas: lista(sec, "medidas"),
      medidasTitulo: texto(sec, "medidasTitulo"),
      ordenSecciones: orden(sec),
    };
  });
}
function foto(p: string | null): Buffer | null {
  if (!p) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", basename(p)));
  } catch {
    return null;
  }
}
// Por producto, no por marca — cada foto es distinta (ver route.tsx).
function logoMarca(sku: string | null): Buffer | null {
  if (!sku) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", `${sku.toLowerCase()}-logo.png`));
  } catch {
    return null;
  }
}
// Por producto, no por nombre de panel — dos equipos con el mismo panel
// pueden tener fichas .docx distintas (ver route.tsx).
function imagenPanel(sku: string | null): Buffer | null {
  if (!sku) return null;
  try {
    return readFileSync(join(process.cwd(), "public", "productos", `${sku.toLowerCase()}-panel.png`));
  } catch {
    return null;
  }
}

const itemsPdf: ItemPdf[] = items.map((i) => ({
  nombre: i.nombre ?? i.descripcion ?? "Producto",
  marca: i.marca ?? "—",
  modelo: i.modelo ?? "—",
  capacidad: i.capacidad ?? null,
  categoria: i.categoria ?? null,
  calentamiento: texto(i.ficha, "calentamiento"),
  panel: texto(i.ficha, "panel"),
  controles: texto(i.ficha, "controles"),
  colores: lista(i.ficha, "colores"),
  color: i.color ?? null,
  caracteristicas: lista(i.ficha, "caracteristicas"),
  caracteristicasTitulo: texto(i.ficha, "caracteristicasTitulo"),
  disenoConstruccion: lista(i.ficha, "disenoConstruccion"),
  dimensiones: lista(i.ficha, "dimensiones"),
  dimensionesTitulo: texto(i.ficha, "dimensionesTitulo"),
  medidas: lista(i.ficha, "medidas"),
  medidasTitulo: texto(i.ficha, "medidasTitulo"),
  ordenSecciones: orden(i.ficha),
  // La descripción leída del Word (paso 3 de fichas-v), que manda sobre los
  // cuatro cajones cuando existe.
  bloques: Array.isArray(i.ficha?.bloques) ? i.ficha.bloques : undefined,
  secciones: secciones(i.ficha),
  // La foto del color elegido, igual que en route.tsx (migración 0088).
  fotoBuffer: foto(
    (i.color && (i.ficha?.fotos_por_color as Record<string, string> | undefined)?.[i.color]) || i.foto_path,
  ),
  logoMarcaBuffer: logoMarca(i.sku ?? null),
  panelImagenBuffer: imagenPanel(i.sku ?? null),
  cantidad: i.cantidad,
  precio_unitario: Number(i.precio_unitario),
}));

const snap = c.cliente_snapshot as { razon_social: string; tipo_doc: string; num_doc: string | null; direccion: string | null };
const creada = new Date(c.created_at);
const buffer = await renderToBuffer(
  <CotizacionPdf
    logoBuffer={readFileSync(join(process.cwd(), "public", "logo-efameinsa.png"))}
    serie={c.serie}
    numeroDocumento={c.correlativo != null ? `${c.correlativo}-${String(creada.getFullYear()).slice(-2)}` : null}
    fecha={creada.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
    cliente={{
      razon_social: snap.razon_social,
      tipo_doc: snap.tipo_doc,
      num_doc: snap.num_doc,
      direccion: snap.direccion,
      telefono: contactos[0]?.telefono ?? null,
      email: contactos[0]?.email ?? null,
      atencion: contactos[0]?.nombre ?? null,
    }}
    items={itemsPdf}
    moneda={c.moneda}
    condiciones={c.condiciones}
    vigenciaDias={c.vigencia_dias}
    entregaLugar={c.entrega_lugar}
    firma={{
      nombre: perfiles[0]?.nombre ?? "Área Comercial",
      cargo: perfiles[0]?.cargo ?? null,
      telefono: perfiles[0]?.telefono ?? null,
      celular: perfiles[0]?.celular ?? null,
      email: correoEnSerie(perfiles[0]?.email_contacto ?? null, c.serie, perfiles[0]?.email_open ?? null),
    }}
  />,
);
writeFileSync(SALIDA, buffer);
console.log(`${SALIDA} · ${Math.round(buffer.length / 1024)} KB · ${itemsPdf.length} equipo(s) · serie ${c.serie}`);
await bd.end();
}
main();
