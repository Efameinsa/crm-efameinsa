// Prueba de extremo a extremo del expediente del cierre (migración 0099).
// Entra con enlace mágico de un solo uso, sube un archivo de verdad al bucket
// y comprueba que aparece en la ficha del cliente y en la cola de Central.
// Limpia todo lo que crea.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "http://localhost:3100";

async function sesion(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw error;
  const jar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: { getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error: e2 } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return { cookie: [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; "), ssr };
}
const pedir = async (cookie, ruta) => { const r = await fetch(BASE + ruta, { headers: { cookie } }); return { status: r.status, html: await r.text() }; };
let fallas = 0;
const check = (b, t) => { console.log(`${b ? "  ✓" : "  ✗ FALLA:"} ${t}`); if (!b) fallas++; };

// Informe emitido real de Brenda (C1) sobre una cuenta suya.
const { data: cuenta } = await admin.from("cuentas").select("id, razon_social").eq("comercial_id", "e03cde25-7d86-4e21-8abb-08c21a279ed4").limit(1).single();
const { data: informe } = await admin.from("informes_cierre").insert({
  serie: "EFAMEINSA", cuenta_id: cuenta.id, asunto: cuenta.razon_social, comprobante: "factura",
  cliente_nuevo: false, cliente_nombre: cuenta.razon_social, modalidad_pago: ["CREDITO"], moneda: "USD",
  monto_total: 4050, entrega_lugar: "Urubamba", items: [{ bloque: "venta", descripcion: "LAVADORA", cantidad: 1, precio_unitario: 3432.22 }],
  creado_por: "e03cde25-7d86-4e21-8abb-08c21a279ed4",
}).select("id").single();
console.log(`Informe de prueba ${informe.id} sobre ${cuenta.razon_social}\n`);

console.log("COMERCIAL (Brenda, C1) — borrador");
const b = await sesion("comercial1@efameinsa.com");
const almacen = b.ssr.storage.from("adjuntos");
const ruta = `cierres/${informe.id}/${crypto.randomUUID()}-voucher.png`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const sub = await almacen.upload(ruta, new Blob([PNG], { type: "image/png" }), { contentType: "image/png" });
check(!sub.error, `sube el archivo al bucket privado ${sub.error ? "→ " + sub.error.message : ""}`);
await admin.from("informes_cierre").update({ adjuntos: [{ tipo: "voucher", path: ruta, nombre: "voucher-bcp.png", tipo_mime: "image/png", tamano: 12, subido_por: null, subido_at: new Date().toISOString() }] }).eq("id", informe.id);

const ficha = await pedir(b.cookie, `/comercial/cartera/${cuenta.id}`);
check(ficha.status === 200, `abre la ficha del cliente (${ficha.status})`);
check(ficha.html.includes("voucher-bcp.png"), "el voucher se ve en la ficha del cliente");
check(ficha.html.includes("Voucher / pago"), "sale rotulado con su categoría");

console.log("\nEMITIDO — el voucher tardío (crédito 30 días)");
await admin.from("informes_cierre").update({ correlativo: 990, emitido_at: new Date().toISOString() }).eq("id", informe.id);
const ruta2 = `cierres/${informe.id}/${crypto.randomUUID()}-oc.pdf`;
await almacen.upload(ruta2, new Blob([Buffer.from("%PDF-1.4 %%EOF")], { type: "application/pdf" }), { contentType: "application/pdf" });
const { data: act } = await admin.from("informes_cierre").select("adjuntos").eq("id", informe.id).single();
const conDos = [...act.adjuntos, { tipo: "orden_compra", path: ruta2, nombre: "OC-4510105315.pdf", tipo_mime: "application/pdf", tamano: 13, subido_por: null, subido_at: new Date().toISOString() }];
const { error: eAdd } = await b.ssr.from("informes_cierre").update({ adjuntos: conDos }).eq("id", informe.id);
check(!eAdd, `el comercial AGREGA un documento a un informe ya emitido ${eAdd ? "→ " + eAdd.message : ""}`);
const { error: eQuita } = await b.ssr.from("informes_cierre").update({ adjuntos: [act.adjuntos[0]] }).eq("id", informe.id);
check(!!eQuita, `y NO puede quitar uno ya adjuntado ${eQuita ? "→ «" + eQuita.message + "»" : "(pasó, y no debía)"}`);

console.log("\nCENTRAL — la cola de cierres");
const cn = await sesion("central@efameinsa.com");
const cola = await pedir(cn.cookie, "/central/cierres");
check(cola.status === 200, `abre la cola (${cola.status})`);
check(cola.html.includes("Documentos"), "la tabla tiene la columna Documentos");
check(cola.html.includes("OC-4510105315.pdf"), "Central ve la orden de compra");
check(cola.html.includes("voucher-bcp.png"), "Central ve el voucher");

console.log("\nPDF del informe");
const pdf = await fetch(`${BASE}/api/informes/${informe.id}/pdf`, { headers: { cookie: cn.cookie } });
const bytes = Buffer.from(await pdf.arrayBuffer());
check(pdf.status === 200 && bytes.subarray(0, 5).toString() === "%PDF-", `el PDF sigue saliendo (${pdf.status}, ${bytes.length} bytes)`);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
let texto = "";
for (let p = 1; p <= doc.numPages; p++) texto += (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join(" ");
check(texto.includes("Documentos adjuntos"), "el PDF lista el expediente");
check(texto.includes("OC-4510105315.pdf") && texto.includes("voucher-bcp.png"), "y nombra los dos documentos");

// Limpieza
await admin.from("informes_cierre").delete().eq("id", informe.id);
await admin.storage.from("adjuntos").remove([ruta, ruta2]);
console.log(`\n${fallas === 0 ? "TODO CORRECTO." : fallas + " FALLA(S)."}`);
process.exit(fallas === 0 ? 0 : 1);
