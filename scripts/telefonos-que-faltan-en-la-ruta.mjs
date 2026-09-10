// ============================================================
// Los teléfonos que faltan en la ruta de mantenimiento
// ============================================================
// Ariana, 10-09: «¿cómo voy a gestionar si no visualizo sus teléfonos? y así
// son varios». Es cierto y tiene una causa: el parque instalado se armó desde
// los Excel del servidor y desde las guías de remisión, que traen la MÁQUINA
// —serie, modelo, fecha— pero no a quién llamar. El cliente entró al CRM sin
// un solo contacto.
//
// Antes de pedirle que los consiga uno por uno, se busca lo que la casa YA
// TIENE escrito en otro lado. Cuatro fuentes, de la más confiable a la menos:
//
//   1. El contacto de OTRA ficha del mismo RUC. Son fichas partidas por nombre
//      (memoria: «el RUC manda sobre el nombre»); el número es del mismo
//      cliente, solo que quedó en la otra mitad.
//   2. El lead con el que ese cliente escribió alguna vez. Lo dejó él.
//   3. `servicios_postventa.recibe_telefono`: quien recibió la máquina en su
//      local cuando se despachó.
//   4. Un lead suelto con el mismo RUC, todavía sin ficha.
//   5. La GUÍA DE REMISIÓN con la que se le entregó la máquina. El nombre y el
//      celular de quien la recibió van escritos a mano en una casilla libre
//      —«PERSONA QUE VA HA RECIBIR: … / DNI:… / CEL:…»—, así que hay que
//      sacarlos del texto. Es el que menos garantiza que siga siendo el
//      contacto de hoy: por eso va último y queda anotado de dónde salió.
//
// NO PISA NADA. Solo llena clientes que hoy no tienen ningún número, con la
// misma función que usa la pantalla (0207), y deja escrito de dónde salió cada
// uno para que se pueda confirmar en la llamada.
//
//   node --env-file=.env.local scripts/telefonos-que-faltan-en-la-ruta.mjs
//   node --env-file=.env.local scripts/telefonos-que-faltan-en-la-ruta.mjs --aplicar
import { readFileSync } from "node:fs";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Las guías ya leídas (scripts/_leer-guias-remision.mjs). El celular está
// dentro del texto: se toma el número de NUEVE dígitos que empieza en 9, que
// es un celular peruano —el DNI de al lado tiene ocho y no se confunde—, y si
// no hay, un fijo de Lima de siete precedido de su rótulo.
const GUIAS = (() => {
  try { return JSON.parse(readFileSync("scripts/data/guias-remision.json", "utf8")).guias ?? []; }
  catch (e) { console.error("No se pudieron leer las guías:", e.message); return []; }
})();

function contactoDeLaGuia(texto) {
  const t = String(texto ?? "").replace(/\s+/g, " ");
  const cel = t.match(/\b9\s*\d(?:\s*\d){7}\b/);
  const fijo = t.match(/(?:TEL[EÉ]FONO|TELF?|FIJO)\s*[:.\-]?\s*((?:\d[\s-]?){6,8}\d)/i);
  const numero = cel ? cel[0].replace(/\D/g, "") : fijo ? fijo[1].replace(/\D/g, "") : null;
  if (!numero) return null;
  // El nombre va después del rótulo y termina donde empieza el DNI o el celular.
  // El rótulo lo escribe almacén a mano y cambia de guía en guía: «PERSONA QUE
  // VA HA RECIBIR», «PERSONA QUE RECIBE», «PERSONA QUE VA HA RECOGER».
  const n = t.match(/RECIB(?:E|IR)|RECOGER/i)
    ? t.slice(t.search(/RECIB(?:E|IR)|RECOGER/i)).match(
        /(?:RECIB(?:E|IR)|RECOGER)\s*[:.\-]?\s*([A-ZÁÉÍÓÚÑ .,']{6,60}?)(?=\s*[,/]?\s*(?:DNI|RUC|C\.?E\.?|CEL|TEL|\d))/i,
      )
    : null;
  const nombre = n ? n[1].replace(/[,/.\s]+$/, "").trim() : null;
  return { telefono: numero, nombre: nombre || null };
}

// La ruta tal como la arma la pantalla: las oportunidades de mantenimiento.
const { rows: ruta } = await bd.query(`
  select distinct c.id, c.razon_social, c.num_doc, p.codigo_comercial dueno
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join perfiles p on p.id = c.comercial_id
   where o.tipo_postventa = 'mantenimiento'
   order by c.razon_social`);

const { rows: sin } = await bd.query(`
  select distinct c.id, c.razon_social, c.num_doc, p.codigo_comercial dueno
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    left join perfiles p on p.id = c.comercial_id
   where o.tipo_postventa = 'mantenimiento'
     and not exists (
       select 1 from contactos ct
        where ct.cuenta_id = c.id
          and ct.telefono_normalizado is not null and ct.telefono_normalizado <> '')
   order by c.razon_social`);

console.log(`Ruta de mantenimiento: ${ruta.length} clientes.`);
console.log(`Sin ningún teléfono cargado: ${sin.length}\n`);

const hallazgos = [];
for (const c of sin) {
  const doc = (c.num_doc ?? "").trim();

  // 1. Otra ficha del mismo RUC.
  if (doc) {
    const { rows } = await bd.query(`
      select ct.telefono, ct.nombre, c2.razon_social
        from contactos ct join cuentas c2 on c2.id = ct.cuenta_id
       where c2.num_doc = $1 and c2.id <> $2
         and ct.telefono_normalizado is not null and ct.telefono_normalizado <> ''
       order by ct.es_principal desc, ct.created_at limit 1`, [doc, c.id]);
    if (rows[0]) { hallazgos.push({ ...c, ...rows[0], fuente: `otra ficha del mismo RUC («${rows[0].razon_social}»)` }); continue; }
  }

  // 2. Un lead de esta misma ficha.
  {
    const { rows } = await bd.query(`
      select telefono, nombre_contacto nombre, codigo
        from leads
       where cuenta_id = $1 and telefono_normalizado is not null and telefono_normalizado <> ''
       order by recibido_at desc limit 1`, [c.id]);
    if (rows[0]) { hallazgos.push({ ...c, ...rows[0], fuente: `contacto entrante ${rows[0].codigo}` }); continue; }
  }

  // 3. Quién recibió la máquina.
  {
    const { rows } = await bd.query(`
      select recibe_telefono telefono, recibe_nombre nombre
        from servicios_postventa
       where cuenta_id = $1 and coalesce(recibe_telefono,'') <> ''
       order by despachado_at desc nulls last limit 1`, [c.id]);
    if (rows[0]) { hallazgos.push({ ...c, ...rows[0], fuente: "quien recibió el despacho" }); continue; }
  }

  // 4. Un lead suelto con el mismo RUC.
  if (doc) {
    const { rows } = await bd.query(`
      select telefono, nombre_contacto nombre, codigo
        from leads
       where num_doc = $1 and telefono_normalizado is not null and telefono_normalizado <> ''
       order by recibido_at desc limit 1`, [doc]);
    if (rows[0]) { hallazgos.push({ ...c, ...rows[0], fuente: `contacto entrante ${rows[0].codigo} (mismo RUC, sin ficha)` }); continue; }
  }

  // 5. Quien recibió la máquina, según la guía de remisión.
  if (doc) {
    const suyas = GUIAS.filter((g) => String(g.ruc ?? "").trim() === doc && g.recibe)
      .sort((a, b) => String(b.emitida ?? "").localeCompare(String(a.emitida ?? "")));
    for (const g of suyas) {
      const hallado = contactoDeLaGuia(g.recibe);
      if (hallado) {
        hallazgos.push({ ...c, ...hallado, fuente: `guía ${g.numero} del ${g.emitida}, quien la recibió` });
        break;
      }
    }
  }
}

console.log(`Se puede recuperar de lo que ya tenemos escrito: ${hallazgos.length}`);
console.table(hallazgos.map((h) => ({
  cliente: (h.razon_social ?? "").slice(0, 34),
  dueno: h.dueno ?? "—",
  telefono: h.telefono,
  contacto: (h.nombre ?? "").slice(0, 18),
  de: h.fuente.slice(0, 46),
})));
console.log(`\nQuedan por conseguir a mano: ${sin.length - hallazgos.length}`);

if (!APLICAR) {
  console.log("\n(ensayo: no se tocó nada — para cargarlos, --aplicar)");
  await bd.end();
  process.exit(0);
}

let cargados = 0;
for (const h of hallazgos) {
  const nombre = (h.nombre ?? "").trim() || "Contacto";
  const { rows } = await bd.query(
    `insert into contactos (cuenta_id, nombre, cargo, telefono, es_principal)
     select $1, $2, $3, $4,
            not exists (select 1 from contactos where cuenta_id = $1 and es_principal)
      where not exists (
        select 1 from contactos
         where cuenta_id = $1 and telefono_normalizado is not null and telefono_normalizado <> '')
     returning id`,
    [h.id, nombre, `Recuperado del CRM: ${h.fuente}`, String(h.telefono).trim()],
  );
  if (rows[0]) cargados++;
}
console.log(`\n✓ Cargados: ${cargados}. El resto ya tenía número (alguien lo puso mientras corría).`);
await bd.end();
