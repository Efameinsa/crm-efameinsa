/**
 * Recupera teléfonos que el CRM ya tiene guardados en otro lado.
 *
 * El área comercial reportó (07-09-2026) que muchos clientes figuran solo con
 * nombre o RUC, sin teléfono. Medido: de 16.358 clientes, 3.120 no tienen
 * ninguno. Pero 492 de esos SÍ dejaron su número en una cotización antigua —
 * el dato estaba en el sistema, en otra tabla, sin que nadie lo viera desde la
 * ficha.
 *
 * Esto NO inventa números: solo copia los que ya existen. Los otros ~2.600 no
 * tienen el teléfono en ninguna parte del CRM y necesitan otra fuente (el ERP,
 * las guías de remisión) o trabajo a mano.
 *
 * Sin --aplicar ensaya y revierte.
 */
import { Client } from "pg";
const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

await bd.query("begin");
try {
  const { rows: antes } = await bd.query(
    `select count(*) n from cuentas c
      where not exists (select 1 from contactos k where k.cuenta_id = c.id and coalesce(k.telefono,'') <> '')`);

  // El más reciente de cada cliente: si dejó dos números en años distintos,
  // el último es el que probablemente sigue contestando.
  const r = await bd.query(`
    insert into contactos (cuenta_id, nombre, cargo, telefono, es_principal)
    select distinct on (h.cuenta_id)
           h.cuenta_id,
           coalesce(nullif(btrim(h.atencion), ''), 'Contacto de cotización anterior'),
           'Recuperado de una cotización anterior',
           btrim(h.telefono),
           false
      from cotizaciones_historicas h
      join cuentas c on c.id = h.cuenta_id
     where coalesce(h.telefono,'') <> ''
       and not exists (select 1 from contactos k where k.cuenta_id = h.cuenta_id and coalesce(k.telefono,'') <> '')
     order by h.cuenta_id, h.fecha desc nulls last
    returning cuenta_id`);

  const { rows: despues } = await bd.query(
    `select count(*) n from cuentas c
      where not exists (select 1 from contactos k where k.cuenta_id = c.id and coalesce(k.telefono,'') <> '')`);

  console.log(`clientes sin teléfono antes:   ${antes[0].n}`);
  console.log(`teléfonos recuperados:         ${r.rowCount}`);
  console.log(`clientes sin teléfono después: ${despues[0].n}`);

  if (APLICAR) { await bd.query("commit"); console.log("\nAPLICADO"); }
  else { await bd.query("rollback"); console.log("\n(ensayo revertido)"); }
} catch (e) {
  await bd.query("rollback");
  console.log("revertido por error:", e.message.slice(0, 200));
}
await bd.end();
