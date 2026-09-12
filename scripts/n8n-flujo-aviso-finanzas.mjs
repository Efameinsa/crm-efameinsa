// Crea (o actualiza) en el n8n PROPIO el flujo que convierte en correo el
// aviso que Central le manda a Finanzas cuando un cliente termina de pagar.
//
// Carlos, 05-09: «yo elegí WhatsApp por ser un canal rápido — muy bien. Yo
// creo que debería ser también a la vez por correo». El CRM lo dispara desde
// `avisarFinanzasN8n` (POST /webhook/crm-aviso-finanzas) con `para`, `asunto`,
// `cuerpo`, `cliente`, `documento`, `telefono`, `registradoPor` y `url_crm`.
//
// Santos, 12-09: «no llega correo a Finanzas». No llegaba porque este flujo no
// existía en ningún n8n: el CRM disparaba a una dirección que nadie escuchaba.
//
//   node --env-file=.env.local scripts/n8n-flujo-aviso-finanzas.mjs
//   node --env-file=.env.local scripts/n8n-flujo-aviso-finanzas.mjs --probar correo@destino
//
// Con --probar manda un aviso de ensayo a ese correo por el webhook real, para
// ver que la credencial de Gmail y el flujo funcionan de punta a punta.
const B = (process.env.N8N_PROPIO_URL ?? "https://n8n.activasme.site").replace(/\/$/, "");
const USUARIO = process.env.N8N_PROPIO_USUARIO;
const CLAVE = process.env.N8N_PROPIO_CLAVE;
const SECRETO = process.env.N8N_WEBHOOK_SECRET;
const REMITENTE = process.env.ALERTAS_CORREO_REMITENTE ?? "corporacionefameinsa.sa@gmail.com";

for (const [k, v] of Object.entries({ N8N_PROPIO_USUARIO: USUARIO, N8N_PROPIO_CLAVE: CLAVE, N8N_WEBHOOK_SECRET: SECRETO })) {
  if (!v) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
}

const r = await fetch(`${B}/rest/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "browser-id": "crm" },
  body: JSON.stringify({ emailOrLdapLoginId: USUARIO, password: CLAVE }),
});
if (!r.ok) { console.error("No se pudo entrar a n8n:", r.status); process.exit(1); }
const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const api = async (metodo, ruta, body) => {
  const x = await fetch(`${B}/rest${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", "browser-id": "crm", cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await x.json().catch(() => null);
  if (!x.ok) throw new Error(`${metodo} ${ruta} → ${x.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j?.data ?? j;
};

// La credencial de correo ya existe (la creó n8n-flujo-orden-trabajo.mjs).
const credenciales = await api("GET", "/credentials?includeScopes=true").catch(() => []);
const cred = (Array.isArray(credenciales) ? credenciales : []).find((c) => c.name === "Correo Efameinsa (Gmail)");
if (!cred) { console.error("No está la credencial «Correo Efameinsa (Gmail)»: correr antes n8n-flujo-orden-trabajo.mjs"); process.exit(1); }

const NOMBRE = "CRM · Aviso a Finanzas";
const nodos = [
  {
    parameters: { httpMethod: "POST", path: "crm-aviso-finanzas", responseMode: "onReceived", options: {} },
    id: "webhook", name: "Aviso del CRM", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "crm-aviso-finanzas",
  },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, version: 2 },
        conditions: [{ leftValue: "={{ $json.body.secreto }}", rightValue: SECRETO, operator: { type: "string", operation: "equals" } }],
        combinator: "and",
      },
      options: {},
    },
    id: "guardia", name: "¿Viene del CRM?", type: "n8n-nodes-base.if", typeVersion: 2, position: [220, 0],
  },
  {
    parameters: {
      fromEmail: REMITENTE,
      // El destinatario lo pone el CRM (CORREO_FINANZAS en src/lib/tesoreria.ts):
      // así se cambia en un solo sitio.
      toEmail: "={{ $json.body.para }}",
      subject: "={{ $json.body.asunto || ('CRM · Aviso a Finanzas · ' + ($json.body.cliente || '')) }}",
      emailFormat: "html",
      html:
        "={{ (() => { const b = $json.body; const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');\n" +
        "return '<div style=\"font-family:Arial,sans-serif;max-width:560px\">'\n" +
        " + '<h2 style=\"color:#7E1210;margin:0 0 6px\">Pago de cliente para Tesorería</h2>'\n" +
        " + '<p style=\"font-size:15px;margin:4px 0\"><b>' + esc(b.cliente || 'Cliente') + '</b>' + (b.documento ? ' · ' + esc(b.documento) : '') + '</p>'\n" +
        " + (b.telefono ? '<p style=\"margin:2px 0\">Teléfono del cliente: <a href=\"tel:' + esc(b.telefono) + '\">' + esc(b.telefono) + '</a></p>' : '')\n" +
        " + '<pre style=\"white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px;background:#F6F4F2;padding:10px;border-radius:6px\">' + esc(b.cuerpo) + '</pre>'\n" +
        " + '<p style=\"color:#6B6B6B;font-size:12px\">Registrado en el CRM por ' + esc(b.registradoPor || 'Central') + (b.enviado ? ' · ' + esc(b.enviado) : '') + '</p>'\n" +
        " + (b.url_crm ? '<p><a href=\"' + esc(b.url_crm) + '\">Abrir en el CRM</a></p>' : '')\n" +
        " + '</div>'; })() }}",
      options: {},
    },
    id: "correo", name: "Correo a Finanzas", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [460, -80],
    credentials: { smtp: { id: cred.id, name: "Correo Efameinsa (Gmail)" } },
  },
];
const conexiones = {
  "Aviso del CRM": { main: [[{ node: "¿Viene del CRM?", type: "main", index: 0 }]] },
  "¿Viene del CRM?": { main: [[{ node: "Correo a Finanzas", type: "main", index: 0 }], []] },
};

const flujos = await api("GET", "/workflows?includeScopes=true");
const lista = Array.isArray(flujos) ? flujos : (flujos?.data ?? []);
const existente = lista.find((f) => f.name === NOMBRE);
const cuerpo = { name: NOMBRE, nodes: nodos, connections: conexiones, settings: { executionOrder: "v1" } };
let id;
if (existente) {
  await api("PATCH", `/workflows/${existente.id}`, cuerpo);
  id = existente.id;
  console.log("Flujo actualizado:", id);
} else {
  const nuevo = await api("POST", "/workflows", cuerpo);
  id = nuevo.id;
  console.log("Flujo creado:", id);
}
// PATCH {active:true} contesta 200 pero no registra el webhook: activar es
// POST /activate con el versionId vigente (memoria n8n-propio-en-la-vm).
{
  const w = await api("GET", `/workflows/${id}`);
  if (!w.active) await api("POST", `/workflows/${id}/activate`, { versionId: w.versionId });
  const w2 = await api("GET", `/workflows/${id}`);
  console.log("Estado:", w2.active ? "ACTIVO" : "SIGUE APAGADO");
}
console.log(`Activo en ${B}/webhook/crm-aviso-finanzas (el CRM lo deriva de N8N_LEAD_WEBHOOK_URL).`);

const i = process.argv.indexOf("--probar");
if (i !== -1) {
  const para = process.argv[i + 1];
  const x = await fetch(`${B}/webhook/crm-aviso-finanzas`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secreto: SECRETO, para, asunto: "CRM · PRUEBA del aviso a Finanzas", cliente: "CLIENTE DE PRUEBA S.A.C.", documento: "20123456789",
      telefono: "987 654 321", cuerpo: "Esto es una prueba del circuito CRM → n8n → Gmail. Si lo lee, el aviso a Finanzas funciona.",
      registradoPor: "Verificación", url_crm: "https://crm.efameinsa.com/central/derivados", enviado: new Date().toISOString(),
    }),
  });
  console.log(`Prueba a ${para}: webhook respondió ${x.status}`);
  await new Promise((s) => setTimeout(s, 4000));
  const ej = await api("GET", `/executions?filter=${encodeURIComponent(JSON.stringify({ workflowId: id }))}&limit=1`);
  const e = (Array.isArray(ej) ? ej : ej?.results ?? ej?.data ?? [])[0];
  console.log("Última ejecución:", e ? `${e.status ?? e.finished} ${e.startedAt ?? ""}` : "(sin registro todavía)");
}
