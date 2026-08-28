// Lo que ve el comercial: que cada equipo activo aparezca al buscarlo y llegue
// con su ficha y su foto. Uso: npx tsx --env-file=.env.local scripts/_verificar-cotizador.tsx
import { Client } from "pg";
import { buscarEquipos } from "../src/lib/buscar-equipo";
import { contenidoDeFicha } from "../src/lib/ficha-tecnica";

async function main() {
  const bd = new Client({ connectionString: process.env.DATABASE_URL });
  await bd.connect();
  const { rows } = await bd.query(
    "select sku, marca, modelo, nombre, capacidad, ficha, foto_path from productos where activo order by sku",
  );
  await bd.end();

  const equipos = rows.map((p) => ({
    sku: p.sku,
    marca: p.marca,
    modelo: p.modelo,
    nombre: p.nombre,
    capacidad: p.capacidad,
    calentamiento: p.ficha?.calentamiento ?? null,
    descripcion: [p.ficha?.descripcion_maestro, p.ficha?.nombre_ficha].filter(Boolean).join(" · ") || null,
    ...contenidoDeFicha(p.ficha),
    conFoto: Boolean(p.foto_path),
  }));

  for (const q of process.argv.slice(2).length ? process.argv.slice(2) : ["rx280", "lavadora 380v", "boiler fed", "lav2801"]) {
    console.log(`«${q}» → ${buscarEquipos(equipos, q).slice(0, 5).map((e) => e.sku).join(", ") || "NADA"}`);
  }
  const malas = equipos.filter((e) => e.sinFicha || !e.conFoto);
  console.log(`\nActivos: ${equipos.length}`);
  console.log(`Sin ficha o sin foto en la pantalla: ${malas.length ? malas.map((e) => e.sku).join(", ") : "ninguno"}`);
  // Y que cada uno se encuentre tecleando su propio código.
  const invisibles = equipos.filter((e) => !buscarEquipos(equipos, e.sku!).some((r) => r.sku === e.sku));
  console.log(`No aparecen ni buscando su código: ${invisibles.length ? invisibles.map((e) => e.sku).join(", ") : "ninguno"}`);
}
main();
