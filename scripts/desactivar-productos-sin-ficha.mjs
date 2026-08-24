// ============================================================
// CRM EFAMEINSA · Sacar del cotizador los equipos que no tienen ficha
// ============================================================
// Darwin, 24-08: «Brenda encontró LG TITAN-18 lavadora industrial de carga
// frontal a 9800. ¿De dónde salió, si no está en las fichas?»
//
// De la semilla del piloto. El 14-08, para poder probar el cotizador antes de
// que existiera el catálogo, se cargaron tres equipos de ejemplo con precios
// puestos a mano. El catálogo de verdad entró el 22-08: 58 equipos con SKU,
// ficha extraída del .docx de Lesly y precio del maestro. Los tres de prueba
// se quedaron ahí, sin SKU, sin ficha y sin foto — pero visibles en el
// buscador y con precio, así que se pueden cotizar.
//
// Y se cotizaron: la LG TITAN-18 está en dos borradores reales de un cliente.
// Un equipo así sale al cliente con la página de especificaciones en blanco y
// un precio que nadie fijó. No hay LG industrial de carga frontal de 18 kg en
// el catálogo real; lo más cercano son las PRIMUS RX180 de 18 kg.
//
// El criterio para desactivar es objetivo, no una lista escrita a mano: un
// equipo sin NINGUNA característica en su ficha no se puede cotizar bien.
// No se borra nada — `activo = false` solo lo saca del buscador; las
// cotizaciones que ya lo usan siguen intactas y se pueden abrir.
//
// Uso: node --env-file=.env.local scripts/desactivar-productos-sin-ficha.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: sinFicha } = await bd.query(`
  select p.id, p.sku, p.marca, p.modelo, p.nombre, p.capacidad, p.foto_path,
         (select precio from precios_producto pp
           where pp.producto_id = p.id and pp.vigente_hasta is null limit 1) precio,
         (select count(*) from cotizacion_items ci where ci.producto_id = p.id) usos
  from productos p
  where p.activo
    and jsonb_array_length(coalesce(p.ficha->'caracteristicas', '[]'::jsonb)) = 0
  order by p.marca, p.modelo`);

if (sinFicha.length === 0) {
  console.log("Todos los equipos activos tienen ficha. Nada que hacer.");
  await bd.end();
  process.exit(0);
}

console.log(`${sinFicha.length} equipo(s) activo(s) sin ninguna característica en su ficha:\n`);
for (const p of sinFicha) {
  console.log(
    `  ${(p.sku ?? "sin SKU").padEnd(9)} ${p.marca} ${p.modelo} — ${p.nombre}` +
      `\n      capacidad ${p.capacidad ?? "—"} · precio ${p.precio ?? "—"} · foto ${p.foto_path ?? "no"} · en ${p.usos} ítem(s) de cotización`,
  );
}

// Lo que ya se cotizó con estos equipos hay que mirarlo a mano: no lo arregla
// un script, lo arregla el comercial cambiando el equipo del borrador.
const { rows: enUso } = await bd.query(`
  select p.marca || ' ' || p.modelo equipo, coalesce(c.codigo, 'borrador') documento,
         c.estado, cu.razon_social cliente, pf.nombre comercial
  from cotizacion_items ci
  join productos p on p.id = ci.producto_id
  join cotizaciones c on c.id = ci.cotizacion_id
  join oportunidades o on o.id = c.oportunidad_id
  join cuentas cu on cu.id = o.cuenta_id
  left join perfiles pf on pf.id = o.comercial_id
  where p.id = any($1::uuid[])
  order by c.created_at`,
  [sinFicha.map((p) => p.id)],
);

if (enUso.length > 0) {
  console.log(`\n⚠ Ya se usaron en ${enUso.length} cotización(es) — hay que corregirlas a mano:`);
  for (const u of enUso) {
    console.log(`  ${u.equipo} → ${u.documento} (${u.estado}) · ${u.cliente} · ${u.comercial ?? "sin comercial"}`);
  }
}

if (!APLICAR) {
  console.log("\n(Simulación: no se cambió nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

const { rowCount } = await bd.query(`update productos set activo = false, updated_at = now() where id = any($1::uuid[])`, [
  sinFicha.map((p) => p.id),
]);
console.log(`\n✓ ${rowCount} equipo(s) desactivado(s): salen del buscador del cotizador.`);
console.log("  Para volver a activarlos, cárgueles la ficha primero.");

await bd.end();
