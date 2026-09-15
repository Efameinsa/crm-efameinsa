// Crea (o actualiza) en el n8n PROPIO el flujo «CRM · Correo genérico»: un
// webhook que manda cualquier correo que el CRM le pase (para, asunto, html),
// con el secreto compartido y la credencial de Gmail que ya existe.
//
// Nació para el feedback de la web (0233): lo que cada persona escribe en el
// comunicado se le manda a Santos por correo. Sirve para lo que venga.
//
//   node --env-file=.env.local scripts/n8n-flujo-correo-generico.mjs [--probar correo@destino]
const B = (process.env.N8N_PROPIO_URL ?? "https://n8n.activasme.site").replace(/\/$/, "");
const USUARIO = process.env.N8N_PROPIO_USUARIO;
const CLAVE = process.env.N8N_PROPIO_CLAVE;
const SECRETO = process.env.N8N_WEBHOOK_SECRET;
const REMITENTE = process.env.ALERTAS_CORREO_REMITENTE ?? "corporacionefameinsa.sa@gmail.com";
for (const [k, v] of Object.entries({ N8N_PROPIO_USUARIO: USUARIO, N8N_PROPIO_CLAVE: CLAVE, N8N_WEBHOOK_SECRET: SECRETO })) {
  if (!v) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
}
const r = await fetch(`${B}/rest/login`, { method: "POST", headers: { "Content-Type": "application/json", "browser-id": "crm" }, body: JSON.stringify({ emailOrLdapLoginId: USUARIO, password: CLAVE }) });
if (!r.ok) { console.error("No se pudo entrar a n8n:", r.status); process.exit(1); }
const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const api = async (metodo, ruta, body) => {
  const x = await fetch(`${B}/rest${ruta}`, { method: metodo, headers: { "Content-Type": "application/json", "browser-id": "crm", cookie }, body: body ? JSON.stringify(body) : undefined });
  const j = await x.json().catch(() => null);
  if (!x.ok) throw new Error(`${metodo} ${ruta} → ${x.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j?.data ?? j;
};
const credenciales = await api("GET", "/credentials?includeScopes=true").catch(() => []);
const cred = (Array.isArray(credenciales) ? credenciales : []).find((c) => c.name === "Correo Efameinsa (Gmail)");
if (!cred) { console.error("No está la credencial «Correo Efameinsa (Gmail)»"); process.exit(1); }

const NOMBRE = "CRM · Correo genérico";
const nodos = [
  { parameters: { httpMethod: "POST", path: "crm-correo", responseMode: "onReceived", options: {} }, id: "webhook", name: "Correo del CRM", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: "crm-correo" },
  { parameters: { conditions: { options: { caseSensitive: true, version: 2 }, conditions: [{ leftValue: "={{ $json.body.secreto }}", rightValue: SECRETO, operator: { type: "string", operation: "equals" } }], combinator: "and" }, options: {} }, id: "guardia", name: "¿Viene del CRM?", type: "n8n-nodes-base.if", typeVersion: 2, position: [220, 0] },
  { parameters: { fromEmail: REMITENTE, toEmail: "={{ $json.body.para }}", subject: "={{ $json.body.asunto }}", emailFormat: "html", html: "={{ $json.body.html }}", options: { replyTo: "={{ $json.body.responder_a || '' }}" } }, id: "correo", name: "Enviar", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [460, -80], credentials: { smtp: { id: cred.id, name: "Correo Efameinsa (Gmail)" } } },
];
const conexiones = { "Correo del CRM": { main: [[{ node: "¿Viene del CRM?", type: "main", index: 0 }]] }, "¿Viene del CRM?": { main: [[{ node: "Enviar", type: "main", index: 0 }], []] } };
const flujos = await api("GET", "/workflows?includeScopes=true");
const lista = Array.isArray(flujos) ? flujos : (flujos?.data ?? []);
const existente = lista.find((f) => f.name === NOMBRE);
const cuerpo = { name: NOMBRE, nodes: nodos, connections: conexiones, settings: { executionOrder: "v1" } };
let id;
if (existente) { await api("PATCH", `/workflows/${existente.id}`, cuerpo); id = existente.id; console.log("Flujo actualizado:", id); }
else { const nuevo = await api("POST", "/workflows", cuerpo); id = nuevo.id; console.log("Flujo creado:", id); }
{
  const w = await api("GET", `/workflows/${id}`);
  if (!w.active) await api("POST", `/workflows/${id}/activate`, { versionId: w.versionId });
  console.log("Estado:", (await api("GET", `/workflows/${id}`)).active ? "ACTIVO" : "SIGUE APAGADO");
}
console.log(`Webhook: ${B}/webhook/crm-correo`);
const i = process.argv.indexOf("--probar");
if (i !== -1) {
  const x = await fetch(`${B}/webhook/crm-correo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secreto: SECRETO, para: process.argv[i + 1], asunto: "CRM · PRUEBA del correo genérico", html: "<p>Si lee esto, el flujo genérico funciona.</p>" }) });
  console.log("Prueba:", x.status);
}
