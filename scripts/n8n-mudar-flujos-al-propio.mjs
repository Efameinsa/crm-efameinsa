// Muda los flujos del n8n VIEJO (externo, n8n.bezenti.com) al n8n PROPIO de la
// empresa (la VM archivo-crm, publicada en n8n.activasme.site).
//
// POR QUÉ: en el servidor ajeno viven hoy la contraseña de aplicación del
// Gmail de la empresa y un token que abre un endpoint del CRM en producción.
// Mientras sigan ahí, dos llaves de Efameinsa están en infraestructura de un
// tercero.
//
// UN CAMBIO DE DESTINATARIO, PEDIDO POR SANTOS (09-09): «SLA leads esperando»
// deja de escribirle a Carlos. Él lo pidió el 04-09 —«quítame ya todas las
// alertas que llegan a mi correo»— y ese flujo, como tiene reloj propio y no
// depende del CRM, siguió mandándole un correo por hora durante cinco días.
// Central lo sigue recibiendo.
//
//   node --env-file=.env.local scripts/n8n-mudar-flujos-al-propio.mjs
//   node --env-file=.env.local scripts/n8n-mudar-flujos-al-propio.mjs --aplicar
//
// Sin `--aplicar` solo dice qué haría.
const APLICAR = process.argv.includes("--aplicar");
const VIEJO = process.env.N8N_URL, LLAVE = process.env.N8N_API_KEY;
const NUEVO = process.env.N8N_PROPIO_URL, USUARIO = process.env.N8N_PROPIO_USUARIO, CLAVE = process.env.N8N_PROPIO_CLAVE;
const SIN_CARLOS = process.env.ALERTAS_CORREO_CARLOS;

for (const [k, v] of Object.entries({ N8N_URL: VIEJO, N8N_API_KEY: LLAVE, N8N_PROPIO_URL: NUEVO, N8N_PROPIO_USUARIO: USUARIO, N8N_PROPIO_CLAVE: CLAVE })) {
  if (!v) { console.error(`Falta ${k} en .env.local`); process.exit(1); }
}

const viejo = async (ruta, opciones = {}) => {
  const r = await fetch(`${VIEJO}/api/v1${ruta}`, { ...opciones, headers: { "X-N8N-API-KEY": LLAVE, "Content-Type": "application/json", ...(opciones.headers ?? {}) } });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`viejo ${ruta} → ${r.status} ${JSON.stringify(j).slice(0, 160)}`);
  return j;
};

const login = await fetch(`${NUEVO}/rest/login`, {
  method: "POST", headers: { "Content-Type": "application/json", "browser-id": "crm" },
  body: JSON.stringify({ emailOrLdapLoginId: USUARIO, password: CLAVE }),
});
if (!login.ok) { console.error("No se pudo entrar al n8n propio:", login.status); process.exit(1); }
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const nuevo = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${NUEVO}/rest${ruta}`, {
    method: metodo, headers: { "Content-Type": "application/json", "browser-id": "crm", cookie },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`propio ${metodo} ${ruta} → ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j?.data ?? j;
};

// La credencial de correo del n8n propio: la creó el flujo de la orden de
// trabajo. Se reutiliza para que no queden dos con la misma clave adentro.
const credenciales = await nuevo("GET", "/credentials?includeScopes=true").catch(() => []);
const smtp = (Array.isArray(credenciales) ? credenciales : []).find((c) => c.type === "smtp");
if (!smtp) { console.error("El n8n propio no tiene credencial de correo. Corra antes n8n-flujo-orden-trabajo.mjs"); process.exit(1); }
console.log("Credencial de correo del n8n propio:", smtp.name, `(${smtp.id})`);

const yaEstan = await nuevo("GET", "/workflows");
const listaNueva = Array.isArray(yaEstan) ? yaEstan : (yaEstan?.data ?? []);

const { data: flujosViejos } = await viejo("/workflows?limit=50");
let mudados = 0;
for (const f of flujosViejos) {
  if (!f.active) { console.log(`· ${f.name}: apagado en el viejo, no se muda`); continue; }
  const completo = await viejo(`/workflows/${f.id}`);
  const nodos = JSON.parse(JSON.stringify(completo.nodes));

  for (const n of nodos) {
    // La credencial de correo apunta a un id que solo existe en el viejo.
    if (n.credentials?.smtp) n.credentials.smtp = { id: smtp.id, name: smtp.name };
    // Y el destinatario de la alarma horaria pierde a Carlos.
    if (n.name === "Destinatarios" && SIN_CARLOS) {
      const asigs = n.parameters?.assignments?.assignments ?? [];
      for (const a of asigs) {
        if (typeof a.value === "string" && a.value.includes(SIN_CARLOS)) {
          a.value = a.value.split(",").map((x) => x.trim()).filter((x) => x && x !== SIN_CARLOS).join(", ");
          console.log(`  · ${f.name}: destinatarios ahora → ${a.value}`);
        }
      }
    }
  }

  // SI CARLOS ERA EL ÚNICO DESTINATARIO, el flujo se queda sin a quién
  // escribirle. Es el caso del «Timbre de lead nuevo», que era suyo y de nadie
  // más. Se muda igual —para no perderlo— pero APAGADO: un flujo que manda
  // correo a nadie no avisa, solo ensucia el historial de ejecuciones.
  const sinDestinatario = nodos.some(
    (n) => n.name === "Destinatarios" &&
      (n.parameters?.assignments?.assignments ?? []).some((a) => a.name === "para" && !String(a.value ?? "").trim()),
  );

  const cuerpo = { name: completo.name, nodes: nodos, connections: completo.connections, settings: completo.settings ?? { executionOrder: "v1" } };
  const existente = listaNueva.find((x) => x.name === completo.name);
  if (!APLICAR) {
    console.log(`· ${f.name}: ${existente ? "se ACTUALIZARÍA" : "se CREARÍA"} en el propio ${sinDestinatario ? "PERO APAGADO (se quedó sin destinatario)" : "y activo"}, y se apagaría en el viejo`);
    continue;
  }

  let id;
  if (existente) { await nuevo("PATCH", `/workflows/${existente.id}`, cuerpo); id = existente.id; }
  else { id = (await nuevo("POST", "/workflows", cuerpo)).id; }

  // Activar exige el versionId de la última versión guardada.
  if (!sinDestinatario) {
    const guardado = await nuevo("GET", `/workflows/${id}`);
    await nuevo("POST", `/workflows/${id}/activate`, { versionId: guardado.versionId });
  }

  // Y recién entonces se apaga en el viejo: si se apagara antes y algo fallara,
  // quedaríamos sin la alarma en ningún lado.
  await viejo(`/workflows/${f.id}/deactivate`, { method: "POST" });
  console.log(`✓ ${f.name}: ${sinDestinatario ? "mudado APAGADO (sin destinatario)" : "activo"} en el propio (${id}) y apagado en el viejo`);
  mudados++;
}

console.log(APLICAR ? `\n${mudados} flujo(s) mudado(s).` : "\n(ensayo: no se tocó nada — para hacerlo, --aplicar)");
