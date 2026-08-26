// Carga los datos de firma de cada comercial: cargo, teléfono, celular y
// correo, que es lo que el PDF de la cotización imprime al pie.
//
// De dónde salen: de las firmas de correo reales que enviaron los propios
// comerciales el 24-08 (Downloads/observaciones de comerciales/*.jpg), no
// inventados. Brenda lo reportó ese mismo día: «no jala mi firma completa con
// número, correo, etc.» — las columnas estaban en null y el documento salía
// firmado solo con el nombre, sin un número al que devolver la llamada.
//
// El teléfono fijo 371-0006 / 371-0502 es el de la empresa y lo comparten
// todos; el celular y el correo son de cada persona.
//
// EL CORREO EN OPEN NO SE DEDUCE. Se guarda por persona (`emailOpen`) porque no
// todos cambian de dominio de la misma forma, y una deducción equivocada
// imprime un correo que puede no existir. La firma que Ariana (C4) mandó el
// 24-08 decía @efameinsa.com, pero el 26-08 reportó que eso estaba mal: su
// correo de OPEN es comercial4@openinvestments.com.pe y sí está activo.
// Cuando el dato falta, se sigue deduciendo cambiando el dominio.
//
// ⚠️ Faltan C2, C3, C9 y PV, que todavía no enviaron su firma. El script los
// lista al final: mientras tanto sus cotizaciones salen sin datos de contacto.
//
// Uso: node --env-file=.env.local scripts/cargar-firmas-comerciales.mjs [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const FIJO = "371-0006 / 371-0502";

const FIRMAS = [
  {
    codigo: "C1",
    nombre: "Brenda Taboada",
    cargo: "Ejecutivo Comercial",
    telefono: FIJO,
    celular: "922 387 534",
    email: "comercial1@efameinsa.com",
    // Brenda no mandó su firma de OPEN: se deduce como hasta ahora.
    emailOpen: null,
  },
  {
    codigo: "C4",
    nombre: "Ariana Flores",
    cargo: "Área Comercial",
    telefono: FIJO,
    celular: "946 372 890",
    email: "comercial4@efameinsa.com",
    // 26-08: Ariana reportó que su correo de OPEN sí es el de dominio propio y
    // está activo — la firma que había enviado el 24-08 (con @efameinsa.com)
    // estaba mal. Corregido a comercial4@openinvestments.com.pe.
    emailOpen: "comercial4@openinvestments.com.pe",
  },
  {
    codigo: "C5",
    nombre: "Katerine Tello",
    cargo: "Ejecutivo Comercial Senior",
    telefono: FIJO,
    celular: "981 488 958",
    email: "comercial5@efameinsa.com",
    emailOpen: "comercial5@openinvestments.com.pe",
  },
];

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

console.log("=== ANTES ===");
const { rows: antes } = await bd.query(
  `select codigo_comercial, nombre, cargo, telefono, celular, email_contacto
     from perfiles where codigo_comercial is not null order by codigo_comercial`,
);
for (const p of antes) {
  console.log(
    `  ${String(p.codigo_comercial).padEnd(4)} ${String(p.nombre).padEnd(22)} cargo=${p.cargo ?? "—"} tel=${p.telefono ?? "—"} cel=${p.celular ?? "—"} correo=${p.email_contacto ?? "—"}`,
  );
}

if (!APLICAR) {
  console.log("\n=== SE CARGARÍA ===");
  for (const f of FIRMAS) console.log(`  ${f.codigo}: ${f.cargo} · ${f.telefono} · ${f.celular} · ${f.email}`);
  console.log("\n(Dry-run: nada se guardó. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

let tocados = 0;
for (const f of FIRMAS) {
  const { rowCount } = await bd.query(
    `update perfiles set nombre = $6, cargo = $2, telefono = $3, celular = $4,
            email_contacto = $5, email_open = $7
      where codigo_comercial = $1`,
    [f.codigo, f.cargo, f.telefono, f.celular, f.email, f.nombre, f.emailOpen],
  );
  if (rowCount === 0) console.log(`  ⚠ no existe el comercial ${f.codigo}`);
  else tocados += rowCount;
}
console.log(`\n✓ ${tocados} firma(s) cargada(s).`);

const { rows: faltan } = await bd.query(
  `select codigo_comercial, nombre from perfiles
    where codigo_comercial is not null and activo and (celular is null or email_contacto is null)
    order by codigo_comercial`,
);
if (faltan.length) {
  console.log("\n⚠ SIGUEN SIN DATOS DE FIRMA (sus cotizaciones salen sin contacto):");
  for (const p of faltan) console.log(`   ${p.codigo_comercial} · ${p.nombre}`);
  console.log("   Pedirles su firma de correo, como hicieron Brenda y Katerine.");
}

await bd.end();
