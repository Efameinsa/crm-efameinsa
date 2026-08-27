// ============================================================
// CRM EFAMEINSA · Paso 9 · Las 116 cotizaciones, para mirarlas en local
// ============================================================
// Genera un PDF por ficha —una cotización de un solo equipo, con el mismo
// componente que usa el sistema— y un índice HTML para recorrerlas. Así se ve
// cómo va quedando cada producto antes de aplicar nada a la base.
//
// Todo sale de scripts/data/fichas-v/: no toca la base ni el catálogo.
//
// Uso: npx tsx scripts/fichas-v-09-todas.tsx [CODIGO...]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { CotizacionPdf, type ItemPdf, type BloqueFicha } from "../src/lib/pdf/cotizacion-pdf";

const DIR = "scripts/data/fichas-v/pdf";
const FICHAS = "scripts/data/fichas-v/fichas.json";
const IMAGENES = "scripts/data/fichas-v/imagenes-listas.json";
const CLASIFICACION = "scripts/data/fichas-v/clasificacion.json";

type Ficha = {
  codigo: string;
  equipo: string;
  marca: string;
  precio: number | null;
  stock: number | null;
  cabecera: Record<string, string>;
  bloques: BloqueFicha[];
};

const { fichas } = JSON.parse(readFileSync(FICHAS, "utf-8")) as { fichas: Ficha[] };
const { fichas: imagenes } = JSON.parse(readFileSync(IMAGENES, "utf-8")) as {
  fichas: { codigo: string; imagenes: { rol: string; archivo: string; ppp: number }[]; notas: string[] }[];
};
const { fichas: clasificadas } = JSON.parse(readFileSync(CLASIFICACION, "utf-8")) as {
  fichas: { codigo: string; avisos: string[]; origen: string }[];
};

const soloIndice = process.argv.includes("--indice");
const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((c) => c.toUpperCase());
const elegidas = pedidos.length ? fichas.filter((f) => pedidos.includes(f.codigo)) : fichas;
mkdirSync(DIR, { recursive: true });

const leer = (ruta: string | undefined) => (ruta && existsSync(ruta) ? readFileSync(ruta) : null);
const logo = leer(join("public", "logo-efameinsa.png"))!;

function itemDe(f: Ficha): ItemPdf {
  const imgs = imagenes.find((i) => i.codigo === f.codigo)?.imagenes ?? [];
  const de = (rol: string) => leer(imgs.find((i) => i.rol === rol)?.archivo);
  return {
    // El Excel guarda la descripción larga entera; el título del ítem lleva lo
    // que va antes de la primera coma y el resto ya está en las columnas.
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
}

async function main() {
  const hechas: { codigo: string; archivo: string; kb: number }[] = [];

  for (const [i, f] of soloIndice ? [] : elegidas.entries()) {
    const buffer = await renderToBuffer(
      <CotizacionPdf
        logoBuffer={logo}
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
        items={[itemDe(f)]}
        moneda="USD"
        condiciones={null}
        vigenciaDias={15}
        entregaLugar={null}
        firma={{
          nombre: "Comercial de pruebas",
          cargo: "Área Comercial",
          telefono: "371-0006",
          celular: "981 488 958",
          email: "comercial@efameinsa.com",
        }}
      />,
    );
    const archivo = `${f.codigo}.pdf`;
    writeFileSync(join(DIR, archivo), buffer);
    hechas.push({ codigo: f.codigo, archivo, kb: Math.round(buffer.length / 1024) });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${elegidas.length}`);
  }

  // ---------- índice ----------
  const filas = elegidas
    .map((f) => {
      const info = imagenes.find((i) => i.codigo === f.codigo);
      const sinFotoAhora = !imagenes.find((i) => i.codigo === f.codigo)?.imagenes.some((i) => i.rol === "producto");
      // Los avisos de la clasificación son de ANTES del recorte: si la ficha
      // terminó con foto, el «sin foto de equipo» ya no aplica.
      const avisos = (clasificadas.find((c) => c.codigo === f.codigo)?.avisos ?? []).filter(
        (a) => sinFotoAhora || !/sin foto|SIN FOTO PROPIA/i.test(a),
      );
      const composicion = info?.imagenes.map((i) => i.rol).join(" + ") || "SIN IMÁGENES";
      const cuenta = (t: string) => f.bloques.filter((b) => b.t === t).length;
      const sinFoto = sinFotoAhora;
      return `<tr class="${sinFoto ? "sinfoto" : ""}">
        <td><a href="pdf/${f.codigo}.pdf" target="visor"><b>${f.codigo}</b></a></td>
        <td>${f.marca ?? ""}</td>
        <td class="eq">${f.equipo}</td>
        <td class="num">${f.precio ? `US$ ${f.precio.toLocaleString("es-PE")}` : "—"}</td>
        <td>${composicion}</td>
        <td class="num">${cuenta("titulo")}/${cuenta("subtitulo")}/${cuenta("vineta")}/${cuenta("dato")}</td>
        <td class="av">${[...(info?.notas ?? []), ...avisos].join(" · ")}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="es"><meta charset="utf-8">
<title>Fichas del Excel · cotizaciones de prueba</title>
<style>
  body { font: 13px/1.45 Segoe UI, Arial, sans-serif; margin: 0; display: flex; height: 100vh; }
  #lista { width: 52%; overflow: auto; padding: 14px 16px; }
  #visor { width: 48%; border: 0; border-left: 1px solid #ddd; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  p.sub { color: #666; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 1px solid #ccc; padding: 5px 6px; position: sticky; top: 0; background: #fff; }
  td { border-bottom: 1px solid #eee; padding: 5px 6px; vertical-align: top; }
  td.eq { color: #444; max-width: 260px; }
  td.num { text-align: right; white-space: nowrap; }
  td.av { color: #b45309; font-size: 11px; }
  tr.sinfoto td:first-child { border-left: 3px solid #b91c1c; }
  a { color: #7E1210; text-decoration: none; } a:hover { text-decoration: underline; }
</style>
<div id="lista">
  <h1>Fichas técnicas del Excel · ${elegidas.length} cotizaciones de prueba</h1>
  <p class="sub">Clic en el código para ver el PDF. La barra roja marca las fichas sin foto del equipo.
     La columna de números es títulos/subtítulos/viñetas/datos leídos del Word.</p>
  <table>
    <tr><th>Código</th><th>Marca</th><th>Equipo</th><th>Precio</th><th>Imágenes</th><th>T/S/V/D</th><th>Notas</th></tr>
    ${filas}
  </table>
</div>
<iframe id="visor" name="visor" src="pdf/${elegidas[0]?.codigo}.pdf"></iframe>
</html>`;

  writeFileSync("scripts/data/fichas-v/index.html", html);
  console.log(`\n${hechas.length} PDF en ${DIR}`);
  console.log(`Índice: scripts/data/fichas-v/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
