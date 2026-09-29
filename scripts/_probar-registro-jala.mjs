// Prueba la 0328 (el registro jala la máquina) con la sesión real de Rubí,
// TODO dentro de una transacción que se deshace: no queda nada escrito.
//
//   node --env-file=.env.local scripts/_probar-registro-jala.mjs
import { Client } from "pg";
import fs from "fs";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const q = async (s, p) => (await pg.query(s, p)).rows;
let fallas = 0;
const ok = (cond, texto) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`);
  if (!cond) fallas++;
};

const [rubi] = await q("select id from auth.users where email='postventa@efameinsa.com'");
const como = async (id) => {
  await pg.query("reset role");
  await pg.query("select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
};
const sinSesion = async () => {
  await pg.query("reset role");
  await pg.query("select set_config('request.jwt.claims', '', true)");
};
const CUENTA_A = "fe464aa3-5228-45ec-8854-f368aae1cabe"; // PRUEBA SERIES - NO FACTURAR
const CUENTA_B = "b4ef2e31-7253-43f6-a36a-8fd76f1814c3";
const AGRO = "fb6b37a7-b722-49f6-815d-831d568fc2ca"; // la puesta en marcha que reportó Rubí
const casoDe = async (op) =>
  (await q("select a.id, a.equipo_id, a.en_garantia, a.hizo_preventivo, a.garantia_verificada_at, a.etapa::text, a.tomada_at, (select serie from equipos_instalados e where e.id=a.equipo_id) serie, (select array_agg(e.serie order by e.serie) from atencion_equipos x join equipos_instalados e on e.id=x.equipo_id where x.atencion_id=a.id) otras from atenciones a where a.oportunidad_id=$1", [op]))[0];

await pg.query("begin");
try {
  await pg.query("set local lock_timeout = '3s'");
  await pg.query("set local statement_timeout = '30s'");

  // Dos máquinas de prueba en A y una en B, con series que nadie más tiene.
  // La base calcula garantia_hasta desde la fecha de venta: se ficha con ella.
  const ficha = async (cuenta, serie, venta) => {
    const [m] = await q("insert into equipos_instalados (cuenta_id, serie, modelo_texto, fecha_venta, garantia_meses) values ($1,$2,'SECADORA DE PRUEBA 0328',$3,24) returning id, garantia_hasta", [cuenta, serie, venta]);
    console.log(`(máquina de prueba ${serie}: garantía hasta ${m.garantia_hasta ? new Date(m.garantia_hasta).toISOString().slice(0, 10) : "—"})`);
    return m.id;
  };
  const m1 = await ficha(CUENTA_A, "ZZ0328PRUEBA01", "2026-08-01");
  const m2 = await ficha(CUENTA_A, "ZZ0328PRUEBA02", "2020-01-01");
  await ficha(CUENTA_B, "ZZ0328AJENA99", "2026-08-01");

  const antes = await q("select equipo_id, en_garantia from atenciones where id=$1", [AGRO]);
  await pg.query(fs.readFileSync(new URL("../supabase/migrations/0328_el_registro_jala_la_maquina.sql", import.meta.url), "utf8"));
  console.log("(0328 aplicada DENTRO de la transacción)\n");

  console.log("1. Reconocer una serie en el texto");
  const dice = async (t, s) => (await q("select menciona_serie($1,$2) r", [t, s]))[0].r;
  ok(await dice("no enciende\nSerie: 2505034118", "2505034118"), "la serie que escribe el registro");
  ok(await dice("Otras máquinas del mismo caso: 2505050812, 2505034118 (2 equipos en total).", "2505050812"), "una de varias, separadas por coma");
  ok(await dice("la secadora serie abc-12345 no calienta", "ABC-12345"), "sin importar mayúsculas");
  ok(await dice("Serie: 2505034118", "S/N: 2505034118"), "la serie del parque guardada con su prefijo");
  ok(!(await dice("Serie: 12505034118", "2505034118")), "no la confunde con otra más larga (dígito antes)");
  ok(!(await dice("Serie: 25050341189", "2505034118")), "no la confunde con otra más larga (dígito después)");
  ok(!(await dice("tiene 12345 ciclos", "12345")), "una serie de menos de seis caracteres no cuenta");
  ok(!(await dice(null, "2505034118")) && !(await dice("algo", null)), "sin texto o sin serie, no");

  console.log("\n2. El caso de AGROCASAGRANDE que reportó Rubí");
  ok(antes[0]?.equipo_id === null && antes[0]?.en_garantia === null, "antes: sin máquina y con la garantía sin verificar");
  const [agro] = await q("select a.equipo_id, a.en_garantia, a.etapa::text, (select serie from equipos_instalados e where e.id=a.equipo_id) serie, (select array_agg(e.serie) from atencion_equipos x join equipos_instalados e on e.id=x.equipo_id where x.atencion_id=a.id) otras from atenciones a where a.id=$1", [AGRO]);
  ok(agro.serie === "2505034118", `la principal es la que venía en «Serie:» → ${agro.serie}`);
  ok(agro.en_garantia === true, `garantía verificada → en garantía: ${agro.en_garantia}`);
  ok(JSON.stringify(agro.otras) === JSON.stringify(["2505050812"]), `la otra quedó sumada al caso → ${JSON.stringify(agro.otras)}`);
  ok(agro.etapa === "registro", "sigue en registro: los antecedentes los escribe ella");
  const [{ n: tocados }] = await q("select count(*)::int n from atenciones where garantia_verificada_at = now()");
  ok(tocados === 1, `el arreglo de lo ya abierto tocó ${tocados} caso(s)`);

  console.log("\n3. Rubí registra y atiende una puesta en marcha con dos series");
  await como(rubi.id);
  const [{ r: r1 }] = await q("select registrar_caso_autoderivado($1, 'puesta_en_marcha', $2, null, $3) r", [
    CUENTA_A,
    "SOLICITA PUESTA EN MARCHA DE SUS SECADORAS.\n\nOtras máquinas del mismo caso: ZZ0328PRUEBA02 (2 equipos en total).",
    "zz0328prueba01",
  ]);
  await sinSesion();
  ok(r1.repetido === false && r1.autoderivado === true, `registrado como ${r1.codigo}, autoderivado`);
  const c1 = await casoDe(r1.oportunidad);
  ok(c1?.equipo_id === m1, `nace con la máquina de «Serie:» → ${c1?.serie}`);
  ok(c1?.en_garantia === true && c1?.garantia_verificada_at !== null, "con la garantía verificada al nacer");
  ok(JSON.stringify(c1?.otras) === JSON.stringify(["ZZ0328PRUEBA02"]), `la segunda máquina quedó en el caso → ${JSON.stringify(c1?.otras)}`);
  ok(c1?.etapa === "registro" && c1?.tomada_at === null, "en registro y sin marcarse «tomada» por esto");

  console.log("\n4. Una máquina fuera de garantía también queda verificada");
  await como(rubi.id);
  const [{ r: r2 }] = await q("select registrar_caso_autoderivado($1, 'problema_tecnico', $2, $3, $4) r", [CUENTA_A, "La secadora no calienta desde el lunes", m2, "ZZ0328PRUEBA02"]);
  await sinSesion();
  const c2 = await casoDe(r2.oportunidad);
  ok(c2?.equipo_id === m2 && c2?.en_garantia === false, `máquina ${c2?.serie}, en garantía: ${c2?.en_garantia}`);
  ok(c2?.otras === null, "sin máquinas adicionales");

  console.log("\n5. Sin serie, o con la serie de otro cliente, el caso nace como antes");
  await como(rubi.id);
  const [{ r: r3 }] = await q("select registrar_caso_autoderivado($1, 'soporte_tecnico', $2) r", [CUENTA_A, "Solicita capacitación sobre el uso del panel"]);
  const [{ r: r4 }] = await q("select registrar_caso_autoderivado($1, 'soporte_tecnico', $2, null, $3) r", [CUENTA_B, "Solicita orientación para programar ciclos", "ZZ0328PRUEBA01"]);
  await sinSesion();
  const c3 = await casoDe(r3.oportunidad);
  const c4 = await casoDe(r4.oportunidad);
  ok(c3 && c3.equipo_id === null && c3.en_garantia === null, "sin serie: sin máquina, se elige en el Paso 1");
  ok(c4 && c4.equipo_id === null && c4.en_garantia === null, "serie de otro cliente: no se engancha");
} catch (e) {
  fallas++;
  console.error("\n  ✘ REVENTÓ:", e.message);
} finally {
  await pg.query("rollback");
  const [{ n }] = await q("select count(*)::int n from equipos_instalados where serie like 'ZZ0328%'");
  const [{ f }] = await q("select count(*)::int f from pg_proc where proname in ('menciona_serie','maquinas_mencionadas')");
  console.log(`\n(transacción deshecha: quedaron ${n} máquinas de prueba y ${f} funciones nuevas en la base)`);
  await pg.end();
}
console.log(fallas ? `\n${fallas} FALLA(S)` : "\nTODO BIEN");
process.exit(fallas ? 1 : 0);
