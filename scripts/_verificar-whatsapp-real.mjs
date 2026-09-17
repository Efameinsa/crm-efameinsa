// Comprueba las credenciales REALES de la WhatsApp Cloud API (17-09-2026):
// que el token sirva, que vea la cuenta (WABA) y el número, y que la cuenta
// esté suscrita a la app (sin eso Meta no manda los mensajes al webhook).
// Con SUSCRIBIR=1 suscribe la app a la cuenta si no lo está.
//
// Uso: node --env-file=.env.local scripts/_verificar-whatsapp-real.mjs
const T = process.env.WHATSAPP_TOKEN;
const PHONE = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WABA = process.env.WHATSAPP_WABA_ID;
const APP = process.env.META_APP_ID;
const SECRET = process.env.META_APP_SECRET;
if (!T || !PHONE || !WABA) { console.error("Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_WABA_ID"); process.exit(1); }
const g = async (p, opts = {}, tok = T) => {
  const r = await fetch(`https://graph.facebook.com/v21.0/${p}`, { ...opts, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(opts.headers ?? {}) } });
  return r.json();
};
let mal = 0;
const ok = (c, msg, extra = "") => { console.log(`${c ? "✓" : "✗"} ${msg}${extra ? " — " + extra : ""}`); if (!c) mal++; };

const d = await g(`debug_token?input_token=${T}`, {}, `${APP}|${SECRET}`);
ok(d.data?.is_valid, "token válido", `${d.data?.type ?? "?"} · app ${d.data?.app_id ?? "?"} · expira ${d.data?.expires_at ? new Date(d.data.expires_at * 1000).toISOString() : "nunca"}`);
const scopes = d.data?.scopes ?? [];
ok(scopes.includes("whatsapp_business_messaging") && scopes.includes("whatsapp_business_management"), "permisos de WhatsApp", scopes.join(","));
ok(String(d.data?.app_id) === String(APP), "el token es de la app configurada (META_APP_ID)", `${d.data?.app_id} vs ${APP}`);

const w = await g(`${WABA}?fields=id,name,account_review_status,timezone_id,ownership_type`);
ok(!w.error, "la cuenta de WhatsApp (WABA) se lee", w.error?.message ?? `${w.name} · revisión ${w.account_review_status}`);

const ph = await g(`${PHONE}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,throughput,platform_type`);
ok(!ph.error, "el número se lee", ph.error?.message ?? `${ph.display_phone_number} · ${ph.verified_name} · ${ph.status ?? ""} · calidad ${ph.quality_rating} · nombre ${ph.name_status}`);

const lista = await g(`${WABA}/phone_numbers?fields=id,display_phone_number`);
ok((lista.data ?? []).some((x) => x.id === PHONE), "el número pertenece a esa cuenta", JSON.stringify(lista.data ?? lista.error));

let sub = await g(`${WABA}/subscribed_apps`);
let suscrita = (sub.data ?? []).some((x) => String(x.whatsapp_business_api_data?.id ?? x.id) === String(APP));
if (!suscrita && process.env.SUSCRIBIR === "1") {
  const r = await g(`${WABA}/subscribed_apps`, { method: "POST" });
  console.log("  suscribiendo la app a la cuenta:", JSON.stringify(r));
  sub = await g(`${WABA}/subscribed_apps`);
  suscrita = (sub.data ?? []).some((x) => String(x.whatsapp_business_api_data?.id ?? x.id) === String(APP));
}
ok(suscrita, "la cuenta está suscrita a la app (los mensajes llegan al webhook)", JSON.stringify(sub.data ?? sub.error));

const subs = await g(`${APP}/subscriptions`, {}, `${APP}|${SECRET}`);
const wa = (subs.data ?? []).find((s) => s.object === "whatsapp_business_account");
ok(!!wa && wa.active, "el webhook de la app está activo", wa ? `${wa.callback_url} · campos ${wa.fields?.map((f) => f.name).join(",")}` : JSON.stringify(subs));
ok(wa?.callback_url === "https://crm.efameinsa.com/api/webhooks/whatsapp", "la URL del webhook es la del CRM");

console.log(`\n${mal === 0 ? "todo bien" : mal + " mal"}`);
process.exit(mal ? 1 : 0);
