// Crea (o actualiza) en n8n los dos flujos de alertas de leads por correo:
//   1. "CRM · Timbre de lead nuevo" — webhook que dispara el CRM en cada
//      lead (avisos-n8n.ts) → valida el secreto compartido → Gmail.
//   2. "CRM · SLA leads esperando" — cron cada 15 min → consulta
//      /api/alertas/leads-esperando del CRM → si hay leads esperando, Gmail.
//
// Se crean DESACTIVADOS y con el destinatario de PRUEBA
// (ALERTAS_CORREO_PERSONAL). Cuando esté verificado, cambiar el correo en el
// nodo "Destinatarios" de cada flujo y activar. El nodo de Gmail queda sin
// credencial: se elige una vez en la interfaz de n8n (OAuth de Google no se
// puede crear por API).
//
// Uso: node --env-file=.env.local scripts/n8n-crear-flujos-alertas.mjs

const URL = process.env.N8N_URL, KEY = process.env.N8N_API_KEY;
const SECRETO = process.env.N8N_WEBHOOK_SECRET, CRON = process.env.CRON_SECRET;
// Destinatarios verificados 19-08 (la prueba fue al correo personal de
// Darwin, ya retirado): timbre → Carlos (lo filtra a una carpeta);
// derivación → Carlos + Karen; SLA → Central con copia a Carlos.
const CARLOS = process.env.ALERTAS_CORREO_CARLOS;
const KAREN = process.env.ALERTAS_CORREO_KAREN;
const CENTRAL = process.env.ALERTAS_CORREO_CENTRAL;
const REMITENTE = process.env.ALERTAS_CORREO_REMITENTE, CRED = process.env.N8N_SMTP_CRED_ID;
for (const [k, v] of Object.entries({ N8N_URL: URL, N8N_API_KEY: KEY, N8N_WEBHOOK_SECRET: SECRETO, CRON_SECRET: CRON, ALERTAS_CORREO_CARLOS: CARLOS, ALERTAS_CORREO_KAREN: KAREN, ALERTAS_CORREO_CENTRAL: CENTRAL, ALERTAS_CORREO_REMITENTE: REMITENTE, N8N_SMTP_CRED_ID: CRED })) {
  if (!v) { console.error("Falta " + k + " en .env.local"); process.exit(1); }
}

async function api(metodo, ruta, body) {
  const r = await fetch(URL + "/api/v1" + ruta, {
    method: metodo,
    headers: { "X-N8N-API-KEY": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

const timbre = {
  name: "CRM · Timbre de lead nuevo",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      id: "wh1", name: "Lead nuevo (webhook del CRM)", type: "n8n-nodes-base.webhook", typeVersion: 2,
      position: [0, 0],
      parameters: { httpMethod: "POST", path: "crm-lead-nuevo", options: {} },
    },
    {
      id: "if1", name: "¿Secreto válido?", type: "n8n-nodes-base.if", typeVersion: 2.2,
      position: [220, 0],
      parameters: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        conditions: {
          combinator: "and",
          conditions: [
            {
              leftValue: "={{ $json.body.secreto }}",
              rightValue: SECRETO,
              operator: { type: "string", operation: "equals" },
            },
          ],
        },
      },
    },
    {
      id: "set1", name: "Destinatarios", type: "n8n-nodes-base.set", typeVersion: 3.4,
      position: [440, 0],
      parameters: {
        assignments: {
          assignments: [
            { id: "a1", name: "para", type: "string", value: CARLOS },
          ],
        },
        includeOtherFields: true,
        options: {},
      },
      notes: "Timbre por lead entrante → ing. Carlos (él lo filtra a una carpeta de Gmail).",
    },
    {
      id: "mail1", name: "Enviar correo", type: "n8n-nodes-base.emailSend", typeVersion: 2.1,
      position: [660, 0],
      credentials: { smtp: { id: process.env.N8N_SMTP_CRED_ID, name: "Gmail SMTP Efameinsa" } },
      parameters: {
        fromEmail: process.env.ALERTAS_CORREO_REMITENTE,
        toEmail: "={{ $json.para }}",
        subject: "={{ '🔔 ' + $('Lead nuevo (webhook del CRM)').item.json.body.titulo + ': ' + $('Lead nuevo (webhook del CRM)').item.json.body.nombre }}",
        html: `={{ (() => { const b = $('Lead nuevo (webhook del CRM)').item.json.body;
return '<div style="font-family:Arial,sans-serif;max-width:520px">'
 + '<h2 style="color:#7E1210;margin:0 0 4px">' + (b.titulo || 'Nuevo lead') + '</h2>'
 + '<p style="font-size:15px;margin:4px 0"><b>' + (b.nombre || 'Sin nombre') + '</b>' + (b.razonSocial ? ' · ' + b.razonSocial : '') + '</p>'
 + '<table style="font-size:14px;border-collapse:collapse">'
 + (b.telefono ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Teléfono</td><td><a href="tel:' + b.telefono + '">' + b.telefono + '</a></td></tr>' : '')
 + (b.email ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Correo</td><td>' + b.email + '</td></tr>' : '')
 + '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Vía</td><td>' + (b.canal || '—') + '</td></tr>'
 + (b.campania ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Campaña</td><td>' + b.campania + '</td></tr>' : '')
 + (b.codigo ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Código</td><td>' + b.codigo + '</td></tr>' : '')
 + '</table>'
 + (b.mensaje ? '<p style="font-size:13px;color:#444;background:#f4f2f2;padding:8px;border-radius:6px">' + b.mensaje + '</p>' : '')
 + '<p style="margin:14px 0"><a href="' + b.url_bandeja + '" style="background:#7E1210;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Abrir bandeja y asignar</a></p>'
 + '<p style="font-size:11px;color:#999">CRM Efameinsa · aviso automático</p></div>'; })() }}`,
        options: {},
      },
    },
  ],
  connections: {
    "Lead nuevo (webhook del CRM)": { main: [[{ node: "¿Secreto válido?", type: "main", index: 0 }]] },
    "¿Secreto válido?": { main: [[{ node: "Destinatarios", type: "main", index: 0 }], []] },
    Destinatarios: { main: [[{ node: "Enviar correo", type: "main", index: 0 }]] },
  },
};

const sla = {
  name: "CRM · SLA leads esperando",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      id: "cron1", name: "Cada hora", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
    },
    {
      id: "http1", name: "Consultar CRM", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2,
      position: [220, 0],
      parameters: {
        url: "https://crm-efameinsa.vercel.app/api/alertas/leads-esperando",
        sendQuery: true,
        queryParameters: { parameters: [{ name: "min", value: "60" }, { name: "horas", value: "2" }] },
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Authorization", value: "Bearer " + CRON }] },
        options: {},
      },
    },
    {
      id: "if2", name: "¿Hay leads esperando?", type: "n8n-nodes-base.if", typeVersion: 2.2,
      position: [440, 0],
      parameters: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        conditions: {
          combinator: "and",
          conditions: [
            { leftValue: "={{ $json.total }}", rightValue: 0, operator: { type: "number", operation: "gt" } },
          ],
        },
      },
    },
    {
      id: "set2", name: "Destinatarios", type: "n8n-nodes-base.set", typeVersion: 3.4,
      position: [660, 0],
      parameters: {
        assignments: { assignments: [{ id: "a1", name: "para", type: "string", value: CENTRAL + ", " + CARLOS }] },
        includeOtherFields: true,
        options: {},
      },
      notes: "SLA → Central, con copia al ing. Carlos.",
    },
    {
      id: "mail2", name: "Enviar correo", type: "n8n-nodes-base.emailSend", typeVersion: 2.1,
      position: [880, 0],
      credentials: { smtp: { id: process.env.N8N_SMTP_CRED_ID, name: "Gmail SMTP Efameinsa" } },
      parameters: {
        fromEmail: process.env.ALERTAS_CORREO_REMITENTE,
        toEmail: "={{ $json.para }}",
        subject: "={{ '⚠ ' + $('Consultar CRM').item.json.total + ' lead(s) esperando atención' }}",
        html: `={{ (() => { const d = $('Consultar CRM').item.json;
const fila = (c) => '<tr><td style="padding:3px 10px 3px 0"><b>' + c.nombre + '</b>' + (c.codigo ? ' (' + c.codigo + ')' : '') + '</td><td style="padding:3px 10px 3px 0">' + (c.telefono || '') + '</td><td style="color:#B3261E;font-weight:bold">' + c.minutos_esperando + ' min</td><td style="color:#6B6B6B">' + c.canal + (c.es_publicidad ? ' · 📢 publicidad' : '') + '</td></tr>';
const fila2 = (c) => '<tr><td style="padding:3px 10px 3px 0"><b>' + c.nombre + '</b>' + (c.codigo ? ' (' + c.codigo + ')' : '') + '</td><td style="color:#B3261E;font-weight:bold">' + c.horas_desde_asignacion + ' h sin gestión</td><td style="color:#6B6B6B">' + c.comercial + '</td></tr>';
return '<div style="font-family:Arial,sans-serif;max-width:640px">'
 + '<h2 style="color:#7E1210;margin:0 0 8px">Leads esperando atención</h2>'
 + (d.pendientes.length ? '<h3 style="font-size:14px;margin:10px 0 4px">Sin asignar hace más de ' + d.umbrales.pendiente_min + ' min (' + d.pendientes.length + ')</h3><table style="font-size:13px;border-collapse:collapse">' + d.pendientes.map(fila).join('') + '</table>' : '')
 + (d.sin_primera_gestion.length ? '<h3 style="font-size:14px;margin:12px 0 4px">Asignados sin primera gestión (' + d.sin_primera_gestion.length + ')</h3><table style="font-size:13px;border-collapse:collapse">' + d.sin_primera_gestion.map(fila2).join('') + '</table>' : '')
 + '<p style="margin:14px 0"><a href="' + d.url_bandeja + '" style="background:#7E1210;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Abrir bandeja</a></p>'
 + '<p style="font-size:11px;color:#999">CRM Efameinsa · revisión automática cada hora · umbrales: ' + d.umbrales.pendiente_min + ' min sin asignar / ' + d.umbrales.sin_gestion_horas + ' h sin gestión</p></div>'; })() }}`,
        options: {},
      },
    },
  ],
  connections: {
    "Cada hora": { main: [[{ node: "Consultar CRM", type: "main", index: 0 }]] },
    "Consultar CRM": { main: [[{ node: "¿Hay leads esperando?", type: "main", index: 0 }]] },
    "¿Hay leads esperando?": { main: [[{ node: "Destinatarios", type: "main", index: 0 }], []] },
    Destinatarios: { main: [[{ node: "Enviar correo", type: "main", index: 0 }]] },
  },
};

const derivado = {
  name: "CRM · Lead derivado a comercial",
  settings: { executionOrder: "v1" },
  nodes: [
    {
      id: "wh2", name: "Derivación (webhook del CRM)", type: "n8n-nodes-base.webhook", typeVersion: 2,
      position: [0, 0],
      parameters: { httpMethod: "POST", path: "crm-lead-derivado", options: {} },
    },
    {
      id: "if3", name: "¿Secreto válido?", type: "n8n-nodes-base.if", typeVersion: 2.2,
      position: [220, 0],
      parameters: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        conditions: {
          combinator: "and",
          conditions: [
            { leftValue: "={{ $json.body.secreto }}", rightValue: SECRETO, operator: { type: "string", operation: "equals" } },
          ],
        },
      },
    },
    {
      id: "set3", name: "Destinatarios", type: "n8n-nodes-base.set", typeVersion: 3.4,
      position: [440, 0],
      parameters: {
        assignments: { assignments: [{ id: "a1", name: "para", type: "string", value: CARLOS + ", " + KAREN }] },
        includeOtherFields: true,
        options: {},
      },
      notes: "Derivación → gerencia (Carlos y Karen). Es EL correo que Carlos pidió el 19-08: uno por derivación, no por llegada.",
    },
    {
      id: "mail3", name: "Enviar correo", type: "n8n-nodes-base.emailSend", typeVersion: 2.1,
      position: [660, 0],
      credentials: { smtp: { id: process.env.N8N_SMTP_CRED_ID, name: "Gmail SMTP Efameinsa" } },
      parameters: {
        fromEmail: process.env.ALERTAS_CORREO_REMITENTE,
        toEmail: "={{ $json.para }}",
        subject: "={{ '📨 Derivado a ' + $('Derivación (webhook del CRM)').item.json.body.comercial + ': ' + $('Derivación (webhook del CRM)').item.json.body.nombre }}",
        html: `={{ (() => { const b = $('Derivación (webhook del CRM)').item.json.body;
return '<div style="font-family:Arial,sans-serif;max-width:520px">'
 + '<h2 style="color:#7E1210;margin:0 0 4px">Lead derivado a comercial</h2>'
 + '<p style="font-size:15px;margin:4px 0"><b>' + (b.nombre || 'Sin nombre') + '</b>' + (b.razonSocial ? ' · ' + b.razonSocial : '') + '</p>'
 + '<table style="font-size:14px;border-collapse:collapse">'
 + '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Derivado a</td><td><b>' + (b.comercial || '—') + '</b></td></tr>'
 + (b.derivadoPor ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Derivó</td><td>' + b.derivadoPor + '</td></tr>' : '')
 + (b.telefono ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Teléfono</td><td>' + b.telefono + '</td></tr>' : '')
 + '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Vía</td><td>' + (b.canal || '—') + '</td></tr>'
 + (b.codigo ? '<tr><td style="color:#6B6B6B;padding:2px 10px 2px 0">Código</td><td>' + b.codigo + '</td></tr>' : '')
 + '</table>'
 + '<p style="font-size:11px;color:#999;margin-top:14px">CRM Efameinsa · aviso automático de derivación</p></div>'; })() }}`,
        options: {},
      },
    },
  ],
  connections: {
    "Derivación (webhook del CRM)": { main: [[{ node: "¿Secreto válido?", type: "main", index: 0 }]] },
    "¿Secreto válido?": { main: [[{ node: "Destinatarios", type: "main", index: 0 }], []] },
    Destinatarios: { main: [[{ node: "Enviar correo", type: "main", index: 0 }]] },
  },
};

const existentes = (await api("GET", "/workflows")).data;
for (const wf of [timbre, sla, derivado]) {
  const ya = existentes.find((w) => w.name === wf.name);
  if (ya) {
    await api("PUT", "/workflows/" + ya.id, wf);
    console.log("actualizado:", wf.name, "(id " + ya.id + ")");
  } else {
    const creado = await api("POST", "/workflows", wf);
    console.log("creado:", wf.name, "(id " + creado.id + ")");
  }
}
console.log("\nAmbos quedan DESACTIVADOS. Falta: elegir la credencial de Gmail en los nodos 'Enviar correo' (interfaz de n8n) y activar.");
