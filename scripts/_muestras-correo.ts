// MUESTRAS DE LOS CORREOS DEL CRM, solo a las dos direcciones de prueba (nunca a
// personal real): sirve para que Santos vea cómo llegan en Gmail, el celular y
// Outlook antes de desplegar. Usa el mismo código de envío que el CRM
// (gestion1@ con la Gmail de respaldo).
//
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/_muestras-correo.ts
import { enviarCorreoN8n } from "../src/lib/avisos-n8n";
import { armarAviso } from "../src/lib/correo/aviso";
import { correoDeApertura } from "../src/lib/correo/apertura";
import { armarCorreo } from "../src/lib/correo/plantilla";
import type { DatosApertura } from "../src/lib/apertura-servicio";

const PARA = "gestion1@efameinsa.com, corporacionefameinsa.sa@gmail.com";
const CRM = "https://crm.efameinsa.com";
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pedido = (empresa: "EFAMEINSA" | "OPEN") => [
  { etiqueta: "Cliente", valor: "HOTEL EJEMPLO S.A.C. (muestra)" },
  { etiqueta: "Pedido", valor: empresa === "OPEN" ? "OPEN-0000" : "PED-0000-2026" },
  { etiqueta: "Equipo", valor: "CANTIDAD: 1\nLAVADORA INDUSTRIAL 17 KG" },
  { etiqueta: "Despacho programado", valor: "15/10/2026 · 09:00" },
  { etiqueta: "Técnico", valor: "CRISTHIAN DOLORIER — DNI 72755590" },
];

const apertura = (empresa: string): DatosApertura => ({
  tipo: "entrega_puesta_marcha",
  empresa,
  cliente: "HOTEL EJEMPLO S.A.C. (MUESTRA)",
  ruc: "20123456789",
  equipo: "CANTIDAD: 1\nLAVADORA INDUSTRIAL 17 KG\n\nCANTIDAD: 1\nSECADORA 17 KG",
  serie: "FX-0001 · FX-0002",
  nota: "Muestra para revisar el diseño; no es un pedido real.",
  direccion: "Av. Los Olivos 123, Los Olivos, Lima",
  direccionFinal: null,
  entregaModo: "domicilio",
  agenciaDestino: null,
  fecha: "2026-10-15",
  hora: "9:00 a. m.",
  recibeNombre: "Juan Pérez",
  recibeDoc: "40111222",
  recibeTelefono: "999888777",
  tecnico: "CRISTHIAN DOLORIER — DNI 72755590\nDANNY SOLIS — DNI 40115086",
  transporte: "TRANSPORTE CONTRATADO",
  guia: "ambas",
  guiaDetalle: "manómetro",
  coordinaContabilidad: "Jhon Calsin",
});

const muestras: { asunto: string; html: string; deNombre: string }[] = [
  {
    asunto: "OPEN // Apertura por confirmar · HOTEL EJEMPLO",
    deNombre: "OPEN INVESTMENTS · CRM",
    html: armarAviso({
      empresa: "OPEN",
      paraArea: "Finanzas",
      titulo: "Apertura por confirmar · HOTEL EJEMPLO",
      cuerpo: "Postventa emitió la apertura de despacho (pedido OPEN-0000). Revísela y confirme con qué comprobante sale para que el almacén emita la guía. Se solicita: guía para el traslado del equipo.",
      enlace: `${CRM}/finanzas/aperturas`,
      tabla: pedido("OPEN"),
    }),
  },
  {
    asunto: "EFAMEINSA // Apertura de despacho · HOTEL EJEMPLO",
    deNombre: "EFAMEINSA · CRM",
    html: armarAviso({
      empresa: "EFAMEINSA",
      paraArea: "Almacén",
      titulo: "Apertura de despacho · HOTEL EJEMPLO",
      cuerpo: "LAVADORA INDUSTRIAL 17 KG · programado para el 15/10/2026. Finanzas confirma la guía de salida.",
      enlace: `${CRM}/almacen/pedidos/00000000`,
      tabla: pedido("EFAMEINSA"),
    }),
  },
  {
    asunto: "EFAMEINSA // Apertura corregida · HOTEL EJEMPLO",
    deNombre: "EFAMEINSA · CRM",
    html: armarAviso({
      empresa: "EFAMEINSA",
      paraArea: "Finanzas",
      titulo: "Apertura corregida · HOTEL EJEMPLO",
      cuerpo: "Postventa corrigió la dirección final en la apertura del pedido PED-0000-2026. Su autorización de la guía quedó sin efecto: revísela y vuelva a autorizarla.",
      enlace: `${CRM}/finanzas/aperturas`,
      tabla: pedido("EFAMEINSA"),
    }),
  },
  {
    asunto: "OPEN // Guía autorizada · HOTEL EJEMPLO",
    deNombre: "OPEN INVESTMENTS · CRM",
    html: armarAviso({
      empresa: "OPEN",
      paraArea: "Postventa",
      titulo: "Guía autorizada · HOTEL EJEMPLO",
      cuerpo: "Finanzas autorizó la guía del pedido OPEN-0000: el almacén ya puede emitirla. Factura F001-123.",
      enlace: `${CRM}/postventa/pedidos/00000000`,
      tabla: pedido("OPEN"),
    }),
  },
  ...(["EFAMEINSA", "OPEN"] as const).map((e) => {
    const c = correoDeApertura(apertura(e === "OPEN" ? "OPEN INVESTMENTS" : "CORPORACION EFAMEINSA"), `${CRM}/postventa/pedidos/00000000/apertura`);
    return { asunto: `${c.asunto}`, html: c.html, deNombre: `${e === "OPEN" ? "OPEN INVESTMENTS" : "EFAMEINSA"} · Postventa` };
  }),
  {
    asunto: "Registro de visita a planta · muestra",
    deNombre: "EFAMEINSA · CRM",
    html: armarCorreo({
      pretitulo: "Registro de visita",
      titulo: "Visita a planta",
      firma: null,
      contenidoHtml:
        `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px"><p>Buenos días, para informar la siguiente visita:</p>` +
        `<table style="border-collapse:collapse"><tr><th style="border:1px solid #444;padding:6px 8px;background:#f2f2f2">FECHA</th><th style="border:1px solid #444;padding:6px 8px;background:#f2f2f2">HORA</th><th style="border:1px solid #444;padding:6px 8px;background:#f2f2f2">PROSPECTO</th></tr>` +
        `<tr><td style="border:1px solid #444;padding:6px 8px"><span style="background:#ffff00">15/10/2026</span></td><td style="border:1px solid #444;padding:6px 8px"><span style="color:#c00">10:00</span></td><td style="border:1px solid #444;padding:6px 8px">DNI 40111222 - Juan Pérez<br><b>HOTEL EJEMPLO</b></td></tr></table>` +
        `<p>Gracias,</p><p style="color:#666;font-size:12px">MUESTRA · registrado en el CRM.</p></div>`,
    }),
  },
];

// Con un argumento (p. ej. «APERTURA DE SERVICIO») se mandan solo las muestras cuyo asunto lo contiene.
const filtro = process.argv[2]?.toLowerCase();
(async () => {
  for (const [i, m] of muestras.entries()) {
    if (filtro && !m.asunto.toLowerCase().includes(filtro)) continue;
    const r = await enviarCorreoN8n({ para: PARA, asunto: `[MUESTRA ${i + 1}/${muestras.length}] ${m.asunto}`, html: m.html, deNombre: m.deNombre });
    console.log(`${i + 1}. ${m.asunto} → ${r.error ?? `enviado por ${r.por}`}`);
    await pausa(4000);
  }
})();
