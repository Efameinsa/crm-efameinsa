// Sube las copias aligeradas de los presupuestos al bucket privado de
// Cloudflare R2 y guarda la ruta de cada una en `cotizaciones_historicas`.
//
// Por qué R2 y no Supabase: el plan gratuito de Supabase da 1 GB de archivos y
// esto ocupa cerca de 1,8 GB. R2 regala 10 GB y no cobra la salida de datos
// nunca, así que abrir cotizaciones desde el CRM no genera factura. El bucket
// es PRIVADO: nadie llega a un archivo sin una URL firmada por el servidor.
//
// Lee el manifiesto que dejó scripts/comprimir-cotizaciones.mjs, así que
// nunca toca las unidades de red ni los originales.
//
// Es reanudable: antes de subir pregunta si el objeto ya está con el mismo
// tamaño. Cortar el proceso a la mitad y volver a correrlo no repite trabajo.
//
// Uso:
//   node --env-file=.env.local scripts/subir-cotizaciones-r2.mjs
//        [--origen RUTA] [--limite 20] [--sin-base]

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Client } from "pg";

const arg = (n, x = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : x;
};
const ORIGEN = resolve(arg("origen", "C:/Users/diseno/cotizaciones-comprimidas"));
const LIMITE = arg("limite") ? Number(arg("limite")) : Infinity;
const SIN_BASE = process.argv.includes("--sin-base");
const CONCURRENCIA = Number(arg("hilos", 12));

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, DATABASE_URL } = process.env;
if (!R2_ACCOUNT_ID || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Faltan las variables R2_* en .env.local");
  process.exit(1);
}

const manifiestoRuta = join(ORIGEN, "manifiesto.json");
if (!existsSync(manifiestoRuta)) {
  console.error(`No encontré ${manifiestoRuta}. Corra antes scripts/comprimir-cotizaciones.mjs`);
  process.exit(1);
}
const manifiesto = JSON.parse(readFileSync(manifiestoRuta, "utf8"));
// Las más recientes primero: con la subida de la oficina esto tarda horas, y
// si hay que cortarlo a la mitad conviene que lo ya subido sea 2026 — que es
// lo que el comercial va a abrir mañana.
const anio = (clave) => Number(clave.match(/\/(\d{4})\//)?.[1] ?? 0);
const entradas = Object.entries(manifiesto)
  .sort((a, b) => anio(b[0]) - anio(a[0]) || a[0].localeCompare(b[0]))
  .slice(0, LIMITE);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const bd = SIN_BASE ? null : new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
if (bd) await bd.connect();

console.log(`${entradas.length} archivos · bucket ${R2_BUCKET} (privado)\nOrigen: ${ORIGEN}\n`);

let subidos = 0, saltados = 0, fallidos = 0, bytes = 0;
const porEnlazar = [];
const fallos = [];

async function procesar([clave, info]) {
  const ruta = join(ORIGEN, clave);
  if (!existsSync(ruta)) { fallidos++; fallos.push([clave, "no está el archivo"]); return; }
  const tam = statSync(ruta).size;

  try {
    let existe = false;
    try {
      const h = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: clave }));
      existe = h.ContentLength === tam;
    } catch { existe = false; }

    if (existe) saltados++;
    else {
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: clave,
        Body: createReadStream(ruta),
        ContentLength: tam,
        ContentType: "application/pdf",
        // Metadatos útiles al depurar sin tener que abrir el archivo.
        Metadata: { serie: info.serie, archivo: encodeURIComponent(info.archivo).slice(0, 200) },
      }));
      subidos++;
    }
    bytes += tam;

    // El enlace con la base se hace al final y en bloque: una consulta por
    // archivo, sobre una sola conexión, serializa a los seis que suben y
    // convierte la red de Supabase en el cuello de botella.
    porEnlazar.push({ clave, bytes: tam, archivo: info.archivo, serie: info.serie });
  } catch (e) {
    fallidos++;
    fallos.push([clave, e.message.slice(0, 90)]);
  }
}

const t0 = Date.now();
let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCIA }, async () => {
    while (i < entradas.length) {
      await procesar(entradas[i++]);
      const n = subidos + saltados + fallidos;
      if (n % 250 === 0) {
        const min = (Date.now() - t0) / 60000;
        console.log(`  ${n}/${entradas.length} · ${(bytes / 1048576).toFixed(0)} MB · ${(n / min).toFixed(0)} archivos/min`);
      }
    }
  }),
);

console.log(
  `\nSubidos ${subidos} · ya estaban ${saltados} · fallaron ${fallidos}\n` +
    `${(bytes / 1048576).toFixed(0)} MB en el bucket · ${((Date.now() - t0) / 60000).toFixed(1)} min`,
);
if (bd) {
  // En bloques de mil: una consulta por archivo sobre una sola conexión
  // serializa a los que están subiendo y convierte a la base en el cuello.
  let enlazados = 0;
  for (let j = 0; j < porEnlazar.length; j += 1000) {
    const lote = porEnlazar.slice(j, j + 1000);
    const { rowCount } = await bd.query(
      `update cotizaciones_historicas ch set pdf_path = v.clave, pdf_bytes = v.bytes
       from (select * from unnest($1::text[], $2::int[], $3::text[], $4::text[])
               as t(clave, bytes, archivo, serie)) v
       where ch.archivo = v.archivo and ch.serie = v.serie::serie_cotizacion
         and (ch.pdf_path is distinct from v.clave or ch.pdf_bytes is distinct from v.bytes)`,
      [lote.map((x) => x.clave), lote.map((x) => x.bytes), lote.map((x) => x.archivo), lote.map((x) => x.serie)],
    );
    enlazados += rowCount;
  }
  console.log(`Cotizaciones enlazadas en la base: ${enlazados} (sobre ${porEnlazar.length} archivos)`);
  const { rows } = await bd.query(
    "select count(*) filter (where pdf_path is not null)::int con_pdf, count(*)::int total from cotizaciones_historicas",
  );
  console.log(`En total: ${rows[0].con_pdf} de ${rows[0].total} cotizaciones con PDF disponible.`);
  await bd.end();
}
if (fallos.length) {
  console.log("\nPrimeros fallos:");
  for (const [k, e] of fallos.slice(0, 10)) console.log(`  ${k} — ${e}`);
}
