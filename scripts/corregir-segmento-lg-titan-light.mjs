// ============================================================
// CRM EFAMEINSA · Las TITAN LIGHT son semi-industriales, no industriales
// ============================================================
// Reportado el 24-08: una cotización de equipos semi-industriales pedía
// aprobación de gerencia sin motivo. El culpable era SECMAX152 (LG TITAN LIGHT
// SINGLE), marcado `industrial` en el CRM — y desde la migración 0067 todo
// industrial pasa por gerencia.
//
// POR QUÉ ESTABA MAL. El cargador del 22-08 decidía el segmento leyendo la
// descripción del maestro: si decía "SEMI INDUSTRIAL", semi; si no, industrial.
// Pero el maestro describe la MISMA línea LG de dos formas distintas:
//
//   LAVTMAX17  "LAVADORA SECADORA SEMI INDUSTRIAL TORRE A GAS TITAN MAX…"  → semi
//   SECMAX15   "SECADORA C., GAS, MARCA: LG, MOD.: TITAN LIGHT APILABLE…"  → industrial
//
// Son la misma familia y el mismo catálogo. El criterio objetivo está en el
// propio dato: `ficha.origen.catalogos` guarda de qué catálogo salió cada
// equipo, y el de estos dos es "Catalogo_equipos_semiindustriales_LG 2026.pdf".
// Con ese criterio son exactamente 2 los mal clasificados en todo el catálogo.
//
// ⚠️ NO BASTA CON CAMBIAR EL SEGMENTO. El tier del precio depende de él: un
// industrial guarda su precio en `base` y un semi-industrial en `optimo`. Si se
// cambiara solo el segmento, el cotizador buscaría el tier `optimo`, no lo
// encontraría y ofrecería el equipo en CERO. Por eso el precio se mueve junto
// con la clasificación.
//
// Uso: node --env-file=.env.local scripts/corregir-segmento-lg-titan-light.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// El criterio es el catálogo, no una lista escrita a mano: si mañana se cargan
// más equipos de ese mismo catálogo, este script los encuentra igual.
const { rows } = await bd.query(`
  select p.id, p.sku, p.marca, p.modelo, p.nombre, p.segmento,
         (select json_agg(json_build_object('tier', pp.tier, 'precio', pp.precio))
            from precios_producto pp
           where pp.producto_id = p.id and pp.vigente_hasta is null) precios
    from productos p
   where p.activo
     and p.segmento = 'industrial'
     and exists (
       select 1 from jsonb_array_elements_text(coalesce(p.ficha->'origen'->'catalogos', '[]'::jsonb)) c
        where c ilike '%semiindustriales%'
     )
   order by p.sku`);

if (rows.length === 0) {
  console.log("No hay equipos mal clasificados. Nada que hacer.");
  await bd.end();
  process.exit(0);
}

console.log(`${rows.length} equipo(s) del catálogo semi-industrial marcados como industrial:\n`);
for (const p of rows) {
  const precios = (p.precios ?? []).map((x) => `${x.tier}=${x.precio}`).join(" ");
  console.log(`  ${String(p.sku).padEnd(11)} ${p.marca} ${p.modelo} — ${String(p.nombre).slice(0, 40)}`);
  console.log(`     industrial → semi_industrial · precios ${precios || "(ninguno)"} → el de 'base' pasa a 'optimo'`);
}

if (!APLICAR) {
  console.log("\n(Simulación: no se escribió nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

for (const p of rows) {
  await bd.query(`update productos set segmento = 'semi_industrial', updated_at = now() where id = $1`, [p.id]);
  // El precio se mueve de tier, no se duplica: es el mismo precio, guardado
  // donde el segmento nuevo lo va a buscar.
  await bd.query(
    `update precios_producto set tier = 'optimo'
      where producto_id = $1 and tier = 'base' and vigente_hasta is null`,
    [p.id],
  );
}

console.log(`\n✓ ${rows.length} equipo(s) reclasificado(s), con su precio movido de 'base' a 'optimo'.`);
console.log("  Ojo: siguen SIN precio piso ('deseado'), que solo gerencia puede definir.");

await bd.end();
