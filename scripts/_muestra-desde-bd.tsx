// Una cotización de prueba con productos REALES de la base, para ver cómo sale
// impreso lo que se acaba de cargar (el PDF de verdad usa este mismo componente).
//
// Uso: npx tsx --env-file=.env.local scripts/_muestra-desde-bd.tsx SKU [SKU...] [salida.pdf]
import { Client } from "pg";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CotizacionPdf, type ItemPdf, type BloqueFicha } from "../src/lib/pdf/cotizacion-pdf";

const argumentos = process.argv.slice(2);
const salida = argumentos.find((a) => a.toLowerCase().endsWith(".pdf")) ?? "scripts/data/fichas-v/muestra-bd.pdf";
const skus = argumentos.filter((a) => !a.toLowerCase().endsWith(".pdf")).map((s) => s.toUpperCase());

const leer = (ruta: string | undefined) => (ruta && existsSync(ruta) ? readFileSync(ruta) : null);
const foto = (p: string | null) => (p ? leer(join("public", p)) : null);

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL });
  await bd.connect();
  const { rows } = await bd.query(
    `select p.sku, p.marca, p.modelo, p.nombre, p.capacidad, p.categoria, p.ficha, p.foto_path,
            (select precio from precios_producto x where x.producto_id = p.id and x.vigente_hasta is null) precio
       from productos p where p.sku = any($1)`,
    [skus],
  );
  await bd.end();

  const items: ItemPdf[] = skus.map((sku) => {
    const p = rows.find((r) => r.sku.toUpperCase() === sku);
    if (!p) throw new Error(`No existe el producto ${sku}`);
    const ficha = p.ficha ?? {};
    return {
      nombre: p.nombre,
      marca: p.marca,
      modelo: p.modelo,
      capacidad: p.capacidad,
      categoria: p.categoria,
      montaje: ficha.montaje ?? null,
      calentamiento: ficha.calentamiento ?? null,
      panel: ficha.panel ?? null,
      controles: ficha.controles ?? null,
      colores: [],
      color: null,
      caracteristicas: [],
      caracteristicasTitulo: null,
      disenoConstruccion: [],
      dimensiones: [],
      dimensionesTitulo: null,
      medidas: [],
      medidasTitulo: null,
      ordenSecciones: null,
      bloques: (Array.isArray(ficha.bloques) ? ficha.bloques : []) as BloqueFicha[],
      fotoBuffer: foto(p.foto_path),
      logoMarcaBuffer: foto(`/productos/${sku.toLowerCase()}-logo.png`),
      panelImagenBuffer: foto(`/productos/${sku.toLowerCase()}-panel.png`),
      cantidad: 1,
      precio_unitario: Number(p.precio ?? 0),
    } as ItemPdf;
  });

  const buffer = await renderToBuffer(
    <CotizacionPdf
      logoBuffer={leer(join("public", "logo-efameinsa.png"))!}
      serie="EFAMEINSA"
      numeroDocumento="PRUEBA-BD"
      fecha={new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
      cliente={{
        razon_social: "LAVANDERÍA DE PRUEBA S.A.C.",
        tipo_doc: "RUC",
        num_doc: "20512345678",
        direccion: "Av. Los Próceres 1420, Surco - Lima",
        telefono: "(01) 748-2210",
        email: "compras@ejemplo.com.pe",
        atencion: "Área de Compras",
      }}
      items={items}
      moneda="USD"
      condiciones={null}
      vigenciaDias={15}
      entregaLugar={null}
      garantia={null}
      tiempoEntrega={null}
      formaPago={null}
      saldo={null}
      firma={{
        nombre: "Comercial de pruebas",
        cargo: "Área Comercial",
        telefono: "371-0006",
        celular: "981 488 958",
        email: "comercial@efameinsa.com",
      }}
    />,
  );
  writeFileSync(salida, buffer);
  console.log(`${salida} · ${(buffer.length / 1024).toFixed(0)} KB · ${items.length} equipo(s)`);
}

main();
