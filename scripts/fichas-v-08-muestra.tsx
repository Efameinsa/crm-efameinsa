// ============================================================
// CRM EFAMEINSA · Paso 8 · La cotización de prueba, en local
// ============================================================
// Arma un PDF de cotización con lo leído de las fichas del Excel de Lesly —
// descripción fiel (paso 3), imágenes clasificadas y preparadas (pasos 4 a 7) —
// usando el MISMO componente que el sistema, `CotizacionPdf`.
//
// NO toca la base ni el catálogo del CRM: todo sale de los JSON de
// scripts/data/fichas-v/. Es la manera de ver cómo va quedando antes de
// aplicar nada, que es lo que pidió Darwin.
//
// Uso: npx tsx scripts/fichas-v-08-muestra.tsx CODIGO [CODIGO...] [salida.pdf]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CotizacionPdf, type ItemPdf, type BloqueFicha } from "../src/lib/pdf/cotizacion-pdf";

const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";

const argumentos = process.argv.slice(2);
const salida = argumentos.find((a) => a.toLowerCase().endsWith(".pdf")) ?? "scripts/data/fichas-v/muestra.pdf";
const codigos = argumentos.filter((a) => !a.toLowerCase().endsWith(".pdf")).map((c) => c.toUpperCase());

const { fichas } = JSON.parse(readFileSync(FICHAS, "utf-8")) as {
  fichas: {
    codigo: string;
    equipo: string;
    marca: string;
    precio: number | null;
    cabecera: Record<string, string>;
    bloques: BloqueFicha[];
  }[];
};
const { fichas: imagenes } = JSON.parse(readFileSync(IMAGENES, "utf-8")) as {
  fichas: { codigo: string; imagenes: { rol: string; archivo: string }[] }[];
};

const leer = (ruta: string | undefined) => (ruta && existsSync(ruta) ? readFileSync(ruta) : null);

const elegidas = codigos.length ? fichas.filter((f) => codigos.includes(f.codigo)) : fichas.slice(0, 4);
if (elegidas.length === 0) {
  console.error(`No hay ninguna ficha con esos códigos. Ej.: SECU1202 CALM18 CO401`);
  process.exit(1);
}

const items: ItemPdf[] = elegidas.map((f) => {
  const imgs = imagenes.find((i) => i.codigo === f.codigo)?.imagenes ?? [];
  const de = (rol: string) => leer(imgs.find((i) => i.rol === rol)?.archivo);
  return {
    // El Excel de Lesly guarda la descripción larga entera («SECADORA
    // INDUSTRIAL, MOD: UT120L, CAP: 55KG, CONTROL:…»); el título del ítem lleva
    // solo el nombre, que es lo que va antes de la primera coma. El resto ya
    // está en las columnas de la ficha.
    nombre: f.equipo.split(",")[0].trim(),
    marca: f.cabecera.marca ?? f.marca ?? "—",
    modelo: f.cabecera.modelo ?? "—",
    capacidad: f.cabecera.capacidad ?? null,
    categoria: null,
    calentamiento: f.cabecera.calentamiento ?? null,
    panel: f.cabecera.panel ?? null,
    controles: f.cabecera.controles ?? null,
    colores: [],
    color: null,
    // Los cuatro cajones viejos van vacíos: manda `bloques`.
    caracteristicas: [],
    caracteristicasTitulo: null,
    disenoConstruccion: [],
    dimensiones: [],
    dimensionesTitulo: null,
    medidas: [],
    medidasTitulo: null,
    ordenSecciones: null,
    bloques: f.bloques,
    fotoBuffer: de("producto"),
    logoMarcaBuffer: de("logo"),
    panelImagenBuffer: de("panel"),
    cantidad: 1,
    precio_unitario: Number(f.precio ?? 0),
  };
});

async function main() {
const buffer = await renderToBuffer(
  <CotizacionPdf
    logoBuffer={leer(join("public", "logo-efameinsa.png"))!}
    serie="EFAMEINSA"
    numeroDocumento="PRUEBA-26"
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
console.log(`${salida}  ·  ${(buffer.length / 1024).toFixed(0)} KB  ·  ${items.length} equipo(s)`);
for (const f of elegidas) {
  const imgs = imagenes.find((i) => i.codigo === f.codigo)?.imagenes ?? [];
  const cuenta = (t: string) => f.bloques.filter((b) => b.t === t).length;
  console.log(
    `  · ${f.codigo.padEnd(11)} ${cuenta("titulo")} títulos · ${cuenta("subtitulo")} subtítulos · ` +
      `${cuenta("vineta")} viñetas · ${cuenta("dato")} datos · imágenes: ${imgs.map((i) => i.rol).join("+") || "ninguna"}`,
  );
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
