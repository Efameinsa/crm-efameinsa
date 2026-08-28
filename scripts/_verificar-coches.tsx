// Verifica, con los datos REALES de la base y el mismo código que corre en la
// pantalla, que el comercial encuentra los coches y los ve con su ficha.
// Uso: npx tsx --env-file=.env.local scripts/_verificar-coches.tsx
import { Client } from "pg";
import { buscarEquipos } from "../src/lib/buscar-equipo";

async function main() {
const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const { rows } = await bd.query(
  `select p.sku, p.marca, p.modelo, p.nombre, p.capacidad, p.ficha, p.foto_path
     from productos p where p.activo order by p.sku`,
);
await bd.end();

// Lo mismo que hace mapearProducto para la búsqueda y para el aviso.
const equipos = rows.map((p) => {
  const ficha = p.ficha ?? {};
  const bloques = Array.isArray(ficha.bloques) ? ficha.bloques : [];
  const caracteristicas = bloques.filter((b: { t?: string }) => b.t !== "dato");
  const datos = bloques.filter((b: { t?: string }) => b.t === "dato");
  return {
    sku: p.sku,
    marca: p.marca,
    modelo: p.modelo,
    nombre: p.nombre,
    capacidad: p.capacidad,
    calentamiento: ficha.calentamiento ?? null,
    descripcion: [ficha.descripcion_maestro, ficha.nombre_ficha].filter(Boolean).join(" · ") || null,
    nCaracteristicas: caracteristicas.length,
    nDatos: datos.length,
    sinFicha: caracteristicas.length + datos.length === 0,
    sinFoto: !p.foto_path,
  };
});

for (const consulta of ["coche", "coche de transporte", "carro de lavanderia", "hm 402", "coche blanco", "co408"]) {
  const r = buscarEquipos(equipos, consulta).slice(0, 6);
  console.log(`\n«${consulta}» → ${r.length ? r.map((e) => e.sku).join(", ") : "NADA"}`);
}

console.log("\nEstado de los coches:");
for (const e of equipos.filter((x) => x.sku?.startsWith("CO4"))) {
  console.log(
    `  ${e.sku?.padEnd(8)} ${e.nCaracteristicas} caract · ${e.nDatos} medidas · ` +
      `${e.sinFicha ? "⚠ SIN FICHA" : "con ficha"} · ${e.sinFoto ? "⚠ sin foto" : "con foto"}`,
  );
}
const sinFicha = equipos.filter((e) => e.sinFicha);
console.log(`\nActivos que la pantalla marcaría «sin ficha»: ${sinFicha.length} ${sinFicha.map((e) => e.sku).join(", ")}`);
}
main();
