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
import { CotizacionPdf, type ItemPdf, type SeccionFicha } from "../src/lib/pdf/cotizacion-pdf";
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
          c.cliente_snapshot, c.created_at, c.oportunidad_id, c.creada_por
     from cotizaciones c where c.id = $1`,
  [ID],
);
if (cots.length === 0) throw new Error("No existe esa cotización");
const c = cots[0];

const { rows: items } = await bd.query(
  `select i.cantidad, i.precio_unitario, i.descripcion,
          p.marca, p.modelo, p.nombre, p.capacidad, p.categoria, p.ficha, p.foto_path
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
function secciones(f: Record<string, unknown> | null): SeccionFicha[] | undefined {
  const v = f?.secciones;
  if (!Array.isArray(v) || v.length < 2) return undefined;
  return v.map((s) => {
    const sec = s as Record<string, unknown>;
    return {
      titulo: typeof sec.titulo === "string" ? sec.titulo : null,
      caracteristicas: lista(sec, "caracteristicas"),
      dimensiones: lista(sec, "dimensiones"),
      medidas: lista(sec, "medidas"),
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

const itemsPdf: ItemPdf[] = items.map((i) => ({
  nombre: i.nombre ?? i.descripcion ?? "Producto",
  marca: i.marca ?? "—",
  modelo: i.modelo ?? "—",
  capacidad: i.capacidad ?? null,
  categoria: i.categoria ?? null,
  calentamiento: texto(i.ficha, "calentamiento"),
  panel: texto(i.ficha, "panel"),
  controles: texto(i.ficha, "controles"),
  caracteristicas: lista(i.ficha, "caracteristicas"),
  dimensiones: lista(i.ficha, "dimensiones"),
  medidas: lista(i.ficha, "medidas"),
  secciones: secciones(i.ficha),
  fotoBuffer: foto(i.foto_path),
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
