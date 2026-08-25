// ============================================================
// CRM EFAMEINSA · Que todo precio salga del maestro de Lesly
// ============================================================
// Orden del 25-08: «los reales son del Excel de Lesly, CODIFICACION DE EQUIPOS
// PARA MARKETING, y aún no hay máximos y mínimos — apégate a ese Excel».
//
// La auditoría contra el maestro dio esto:
//   · 56 de 67 equipos ya tenían UN precio, idéntico al maestro.
//   · 6 con sufijo -V1/-V2 también: el maestro repite el código para dos
//     máquinas distintas (LAV180 es la rígida RX180 y la flotante FX180) y
//     alguien las separó bien. Los seis precios calzan exactos.
//   · 5 NO existen en el maestro y traen precios inventados, con tres niveles
//     (óptimo/medio/deseado) de una funcionalidad que todavía no existe.
//
// ESOS 5 SON EL CATÁLOGO DE EJEMPLO DEL PILOTO. El README del proyecto ya lo
// decía: «catálogo de ejemplo — sustituir cuando gerencia entregue el catálogo
// y la lista de precios oficial». Nunca se sustituyeron, y se cotizaron 21
// veces a clientes reales con precios que no son de la empresa.
//
// CÓMO SE EMPAREJAN, sin deducir nada: por marca, modelo y capacidad contra el
// maestro. Y lo confirma el uso real — las comerciales ya tecleaban a mano el
// precio del maestro por encima del que el CRM les sugería: cotizaron 3,950,
// 3,150, 2,250 y 2,100 cuando el CRM proponía 3,750, 2,750, 2,199 y 1,700.
//
// SE LES PONE TAMBIÉN SU CÓDIGO. Sin código no se pueden buscar como las
// nombran las comerciales, que es un pedido de la reunión del 25-08. Y hace
// que el día que se cargue el equipo completo desde su ficha, el cargador
// ACTUALICE esta fila en vez de crear una segunda: los cargadores insertan
// `on conflict (sku) do update`.
//
// UN SOLO PRECIO. Los niveles medio/deseado se cierran (vigente_hasta = hoy),
// no se borran: si mañana gerencia define máximos y mínimos, va a querer ver
// que alguna vez hubo otros números y de dónde salieron.
//
// Uso: node --env-file=.env.local scripts/alinear-precios-al-maestro.mjs [--aplicar]

import { Client } from "pg";
import XLSX from "xlsx";

const APLICAR = process.argv.includes("--aplicar");
const EXCEL = "V:/LESLY/CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx";

// modelo del CRM → código del maestro. La variante (single / apilable) se elige
// por lo que dice el nombre del producto del piloto.
const EQUIVALENCIAS = [
  { modelo: "TITAN MAX", capacidad: "17 kg", sku: "LAVMA172", porque: "«Lavadora centrífuga semi industrial», sin mencionar apilable → SINGLE" },
  { modelo: "TITAN LIGHT", capacidad: "15 kg", sku: "SECMAX15", porque: "«Secadora semi industrial a gas / apilable» → APILABLE" },
  { modelo: "GIANT C MAX (CWG27MDCRS)", capacidad: "13 kg", sku: "LAVGIA13", porque: "lavadora GIANT C MAX 13 kg" },
  { modelo: "GIANT C MAX (CDG27MSCPS)", capacidad: "10.2 kg", sku: "SECGIA10", porque: "secadora GIANT C MAX 10.2 kg a gas" },
  { modelo: "FS40", capacidad: null, sku: null, porque: "no existe en el maestro y no se cotizó nunca → se desactiva" },
];

const filas = XLSX.utils
  .sheet_to_json(XLSX.readFile(EXCEL).Sheets["Hoja1"], { header: 1, defval: "" })
  .slice(3)
  .filter((f) => f[1] && String(f[1]).trim());
const maestro = new Map();
for (const f of filas) {
  const cod = String(f[1]).trim().toUpperCase();
  if (!maestro.has(cod)) maestro.set(cod, { precio: Number(f[6]) || null, equipo: String(f[2]).trim() });
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: pilotos } = await bd.query(
  `select p.id, p.marca, p.modelo, p.nombre, p.capacidad, p.segmento,
          (select count(*) from cotizacion_items i where i.producto_id = p.id) usos,
          (select string_agg(tier || ':' || precio, ' · ' order by tier)
             from precios_producto where producto_id = p.id and vigente_hasta is null) tiers
     from productos p
    where p.activo and p.sku is null
    order by p.modelo`,
);

console.log(`\nProductos sin código en el catálogo: ${pilotos.length}\n`);
const plan = [];
for (const p of pilotos) {
  const eq = EQUIVALENCIAS.find((e) => p.modelo.includes(e.modelo));
  if (!eq) {
    console.log(`  ⚠ ${p.marca} ${p.modelo}: no está en la tabla de equivalencias. Se deja como está.`);
    continue;
  }
  const m = eq.sku ? maestro.get(eq.sku) : null;
  if (eq.sku && !m) {
    console.log(`  ✗ ${p.modelo}: el código ${eq.sku} no está en el maestro. Se deja como está.`);
    continue;
  }
  console.log(`  ${p.marca} ${p.modelo} · ${p.capacidad ?? "—"} · usado en ${p.usos} cotización(es)`);
  console.log(`     hoy    : ${p.tiers ?? "sin precio"}`);
  if (eq.sku) {
    console.log(`     queda  : ${eq.sku} · un solo precio US$ ${m.precio}`);
    console.log(`     porque : ${eq.porque}`);
    console.log(`     maestro: ${m.equipo.slice(0, 92)}`);
  } else {
    console.log(`     queda  : DESACTIVADO — ${eq.porque}`);
  }
  plan.push({ p, eq, m });
}

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}

for (const { p, eq, m } of plan) {
  if (!eq.sku) {
    await bd.query(`update productos set activo = false, updated_at = now() where id = $1`, [p.id]);
    console.log(`  · ${p.modelo}: desactivado`);
    continue;
  }
  // Si el código ya existiera en otro producto, no se pisa: se avisa.
  const { rows: choca } = await bd.query(`select id from productos where sku = $1 and id <> $2`, [eq.sku, p.id]);
  if (choca.length) {
    console.error(`  ✗ ${eq.sku} ya lo tiene otro producto. Se salta ${p.modelo}.`);
    continue;
  }
  await bd.query(`update productos set sku = $2, updated_at = now() where id = $1`, [p.id, eq.sku]);
  // Los niveles inventados se cierran, no se borran.
  await bd.query(
    `update precios_producto set vigente_hasta = current_date
      where producto_id = $1 and vigente_hasta is null`,
    [p.id],
  );
  await bd.query(
    `insert into precios_producto (producto_id, tier, precio, moneda, vigente_desde)
     values ($1, 'optimo', $2, 'USD', current_date)
     on conflict (producto_id, tier, vigente_desde) do update set precio = excluded.precio, vigente_hasta = null`,
    [p.id, m.precio],
  );
  console.log(`  · ${eq.sku}: US$ ${m.precio}`);
}

// ── Lo que está esperando a gerencia se vuelve a medir con los precios buenos ──
const { rowCount: items } = await bd.query(
  `update cotizacion_items i
      set precio_lista        = precio_referencia_producto(i.producto_id),
          bajo_lista          = precio_referencia_producto(i.producto_id) is not null
                                and i.precio_unitario < precio_referencia_producto(i.producto_id),
          requiere_aprobacion = exige_aprobacion_gerencia(
                                  i.producto_id,
                                  precio_referencia_producto(i.producto_id) is not null
                                  and i.precio_unitario < precio_referencia_producto(i.producto_id))
     from cotizaciones c
    where c.id = i.cotizacion_id and c.estado = 'borrador' and c.enviada_at is null
      and i.producto_id is not null`,
);
const { rowCount: liberadas } = await bd.query(
  `update cotizaciones c set estado_aprobacion = 'auto_aprobada'
    where c.estado_aprobacion = 'pendiente_gerencia' and c.estado = 'borrador' and c.enviada_at is null
      and not exists (select 1 from cotizacion_items i where i.cotizacion_id = c.id and i.requiere_aprobacion)`,
);

console.log(`\n✓ ${items} ítem(s) de borradores recalculados con el precio del maestro.`);
console.log(`✓ ${liberadas} cotización(es) dejaron de necesitar aprobación.\n`);
await bd.end();
