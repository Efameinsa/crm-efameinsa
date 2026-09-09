import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
for (const cels of [["987524031"], ["989001284"], ["956181464"], ["942710197"]]) {
  const t0 = Date.now();
  const { rows } = await bd.query(`
    select cu.razon_social, cu.num_doc, x.celular
      from cuentas_por_celular($1::text[]) x join cuentas cu on cu.id = x.cuenta_id`, [cels]);
  console.log(`${cels[0]} → ${Date.now()-t0} ms · ${rows.length} ficha(s) con el número escondido`);
  for (const r of rows) console.log(`     ${r.razon_social} (${r.num_doc ?? "sin doc"})`);
}
const t0 = Date.now();
await bd.query(`select * from cuentas_por_celular(array(select distinct unnest(celulares_de(telefono)) from contactos limit 300))`);
console.log(`\nCon 300 celulares de golpe: ${Date.now()-t0} ms`);
await bd.end();
