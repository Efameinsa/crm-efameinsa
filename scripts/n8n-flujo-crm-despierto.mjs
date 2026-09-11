// ============================================================
// n8n propio · «CRM despierto»: que la primera persona de la mañana no espere
// ============================================================
// Medido el 11-09 con las sesiones reales: caliente, la bandeja de Central
// responde en 1,1 s; en frío, 6,3 s. Y el catálogo de operaciones, 0,6 s
// contra 4,7 s. Lo que cambia entre una y otra no es la base ni el código: es
// que Vercel apaga la función cuando nadie la usa por unos minutos, y la
// primera persona que entra —la de las 7:30, la de después del almuerzo— paga
// el arranque entero.
//
// Esto la mantiene despierta: un toque cada 5 minutos a /api/version, la ruta
// más barata del CRM (no pasa por el proxy ni abre sesión: solo dice qué
// commit corre). En Vercel un cron de cada 5 minutos no está en el plan de la
// cuenta, y además el n8n propio ya es donde viven las automatizaciones de la
// empresa (Santos, 10-09).
//
// SOLO EN HORARIO. Lunes a sábado, de 6:30 a 19:30 hora de Lima: fuera de eso
// nadie entra y cada toque gasta un poco de la cuota de CPU del CRM, que ya se
// pasó una vez. Son ~156 toques por día de unos milisegundos cada uno.
//
//   node --env-file=.env.local scripts/n8n-flujo-crm-despierto.mjs
const NUEVO = process.env.N8N_PROPIO_URL, USUARIO = process.env.N8N_PROPIO_USUARIO, CLAVE = process.env.N8N_PROPIO_CLAVE;
const NOMBRE = "CRM · Despierto (cada 5 min en horario)";
const CRM = "https://crm.efameinsa.com";

const login = await fetch(`${NUEVO}/rest/login`, {
  method: "POST", headers: { "Content-Type": "application/json", "browser-id": "crm" },
  body: JSON.stringify({ emailOrLdapLoginId: USUARIO, password: CLAVE }),
});
if (!login.ok) { console.error("No se pudo entrar al n8n propio:", login.status); process.exit(1); }
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${NUEVO}/rest${ruta}`, {
    method: metodo, headers: { "Content-Type": "application/json", "browser-id": "crm", cookie },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j?.data ?? j;
};

const existentes = await api("GET", "/workflows");
const lista = Array.isArray(existentes) ? existentes : (existentes?.data ?? []);
const previo = lista.find((w) => w.name === NOMBRE);

const flujo = {
  name: NOMBRE,
  settings: { executionOrder: "v1", timezone: "America/Lima" },
  nodes: [
    {
      name: "Cada 5 minutos",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1.2,
      position: [0, 0],
      parameters: {
        rule: {
          interval: [
            // Lunes a sábado, 6:30–19:30 de Lima. El minuto 30 de las 6 entra
            // porque la expresión arranca en el 0: se toca 6:00 y 6:05 de más,
            // que es más barato que perder a la primera persona.
            { field: "cronExpression", expression: "*/5 6-19 * * 1-6" },
          ],
        },
      },
    },
    {
      name: "Toque al CRM",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [260, 0],
      parameters: {
        url: `${CRM}/api/version`,
        options: { timeout: 20000, redirect: { redirect: { followRedirects: true } } },
      },
      // Si el CRM está desplegando y contesta mal, no hay nada que hacer:
      // en 5 minutos se vuelve a intentar.
      onError: "continueRegularOutput",
    },
  ],
  connections: { "Cada 5 minutos": { main: [[{ node: "Toque al CRM", type: "main", index: 0 }]] } },
};

let id;
if (previo) {
  const actual = await api("GET", `/workflows/${previo.id}`);
  await api("PATCH", `/workflows/${previo.id}`, { ...flujo, versionId: actual.versionId });
  id = previo.id;
  console.log(`Actualizado: ${NOMBRE} (${id})`);
} else {
  const creado = await api("POST", "/workflows", flujo);
  id = creado.id;
  console.log(`Creado: ${NOMBRE} (${id})`);
}
// Activar pide el versionId vigente (n8n 2.x).
const vigente = await api("GET", `/workflows/${id}`);
await api("POST", `/workflows/${id}/activate`, { versionId: vigente.versionId });
const final = await api("GET", `/workflows/${id}`);
console.log(`Activo: ${final.active} · zona horaria: ${final.settings?.timezone}`);
