// Comprueba que crm.efameinsa.com está sirviendo el CRM de verdad, y migra lo
// poco que apunta al dominio viejo desde fuera del sistema.
//
// docs/12-migracion-dominio-crm.md
//
// El código del CRM es casi todo agnóstico del dominio (el proxy redirige con
// nextUrl.clone(), el service worker usa self.location.origin, los PDFs de R2
// salen por URL firmada desde el servidor y el login es por contraseña, sin
// magic link ni recuperación por correo). Lo único atado al dominio son los
// enlaces que viajan DENTRO de correos, y eso ya vive en src/lib/url-app.ts.
//
// Lo que sí hay que migrar a mano está listado en el documento. Este script
// verifica el resultado y actualiza el único workflow de n8n que llama al CRM.
//
// Uso:
//   node --env-file=.env.local scripts/migrar-dominio.mjs            (verifica)
//   node --env-file=.env.local scripts/migrar-dominio.mjs --aplicar  (+ n8n)

import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--aplicar");
const NUEVO = process.argv.find((a) => a.startsWith("--dominio="))?.split("=")[1] ?? "https://crm.efameinsa.com";
const VIEJO = "https://crm-efameinsa.vercel.app";

let fallas = 0;
let avisos = 0;
const ok = (b, t, extra = "") => {
  console.log(`${b ? "✓" : "✗"} ${t}${extra ? ` — ${extra}` : ""}`);
  if (!b) fallas++;
};
const aviso = (t) => {
  console.log(`⚠ ${t}`);
  avisos++;
};

async function pedir(url, opciones = {}) {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), ...opciones });
    return { status: r.status, headers: r.headers, texto: async () => r.text() };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

console.log(`Dominio nuevo: ${NUEVO}\nDominio viejo: ${VIEJO}\n`);

const host = new URL(NUEVO).hostname;
const apex = host.split(".").slice(-2).join(".");

/** Consulta DNS por DoH: no depende de nslookup ni del resolutor del equipo. */
async function dns(nombre, tipo) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${nombre}&type=${tipo}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json();
    return (j.Answer ?? []).map((a) => String(a.data).replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

// ── 0. ¿Vercel está esperando el TXT de propiedad? ──────────────────────────
// "Verification Required" en el panel = el dominio ya está reclamado en OTRA
// cuenta de Vercel, y hay que demostrar que es nuestro con un TXT. Se comprueba
// antes que nada porque explica el resto de fallos.
console.log("=== VERIFICACIÓN DE PROPIEDAD ===");
const [txtSub, txtApex, cname] = await Promise.all([
  dns(`_vercel.${host}`, "TXT"),
  dns(`_vercel.${apex}`, "TXT"),
  dns(host, "CNAME"),
]);
ok(cname.some((c) => c.includes("vercel-dns")), `${host} apunta a Vercel por CNAME`, cname.join(", ") || "sin CNAME");

// El valor que pide Vercel para este dominio, leído del panel el 24-08. Se
// comprueba el valor y no solo la existencia del registro: un TXT con el valor
// mal copiado se ve igual de "presente" por DNS y Vercel lo rechaza igual.
const TXT_ESPERADO = "vc-domain-verify=crm.efameinsa.com,82a11dac39233ba31d6d";

const todosLosTxt = [...txtSub, ...txtApex];
const hayTxt = todosLosTxt.length > 0;
if (hayTxt) {
  const calza = todosLosTxt.some((t) => t.trim() === TXT_ESPERADO);
  ok(calza, "existe el TXT _vercel con el valor correcto", todosLosTxt.join(" · "));
  if (!calza) {
    console.log(
      `\n  Hay un TXT pero NO es el que Vercel espera.\n` +
        `  esperado: ${TXT_ESPERADO}\n` +
        `  hallado : ${todosLosTxt.join(" · ")}\n` +
        `  Suele ser el valor partido por la coma, o con comillas de más.\n`,
    );
  }
} else {
  aviso(`no existe TXT en _vercel.${host} ni en _vercel.${apex}`);
  console.log(
    "\n  Si el panel de Vercel dice «Verification Required», es esto: el dominio\n" +
      "  ya está reclamado en otra cuenta de Vercel y hay que demostrar que es\n" +
      "  nuestro. Vercel muestra en pantalla el registro EXACTO a crear (nombre\n" +
      "  y valor); hay que pedírselo al hosting tal cual, sin reescribirlo.\n" +
      "  Ver docs/12-migracion-dominio-crm.md, sección 1b.\n",
  );
}

// ── 1. ¿Responde por HTTPS? ─────────────────────────────────────────────────
console.log("\n=== EL DOMINIO ===");
const login = await pedir(`${NUEVO}/login`);
if (login.status === 0) {
  ok(false, "responde por HTTPS", login.error);
  console.log(
    hayTxt
      ? "\n  El TXT ya está: Vercel puede tardar unos minutos en validarlo y emitir\n" +
        "  el certificado. Volver a correr esto en un rato.\n"
      : "\n  Sin el TXT de verificación, Vercel no emite el certificado. Ese es el\n" +
        "  paso bloqueante ahora mismo.\n",
  );
  process.exit(1);
}
ok(login.status === 200, "GET /login responde 200", `HTTP ${login.status}`);

// ── 2. ¿Es NUESTRO proyecto y no otro? ──────────────────────────────────────
const html = await login.texto();
ok(/EFAMEINSA|Efameinsa/.test(html), "la página servida es el CRM de Efameinsa");

// ── 3. El proxy de auth protege lo de adentro ───────────────────────────────
const protegida = await pedir(`${NUEVO}/comercial`);
const vaALogin = protegida.status >= 300 && protegida.status < 400 && (protegida.headers.get("location") ?? "").includes("/login");
ok(vaALogin || protegida.status === 200, "el proxy responde en rutas protegidas", `HTTP ${protegida.status}`);
ok(vaALogin, "sin sesión, /comercial redirige a /login");

// ── 4. Sesión real de un comercial sobre el dominio nuevo ───────────────────
console.log("\n=== SESIÓN REAL ===");
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  aviso("sin SUPABASE_SERVICE_ROLE_KEY no se puede abrir sesión de prueba; se salta");
} else {
  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: perfil } = await admin.from("perfiles").select("id, nombre").ilike("codigo_comercial", "C5").single();
  const { data: usuario } = await admin.auth.admin.getUserById(perfil.id);

  let enlace = null;
  for (let i = 1; i <= 4 && !enlace; i++) {
    const r = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email });
    enlace = r.data?.properties ? r.data : null;
    if (!enlace) await new Promise((res) => setTimeout(res, i * 15000));
  }
  if (!enlace) {
    aviso("Supabase limitó los magic link; no se pudo probar con sesión (reintentar luego)");
  } else {
    const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: sesion } = await anon.auth.verifyOtp({ token_hash: enlace.properties.hashed_token, type: "magiclink" });
    const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const valor = "base64-" + Buffer.from(JSON.stringify(sesion.session)).toString("base64");
    const trozos = valor.match(/.{1,3180}/g);
    const cookie =
      trozos.length === 1
        ? `sb-${ref}-auth-token=${trozos[0]}`
        : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`).join("; ");

    for (const [nombre, ruta, marca] of [
      ["Mi día", "/comercial", "Mi día"],
      ["Mis oportunidades (Kanban)", "/comercial/oportunidades?vista=kanban", "Seguimiento"],
      ["Mi agenda", "/comercial/agenda", "Reporte de hoy"],
    ]) {
      const r = await pedir(`${NUEVO}${ruta}`, { headers: { cookie } });
      const cuerpo = r.status === 200 ? (await r.texto()).replace(/<!--\s*-->/g, "") : "";
      ok(r.status === 200 && cuerpo.includes(marca), `${nombre} carga con sesión de ${perfil.nombre}`, `HTTP ${r.status}`);
    }

    // R2: el archivo de cotizaciones se sirve por URL firmada desde el servidor,
    // así que si esto funciona, R2 no necesita nada por el cambio de dominio.
    const { data: hist } = await admin.from("cotizaciones_historicas").select("id").not("pdf_path", "is", null).limit(1);
    if (hist?.length) {
      const pdf = await pedir(`${NUEVO}/api/cotizaciones-historicas/${hist[0].id}/pdf`, { headers: { cookie } });
      ok([200, 302, 307].includes(pdf.status), "un PDF del archivo (R2) se abre desde el dominio nuevo", `HTTP ${pdf.status}`);
    }
  }
}

// ── 5. El dominio viejo sigue vivo (no debe romperse nada durante la mudanza) ─
console.log("\n=== EL DOMINIO VIEJO ===");
const viejo = await pedir(`${VIEJO}/login`);
ok(viejo.status === 200 || (viejo.status >= 300 && viejo.status < 400), "el .vercel.app sigue respondiendo", `HTTP ${viejo.status}`);
if (viejo.status >= 300 && viejo.status < 400) {
  console.log(`  (redirige a ${viejo.headers.get("location")} — normal si lo pusiste como redirección al dominio nuevo)`);
}

// ── 6. n8n: el único sitio de fuera que llama al CRM ────────────────────────
console.log("\n=== n8n ===");
const N8N = process.env.N8N_URL?.replace(/\/$/, "");
if (!N8N || !process.env.N8N_API_KEY) {
  aviso("sin N8N_URL / N8N_API_KEY: no se revisó n8n");
} else {
  const h = { "X-N8N-API-KEY": process.env.N8N_API_KEY, "Content-Type": "application/json" };
  const lista = await (await fetch(`${N8N}/api/v1/workflows?limit=100`, { headers: h })).json();
  const conUrlVieja = [];
  for (const w of lista.data ?? []) {
    const completo = await (await fetch(`${N8N}/api/v1/workflows/${w.id}`, { headers: h })).json();
    if (JSON.stringify(completo).includes(VIEJO)) conUrlVieja.push(completo);
  }

  if (conUrlVieja.length === 0) {
    ok(true, "ningún workflow de n8n apunta ya al dominio viejo");
  } else if (!APLICAR) {
    for (const w of conUrlVieja) console.log(`  · "${w.name}" (${w.id}) todavía llama a ${VIEJO}`);
    console.log("  → correr con --aplicar para reapuntarlos a " + NUEVO);
    avisos++;
  } else {
    for (const w of conUrlVieja) {
      // La API de n8n solo acepta estos campos en PUT; mandar el objeto entero
      // (con id, active, tags…) devuelve 400.
      const cuerpo = {
        name: w.name,
        nodes: JSON.parse(JSON.stringify(w.nodes).split(VIEJO).join(NUEVO)),
        connections: w.connections,
        settings: w.settings ?? {},
      };
      const r = await fetch(`${N8N}/api/v1/workflows/${w.id}`, { method: "PUT", headers: h, body: JSON.stringify(cuerpo) });
      ok(r.ok, `"${w.name}" reapuntado a ${NUEVO}`, r.ok ? "" : `HTTP ${r.status} ${await r.text()}`);
    }
  }
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log(
  `\n${fallas === 0 ? "✓" : "✗"} ${fallas} falla(s), ${avisos} aviso(s).` +
    (fallas === 0
      ? "\n\nQueda a mano, y solo cuando quieras: el webhook de Google Ads Lead Forms\n(apunta al .vercel.app y seguirá funcionando mientras ese dominio viva).\nVer docs/12-migracion-dominio-crm.md."
      : ""),
);
process.exit(fallas === 0 ? 0 : 1);
