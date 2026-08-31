// Llena el índice `carpetas_servidor` (0135) con el PRIMER nivel de las
// carpetas de cliente del servidor de la oficina. Solo nombres de carpeta:
// nunca archivos, nunca contenido. Corre desde una máquina de la oficina con
// las unidades mapeadas (W: fotos, X: informes) — Vercel no ve esa red.
//
// Volver a correrlo refresca el índice (upsert por ruta y borra lo que ya no
// existe). Tarda segundos: hay que repetirlo cuando Lesly cree carpetas
// nuevas de cliente.
//
// Uso: node --env-file=.env.local scripts/indexar-carpetas-servidor.mjs
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// Cada raíz aporta carpetas de UNA clase. Las rutas se guardan tal como las
// ve el servicio de archivos (letra de unidad de la oficina).
const RAICES = [
  { base: "X:\\S. PRIVADO", clase: "informes" },
  { base: "X:\\S. PUBLICO", clase: "informes" },
  { base: "W:\\FOTOS\\PRIVADO", clase: "fotos" },
  { base: "W:\\FOTOS\\PUBLICO", clase: "fotos" },
];

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const filas = [];
for (const { base, clase } of RAICES) {
  let nombres;
  try {
    nombres = readdirSync(base);
  } catch (e) {
    console.log(` ✗ no se pudo leer ${base}: ${e.message} (¿unidad sin mapear?)`);
    continue;
  }
  let n = 0;
  for (const nombre of nombres) {
    if (nombre.startsWith("~") || nombre.toLowerCase() === "thumbs.db") continue;
    try {
      if (!statSync(join(base, nombre)).isDirectory()) continue;
    } catch {
      continue;
    }
    filas.push({ ruta: `${base}\\${nombre}`, nombre, clase });
    n++;
  }
  console.log(` ✓ ${base}: ${n} carpetas de ${clase}`);
}

await pg.query("begin");
// Borrar lo que ya no existe y reinsertar es más simple que un diff, y el
// índice entero cabe en una transacción de segundos.
await pg.query("delete from carpetas_servidor");
for (const f of filas) {
  await pg.query(
    `insert into carpetas_servidor (ruta, nombre, clase) values ($1,$2,$3)
     on conflict (ruta) do update set nombre = excluded.nombre, clase = excluded.clase, actualizado_at = now()`,
    [f.ruta, f.nombre, f.clase],
  );
}
await pg.query("commit");
console.log(`\nÍndice refrescado: ${filas.length} carpetas.`);
await pg.end();
