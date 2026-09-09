// Crea (o actualiza) en el n8n PROPIO el flujo que convierte en correo la
// orden de trabajo que dispara el CRM al programar una atención.
//
// Carlos, 09-09: «de aquí le demos la orden, mediante el correo electrónico,
// desde CRM… y ya no le va a llenar nada, si no todo está ahí. ¡Pum! Se jala».
// Va al ALMACÉN, no al cliente.
//
//   node --env-file=.env.local scripts/n8n-flujo-orden-trabajo.mjs
//
// El destinatario sale de ORDEN_TRABAJO_DESTINO; mientras no esté definido, va
// al correo de PRUEBA (ALERTAS_CORREO_PERSONAL) — una orden de trabajo mandada
// a la dirección equivocada es peor que no mandarla.
const B = process.env.N8N_PROPIO_URL ?? "https://n8n.activasme.site";
const USUARIO = process.env.N8N_PROPIO_USUARIO;
const CLAVE = process.env.N8N_PROPIO_CLAVE;
const SECRETO = process.env.N8N_WEBHOOK_SECRET;
const REMITENTE = process.env.ALERTAS_CORREO_REMITENTE;
const CLAVE_GMAIL = process.env.GMAIL_APP_PASSWORD;
const DESTINO = process.env.ORDEN_TRABAJO_DESTINO ?? process.env.ALERTAS_CORREO_PERSONAL;

for (const [k, v] of Object.entries({ N8N_PROPIO_USUARIO: USUARIO, N8N_PROPIO_CLAVE: CLAVE, N8N_WEBHOOK_SECRET: SECRETO, ALERTAS_CORREO_REMITENTE: REMITENTE, GMAIL_APP_PASSWORD: CLAVE_GMAIL })) {
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

// ── La credencial de correo ────────────────────────────────────────────────
const credenciales = await api("GET", "/credentials?includeScopes=true").catch(() => []);
const yaEsta = (Array.isArray(credenciales) ? credenciales : []).find((c) => c.name === "Correo Efameinsa (Gmail)");
let credId = yaEsta?.id;
if (!credId) {
  const cred = await api("POST", "/credentials", {
    name: "Correo Efameinsa (Gmail)",
    type: "smtp",
    data: { user: REMITENTE, password: CLAVE_GMAIL, host: "smtp.gmail.com", port: 465, secure: true, disableStartTls: false },
  });
  credId = cred.id;
  console.log("Credencial de correo creada:", credId);
} else {
  console.log("Credencial de correo que ya estaba:", credId);
}

// ── El flujo ───────────────────────────────────────────────────────────────
const NOMBRE = "CRM · Orden de trabajo a producción";
const nodos = [
  {
    parameters: { httpMethod: "POST", path: "crm-orden-trabajo", responseMode: "onReceived", options: {} },
    id: "webhook", name: "Orden del CRM", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "crm-orden-trabajo",
  },
  {
    // El secreto compartido: sin esto, cualquiera que sepa la dirección podría
    // mandarle órdenes de trabajo al almacén.
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
      toEmail: DESTINO,
      subject: "={{ 'Orden de trabajo · ' + $json.body.cliente + ' · ' + ($json.body.tipo || '') }}",
      emailFormat: "html",
      html:
        "={{ '<h2>Orden de trabajo</h2>' +\n" +
        "'<p><b>Cliente:</b> ' + $json.body.cliente + ($json.body.ruc ? ' (RUC ' + $json.body.ruc + ')' : '') + '</p>' +\n" +
        "'<p><b>Programado:</b> ' + $json.body.cuando + ($json.body.tecnico ? ' · <b>Técnico:</b> ' + $json.body.tecnico : '') + '</p>' +\n" +
        "'<p><b>Equipo:</b> ' + ($json.body.equipo || 'sin identificar') + ($json.body.serie ? ' · <b>Serie:</b> ' + $json.body.serie : '') + '</p>' +\n" +
        "'<p><b>Garantía:</b> ' + ($json.body.enGarantia === true ? 'SÍ, en garantía' : $json.body.enGarantia === false ? 'Fuera de garantía' : 'sin verificar') + '</p>' +\n" +
        "'<p><b>Lo que reportó el cliente:</b><br>' + ($json.body.reporto || '—') + '</p>' +\n" +
        "'<h3>Antecedentes de esta máquina</h3>' +\n" +
        "(($json.body.antecedentes || []).length ? '<ul>' + ($json.body.antecedentes || []).map(a => '<li>' + a.fecha + ' — ' + a.que + '</li>').join('') + '</ul>' : '<p>Es la primera vez que entra al circuito.</p>') +\n" +
        "'<p><a href=\"' + $json.body.enlace + '\">Abrir el caso en el CRM</a></p>' }}",
      options: {},
    },
    id: "correo", name: "Correo al almacén", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [460, -80],
    credentials: { smtp: { id: credId, name: "Correo Efameinsa (Gmail)" } },
  },
];
const conexiones = {
  "Orden del CRM": { main: [[{ node: "¿Viene del CRM?", type: "main", index: 0 }]] },
  "¿Viene del CRM?": { main: [[{ node: "Correo al almacén", type: "main", index: 0 }], []] },
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
await api("PATCH", `/workflows/${id}`, { active: true }).catch(async () => {
  await api("POST", `/workflows/${id}/activate`, {});
});
console.log(`\nActivo. El CRM tiene que apuntar a:\n  N8N_ORDEN_TRABAJO_URL=${B}/webhook/crm-orden-trabajo`);
console.log(`El correo sale a: ${DESTINO}${process.env.ORDEN_TRABAJO_DESTINO ? "" : "  ← es el de PRUEBA; falta el del almacén"}`);
