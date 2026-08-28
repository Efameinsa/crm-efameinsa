// Cómo quedó registrada cada corrección de derivación: quién autorizó, quién la
// pidió, qué contacto, de quién a quién y por qué. Es lo que gerencia tiene que
// poder leer para que el control sirva de algo.
//
// Uso: node --env-file=.env.local scripts/_auditar-correccion-derivacion.mjs
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();

const { rows } = await bd.query(
  `select to_char(a.creado_at at time zone 'America/Lima', 'DD-MM HH24:MI') as cuando,
          sup.nombre as autorizo,
          sol.nombre as pidio,
          l.codigo as contacto,
          coalesce(l.nombre_contacto, l.razon_social) as cliente,
          ant.codigo_comercial as de,
          nue.codigo_comercial as a,
          a.motivo,
          l.es_prueba as practica
     from autorizaciones_supervisor a
     join perfiles sup on sup.id = a.supervisor_id
     join perfiles sol on sol.id = a.solicitante_id
     left join leads l on l.id = a.lead_id
     left join perfiles ant on ant.id = a.comercial_anterior
     left join perfiles nue on nue.id = a.comercial_nuevo
    order by a.creado_at desc limit 20`,
);
console.log("== Correcciones de derivación autorizadas ==");
if (rows.length === 0) console.log("   (todavía ninguna)");
for (const r of rows) {
  console.log(
    `\n${r.cuando}  ${r.contacto ?? "—"}  ${String(r.cliente ?? "").slice(0, 40)}${r.practica ? "   [práctica]" : ""}`,
  );
  console.log(`   ${r.de ?? "—"} → ${r.a ?? "—"}   ·   la pidió ${r.pidio}   ·   la autorizó ${r.autorizo}`);
  console.log(`   Motivo: ${r.motivo}`);
}

// Y los rechazos, que son los que explican un «no me deja».
const { rows: fallos } = await bd.query(
  `select to_char(i.creado_at at time zone 'America/Lima', 'DD-MM HH24:MI') as cuando,
          p.nombre, i.detalle
     from intentos_pin_supervisor i join perfiles p on p.id = i.solicitante_id
    order by i.creado_at desc limit 10`,
);
console.log("\n== Intentos rechazados (por qué no se pudo) ==");
if (fallos.length === 0) console.log("   (ninguno)");
for (const f of fallos) console.log(`   ${f.cuando}  ${f.nombre}: ${f.detalle ?? "sin detalle"}`);
await bd.end();
