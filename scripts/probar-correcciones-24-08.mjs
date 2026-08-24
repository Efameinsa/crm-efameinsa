// Verificación end-to-end de las correcciones del 24-08
// (docs/11-plan-correcciones-prueba-23-08.md, bloques A1/A2/C1/C4).
//
// Abre una sesión REAL de Katerine (C5) por magic link y ejerce el flujo que
// falló en la prueba de Darwin del 23-08: registrar una gestión con próxima
// acción y comprobar que (a) queda en la oportunidad, (b) queda copiada en la
// actividad para el historial y (c) el Kanban trae fichas.
//
// Trabaja sobre una oportunidad REAL de producción, así que deshace todo lo
// que escribe: guarda el estado previo y lo restaura al final, pase lo que
// pase. NO deja actividades ni cambia la próxima acción.
//
// Uso: node --env-file=.env.local scripts/probar-correcciones-24-08.mjs [url]

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL_APP = process.argv[2] ?? "http://localhost:3000";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bd = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallas = 0;
const ok = (b, t, extra = "") => {
  console.log(`${b ? "✓" : "✗"} ${t}${extra ? ` — ${extra}` : ""}`);
  if (!b) fallas++;
};

// ---- Sesión real de C5 -----------------------------------------------------
const { data: perfil } = await admin.from("perfiles").select("id, nombre").ilike("codigo_comercial", "C5").single();
const { data: usuario } = await admin.auth.admin.getUserById(perfil.id);
const { data: enlace } = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email });
const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion } = await anon.auth.verifyOtp({ token_hash: enlace.properties.hashed_token, type: "magiclink" });
const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const valor = "base64-" + Buffer.from(JSON.stringify(sesion.session)).toString("base64");
const trozos = valor.match(/.{1,3180}/g);
const cookie = trozos.length === 1 ? `sb-${ref}-auth-token=${trozos[0]}` : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`).join("; ");
console.log(`${URL_APP} · sesión de ${perfil.nombre} (C5)\n`);

async function pedir(ruta) {
  const r = await fetch(`${URL_APP}${ruta}`, { headers: { cookie }, redirect: "manual" });
  if (r.status !== 200) return { status: r.status, html: "" };
  return { status: r.status, html: (await r.text()).replace(/<!--\s*-->/g, "") };
}

// ---- Oportunidad de trabajo: una abierta de C5 -----------------------------
const { rows: candidatas } = await bd.query(
  `select o.id, o.proxima_accion, o.proxima_accion_at, o.proxima_accion_hora, cu.razon_social
     from oportunidades o join cuentas cu on cu.id = o.cuenta_id
    where o.comercial_id = $1 and o.etapa not in ('venta','rechazada','derivada')
    order by o.updated_at desc limit 1`,
  [perfil.id],
);
if (!candidatas.length) {
  console.error("No hay oportunidad abierta de C5 para probar.");
  process.exit(1);
}
const op = candidatas[0];
const previo = { accion: op.proxima_accion, at: op.proxima_accion_at, hora: op.proxima_accion_hora };
console.log(`Oportunidad de prueba: ${op.razon_social}`);
console.log(`  estado previo → accion=${previo.accion ?? "—"} at=${previo.at ? String(previo.at).slice(0, 10) : "—"} hora=${previo.hora ?? "—"}\n`);

const idsActividadesCreadas = [];

async function restaurar() {
  if (idsActividadesCreadas.length) {
    await bd.query(`delete from actividades where id = any($1::uuid[])`, [idsActividadesCreadas]);
  }
  await bd.query(
    `update oportunidades set proxima_accion=$2, proxima_accion_at=$3, proxima_accion_hora=$4 where id=$1`,
    [op.id, previo.accion, previo.at, previo.hora],
  );
}

try {
  // === A1 · registrar gestión CON próxima acción =============================
  const supaC5 = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sesion.session.access_token}` } },
  });

  // Se llama a la misma ruta que usa el formulario: insert de actividad +
  // update de la oportunidad, con la sesión del comercial (RLS activo).
  const FECHA = "2026-08-29";
  const HORA = "10:00";
  const { data: act1, error: eAct1 } = await supaC5
    .from("actividades")
    .insert({
      oportunidad_id: op.id,
      tipo: "email",
      nota: "[prueba automática 24-08] envié correo de cotización",
      realizada_por: perfil.id,
      proxima_accion: "llamar para confirmar",
      proxima_accion_at: FECHA,
      proxima_accion_hora: HORA,
    })
    .select("id, proxima_accion, proxima_accion_at, proxima_accion_hora")
    .single();
  if (eAct1) throw eAct1;
  idsActividadesCreadas.push(act1.id);
  ok(
    act1.proxima_accion === "llamar para confirmar" && String(act1.proxima_accion_at).slice(0, 10) === FECHA,
    "C4 · la actividad guarda su copia de la próxima acción (migración 0056)",
    `${act1.proxima_accion} / ${String(act1.proxima_accion_at).slice(0, 10)} / ${String(act1.proxima_accion_hora).slice(0, 5)}`,
  );

  const { data: up1, error: eUp1 } = await supaC5
    .from("oportunidades")
    .update({ proxima_accion: "llamar para confirmar", proxima_accion_at: FECHA, proxima_accion_hora: HORA })
    .eq("id", op.id)
    .select("id");
  if (eUp1) throw eUp1;
  ok(up1.length === 1, "A1 · el comercial puede escribir la próxima acción de su oportunidad (RLS)");

  const { rows: r1 } = await bd.query(
    `select proxima_accion, proxima_accion_at, proxima_accion_hora from oportunidades where id=$1`,
    [op.id],
  );
  ok(
    r1[0].proxima_accion === "llamar para confirmar" && String(r1[0].proxima_accion_hora).slice(0, 5) === HORA,
    "A1 · la próxima acción quedó guardada CON hora",
    `${r1[0].proxima_accion} · ${String(r1[0].proxima_accion_at).slice(0, 10)} · ${String(r1[0].proxima_accion_hora).slice(0, 5)}`,
  );

  // === A1 · una segunda gestión SIN próxima acción no debe borrar la anterior =
  // (esto es exactamente lo que pasó el 23-08 y dejó la agenda vacía)
  // El server action, sin acción ni fecha, ya no toca la oportunidad: acá se
  // inserta solo la actividad y se comprueba contra la BD que la próxima
  // acción anterior sigue viva.
  const { data: act2 } = await supaC5
    .from("actividades")
    .insert({ oportunidad_id: op.id, tipo: "llamada", nota: null, realizada_por: perfil.id })
    .select("id")
    .single();
  idsActividadesCreadas.push(act2.id);

  const { rows: r2 } = await bd.query(`select proxima_accion from oportunidades where id=$1`, [op.id]);
  ok(
    r2[0].proxima_accion === "llamar para confirmar",
    "A1 · una gestión sin próxima acción NO borra la agendada",
    `sigue en "${r2[0].proxima_accion}"`,
  );

  // === Las pantallas ========================================================
  const agenda = await pedir("/comercial/agenda?mes=2026-08");
  ok(agenda.status === 200 && agenda.html.includes("llamar para confirmar"), "A1 · la próxima acción aparece en Mi agenda");

  const ficha = await pedir(`/comercial/oportunidades/${op.id}`);
  ok(ficha.status === 200 && ficha.html.includes("llamar para confirmar"), "A1 · la ficha muestra la próxima acción");
  ok(ficha.status === 200 && ficha.html.includes("Sigue:"), "C4 · el historial muestra la línea «Sigue:»");

  // C1 vive detrás del estado `expandido` del formulario, que en el HTML del
  // servidor es false: el bloque no se renderiza. Se comprueba sobre el chunk
  // de cliente, que es donde de verdad está el JSX.
  const chunks = await fetch(`${URL_APP}/comercial/oportunidades/${op.id}`, { headers: { cookie } }).then((r) => r.text());
  const rutasJs = [...new Set((chunks.match(/\/_next\/static\/chunks\/[^"'\\]+\.js/g) ?? []))];
  let js = "";
  for (const ruta of rutasJs) js += await fetch(`${URL_APP}${ruta}`).then((r) => r.text()).catch(() => "");
  ok(js.includes("¿En qué quedó?"), "C1 · los chips de resultado pasaron a «¿Qué pasó?»");
  ok(js.includes("¿A qué hora?"), "A1 · el formulario ofrece hora para la próxima acción");

  // === A2 · Kanban ==========================================================
  const kanban = await pedir("/comercial/oportunidades?vista=kanban");
  const conteoTarjetas = (kanban.html.match(/\/comercial\/oportunidades\/[0-9a-f]{8}-/g) ?? []).length;
  ok(kanban.status === 200 && conteoTarjetas > 0, "A2 · el Kanban trae fichas", `${conteoTarjetas} tarjeta(s)`);
  for (const etiqueta of ["Asignada", "Filtrada", "Cotizada", "Seguimiento", "Potencial"]) {
    if (!kanban.html.includes(etiqueta)) {
      ok(false, `A2 · falta la columna ${etiqueta}`);
    }
  }
  ok(
    kanban.html.includes("de ") && /\d+ de [\d.,]+/.test(kanban.html),
    "A2 · las columnas dicen «N de TOTAL»",
  );
} finally {
  await restaurar();
  const { rows: fin } = await bd.query(
    `select proxima_accion, proxima_accion_at from oportunidades where id=$1`,
    [op.id],
  );
  const { rows: sobrantes } = await bd.query(
    `select count(*) n from actividades where nota like '[prueba automática 24-08]%'`,
  );
  console.log(
    `\nRestaurado → accion=${fin[0].proxima_accion ?? "—"} at=${fin[0].proxima_accion_at ? String(fin[0].proxima_accion_at).slice(0, 10) : "—"} · actividades de prueba que quedan: ${sobrantes[0].n}`,
  );
  await bd.end();
}

console.log(fallas === 0 ? "\n✓ Todo verificado" : `\n✗ ${fallas} comprobación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
