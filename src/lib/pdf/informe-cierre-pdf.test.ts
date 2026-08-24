import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { readFileSync } from "node:fs";
import { InformeCierrePdf, type InformeCierrePdfProps } from "./informe-cierre-pdf";

// Este documento ya se rompió en silencio una vez: un bloque `fixed`
// posicionado con `bottom` se descartaba SIN error y el PDF salía sin pie (ver
// el comentario de `pie` en informe-cierre-pdf.tsx). Por eso vale la pena
// renderizarlo de verdad en cada cambio, y no confiar solo en el typecheck.

const BASE: InformeCierrePdfProps = {
  logoBuffer: readFileSync("public/logo-efameinsa.png"),
  serie: "EFAMEINSA",
  codigo: null,
  fecha: "24/08/2026",
  referencia: "Presu_2182-26",
  asunto: "Venta de equipos de lavandería",
  presupuestoRef: "2182-26",
  comprobante: "factura",
  clienteNuevo: false,
  cliente: {
    nombre: "CLIENTE DE PRUEBA SAC",
    doc: "20123456789",
    direccion: "Av. Siempre Viva 123",
    correo: "cliente@ejemplo.com",
    ordenCompra: null,
  },
  contactoVenta: { nombre: "Ana Pérez", telefono: "999888777", correo: "ana@ejemplo.com" },
  contactoContabilidad: { nombre: "Ana Pérez" },
  contactoDespacho: { nombre: "Otro Receptor", telefono: "988777666", area: "Recepción de despacho" },
  modalidadPago: ["CONTADO"],
  formaPago: "transferencia",
  moneda: "USD",
  notaCondiciones: null,
  entrega: { fecha: "29/08/2026", hora: "12:00", lugar: "Plaza Norte", direccion: "Av. Siempre Viva 123" },
  notaDespacho: null,
  urgente: true,
  incluye: ["Manual de usuario", "Instalación"],
  gratis: null,
  notaFinal: null,
  items: [{ descripcion: "SECADORA INDUSTRIAL", cantidad: 1, precio_unitario: 21500 }],
  itemsGratuitos: [],
  firma: { nombre: "Katerine Tello", telefono: null, celular: "999000111", email: "comercial5@efameinsa.com" },
};

async function render(props: Partial<InformeCierrePdfProps> = {}): Promise<Buffer> {
  // El componente devuelve un <Document>, pero createElement lo tipa por sus
  // props; renderToBuffer espera el elemento del documento.
  const elemento = createElement(InformeCierrePdf, { ...BASE, ...props }) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(elemento);
}

describe("informe de cierre en PDF", () => {
  it("renderiza un PDF válido como borrador", async () => {
    const pdf = await render();
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.length).toBeGreaterThan(5000);
  });

  it("renderiza igual de bien ya emitido y con equipos de regalo", async () => {
    const pdf = await render({
      codigo: "001-2026",
      itemsGratuitos: [{ descripcion: "KIT DE INSTALACIÓN", cantidad: 1, precio_unitario: 0 }],
      notaCondiciones: "50% adelanto con la OC.",
      notaDespacho: "Llevar frágil.",
    });
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
  });

  it("aguanta la entrega sin fecha ni hora cerradas", async () => {
    const pdf = await render({ entrega: { fecha: "Por confirmar", hora: "Por confirmar", lugar: null, direccion: null } });
    expect(pdf.length).toBeGreaterThan(5000);
  });
});
