/**
 * Google Ads API: conversiones offline por clic (gclid) desde el CRM (0435).
 *
 * Santos, 10-10: «las conversiones deben guiar las pujas de google ya». Por eso
 * las dos acciones se crean como PRINCIPALES (primaryForGoal): Google deja de
 * perseguir solo el formulario lleno y busca al que cotiza y compra.
 *
 * Necesita cinco variables (GOOGLE_ADS_DEVELOPER_TOKEN, _CLIENT_ID,
 * _CLIENT_SECRET, _REFRESH_TOKEN, _CUSTOMER_ID; _LOGIN_CUSTOMER_ID si se entra
 * por una cuenta administradora). Sin ellas no hace nada: el CRM funciona igual.
 */

export const CONVERSIONES_GOOGLE = {
  SubmitApplication: { nombre: "CRM - Cotizado", categoria: "QUALIFIED_LEAD", conteo: "ONE_PER_CLICK" },
  Purchase: { nombre: "CRM - Venta", categoria: "CONVERTED_LEAD", conteo: "MANY_PER_CLICK" },
} as const;
export type EventoGoogle = keyof typeof CONVERSIONES_GOOGLE;

const soloDigitos = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

export function googleAdsConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

let versionQueSirve: string | null = null;

async function tokenDeAcceso(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!j.access_token) throw new Error(`OAuth de Google: ${j.error_description ?? j.error ?? r.status}`);
  return j.access_token;
}

/** Una llamada a la API. Las versiones caducan cada año: se prueba de la más nueva hacia atrás. */
async function llamar(token: string, ruta: string, cuerpo: unknown): Promise<Record<string, unknown>> {
  const cid = soloDigitos(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const login = soloDigitos(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  const versiones = versionQueSirve ? [versionQueSirve] : (process.env.GOOGLE_ADS_API_VERSION ?? "v24,v23,v22,v21").split(",");
  let ultimo = "";
  for (const v of versiones) {
    const r = await fetch(`https://googleads.googleapis.com/${v.trim()}/customers/${cid}${ruta}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        "Content-Type": "application/json",
        ...(login ? { "login-customer-id": login } : {}),
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status === 404 && !versionQueSirve) {
      ultimo = `versión ${v} no existe`;
      continue;
    }
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const e = j.error as { message?: string; details?: unknown } | undefined;
      throw new Error(`Google Ads ${r.status}: ${e?.message ?? JSON.stringify(j).slice(0, 300)}`);
    }
    versionQueSirve = v.trim();
    return j;
  }
  throw new Error(`Google Ads: ninguna versión de la API respondió (${ultimo})`);
}

/** Busca las dos acciones por nombre y crea las que falten, como principales. Devuelve nombre → resource name. */
export async function asegurarAccionesDeConversion(token: string): Promise<Record<EventoGoogle, string>> {
  const nombres = Object.values(CONVERSIONES_GOOGLE).map((c) => `'${c.nombre}'`).join(", ");
  const r = await llamar(token, "/googleAds:search", {
    query: `SELECT conversion_action.resource_name, conversion_action.name, conversion_action.primary_for_goal, conversion_action.status FROM conversion_action WHERE conversion_action.name IN (${nombres}) AND conversion_action.status != 'REMOVED'`,
  });
  const hallados = new Map<string, { resourceName: string; primaryForGoal?: boolean }>();
  for (const fila of (r.results as { conversionAction: { resourceName: string; name: string; primaryForGoal?: boolean } }[] | undefined) ?? []) {
    hallados.set(fila.conversionAction.name, fila.conversionAction);
  }
  const crear = (Object.keys(CONVERSIONES_GOOGLE) as EventoGoogle[]).filter((k) => !hallados.has(CONVERSIONES_GOOGLE[k].nombre));
  if (crear.length) {
    const m = await llamar(token, "/conversionActions:mutate", {
      operations: crear.map((k) => ({
        create: {
          name: CONVERSIONES_GOOGLE[k].nombre,
          type: "UPLOAD_CLICKS",
          category: CONVERSIONES_GOOGLE[k].categoria,
          status: "ENABLED",
          primaryForGoal: true,
          countingType: CONVERSIONES_GOOGLE[k].conteo,
          clickThroughLookbackWindowDays: 90,
          valueSettings: { defaultValue: 0, defaultCurrencyCode: "USD", alwaysUseDefaultValue: false },
        },
      })),
    });
    const res = (m.results as { resourceName: string }[]) ?? [];
    crear.forEach((k, i) => hallados.set(CONVERSIONES_GOOGLE[k].nombre, { resourceName: res[i].resourceName, primaryForGoal: true }));
  }
  // Si alguien la pasó a secundaria, vuelve a principal: es la orden de gerencia.
  const secundarias = [...hallados.values()].filter((a) => a.primaryForGoal === false);
  if (secundarias.length) {
    await llamar(token, "/conversionActions:mutate", {
      operations: secundarias.map((a) => ({ update: { resourceName: a.resourceName, primaryForGoal: true }, updateMask: "primary_for_goal" })),
    });
  }
  return Object.fromEntries(
    (Object.keys(CONVERSIONES_GOOGLE) as EventoGoogle[]).map((k) => [k, hallados.get(CONVERSIONES_GOOGLE[k].nombre)!.resourceName]),
  ) as Record<EventoGoogle, string>;
}

export interface ConversionClic {
  clave: string;
  evento: EventoGoogle;
  gclid: string;
  ocurrioAt: string;
  valor: number | null;
  moneda: string | null;
}

/** «2026-10-10 14:35:02-05:00», el formato que pide la API. */
function horaLima(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(iso)).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}-05:00`;
}

/** Sube un lote. Devuelve, por clave, null si entró o el error de esa fila. */
export async function subirConversionesDeClic(lote: ConversionClic[]): Promise<Map<string, string | null>> {
  const token = await tokenDeAcceso();
  const acciones = await asegurarAccionesDeConversion(token);
  const resultado = new Map<string, string | null>();
  for (let i = 0; i < lote.length; i += 200) {
    const parte = lote.slice(i, i + 200);
    const r = await llamar(token, ":uploadClickConversions", {
      partialFailure: true,
      conversions: parte.map((c) => ({
        gclid: c.gclid,
        conversionAction: acciones[c.evento],
        conversionDateTime: horaLima(c.ocurrioAt),
        ...(c.valor != null ? { conversionValue: Number(c.valor), currencyCode: c.moneda ?? "USD" } : {}),
      })),
    });
    // Errores parciales: cada detalle dice el índice de la fila en «location».
    const fallas = new Map<number, string>();
    const pf = r.partialFailureError as { details?: { errors?: { message?: string; location?: { fieldPathElements?: { index?: number }[] } }[] }[] } | undefined;
    for (const d of pf?.details ?? []) {
      for (const e of d.errors ?? []) {
        const idx = e.location?.fieldPathElements?.find((f) => f.index != null)?.index;
        if (idx != null) fallas.set(idx, e.message ?? "error");
      }
    }
    parte.forEach((c, j) => resultado.set(c.clave, fallas.get(j) ?? null));
  }
  return resultado;
}
