// Genera una cotización de MUESTRA con productos reales de la base, para
// revisar cómo queda maquetada antes de que un comercial la use.
//
// No toca datos: lee productos y arma el PDF en scripts/data/. Sirve para
// ver el membrete, la tabla de equipos y las fichas con foto y
// características tal como saldrán impresas.
//
// Uso: npx tsx scripts/muestra-cotizacion.tsx [sku...]
// (lee .env.local por su cuenta: este script corre con tsx, que se invoca por
//  npx y no propaga el --env-file de node)

import { readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { Client } from "pg";
import { CotizacionPdf } from "../src/lib/pdf/cotizacion-pdf";

// El valor puede traer "=" adentro (la contraseña del pooler los tiene), así
// que se corta solo en el primer signo.
if (!process.env.DATABASE_URL) {
  for (const linea of readFileSync(".env.local", "utf-8").split("\n")) {
    const i = linea.indexOf("=");
    if (i > 0 && !linea.trimStart().startsWith("#")) {
      process.env[linea.slice(0, i).trim()] ??= linea.slice(i + 1).trim();
    }
  }
}

const SALIDA = "scripts/data/muestra-cotizacion.pdf";
const leer = (p: string) => {
  try {
    return readFileSync(join(process.cwd(), "public", p));
  } catch {
    return null;
  }
};

// Por defecto: una lavadora, una secadora y un planchador, que es la mezcla
// típica de una cotización real de lavandería.
const SKUS = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const PEDIDOS = SKUS.length ? SKUS : ["LAV240", "SECU752", "CAL2635"];

interface FilaProducto {
  sku: string;
  marca: string;
  modelo: string;
  nombre: string;
  categoria: string | null;
  capacidad: string | null;
  foto_path: string | null;
  ficha: Record<string, unknown>;
  precio: string | null;
}

async function main() {
  const cliente = new Client({ connectionString: process.env.DATABASE_URL });
  await cliente.connect();
  const { rows } = await cliente.query<FilaProducto>(
    `select p.sku, p.marca, p.modelo, p.nombre, p.categoria, p.capacidad, p.foto_path, p.ficha,
            (select pr.precio from precios_producto pr
              where pr.producto_id = p.id and pr.vigente_hasta is null
              order by pr.vigente_desde desc limit 1) as precio
       from productos p
      where p.sku = any($1)`,
    [PEDIDOS],
  );
  await cliente.end();

  if (rows.length === 0) {
    console.error("Ningún SKU de", PEDIDOS.join(", "), "está en la base.");
    process.exit(1);
  }

  const lista = (f: Record<string, unknown>, k: string) => (Array.isArray(f?.[k]) ? (f[k] as string[]) : []);

  const items = rows.map((p) => ({
    nombre: p.nombre,
    marca: p.marca,
    modelo: p.modelo,
    capacidad: p.capacidad,
    categoria: p.categoria,
    calentamiento: (p.ficha?.calentamiento as string) ?? null,
    panel: (p.ficha?.panel as string) ?? null,
    controles: (p.ficha?.controles as string) ?? null,
    caracteristicas: lista(p.ficha, "caracteristicas"),
    dimensiones: lista(p.ficha, "dimensiones"),
    medidas: lista(p.ficha, "medidas"),
    fotoBuffer: p.foto_path ? leer(join("productos", basename(p.foto_path))) : null,
    cantidad: 1,
    precio_unitario: Number(p.precio ?? 0),
  }));

  const buffer = await renderToBuffer(
    <CotizacionPdf
      logoBuffer={leer("logo-efameinsa.png")!}
      membreteBuffer={leer("membrete-efameinsa-encabezado.png")}
      pieBuffer={leer("membrete-efameinsa-pie.png")}
      serie="EFAMEINSA"
      numeroDocumento="MUESTRA-26"
      fecha={new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
      cliente={{
        razon_social: "LAVANDERÍA INDUSTRIAL DEL SUR S.A.C.",
        tipo_doc: "RUC",
        num_doc: "20512345678",
        direccion: "Av. Los Próceres 1420, Surco - Lima",
        telefono: "(01) 748-2210",
        email: "compras@lavanderiadelsur.com.pe",
        atencion: "Sra. Mónica Salazar — Jefatura de Operaciones",
      }}
      items={items}
      moneda="USD"
      condiciones={null}
      vigenciaDias={15}
      firma={{
        nombre: "Katerine Tello",
        telefono: "371-0006",
        celular: "981 488 958",
        email: "comercial5@efameinsa.com",
      }}
    />,
  );

  writeFileSync(SALIDA, buffer);
  console.log(`${SALIDA}  ·  ${(buffer.length / 1024).toFixed(0)} KB`);
  for (const [i, p] of rows.entries()) {
    console.log(
      `  ${i + 1}. ${p.sku.padEnd(11)} ${p.marca.padEnd(9)} ${String(p.capacidad ?? "").padEnd(9)} US$ ${Number(p.precio ?? 0).toLocaleString("es-PE")}` +
        `  ${lista(p.ficha, "caracteristicas").length} caract · ${p.foto_path ? "con foto" : "SIN FOTO"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
