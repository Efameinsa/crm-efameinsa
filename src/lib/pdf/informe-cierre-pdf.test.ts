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
  garantia: "24 meses",
  entrega: { fecha: "29/08/2026", hora: "12:00", lugar: "Plaza Norte", direccion: "Av. Siempre Viva 123" },
  notaDespacho: null,
  urgente: true,
  incluye: ["Manual de usuario", "Instalación"],
  gratis: null,
  notaFinal: null,
  items: [{ descripcion: "SECADORA INDUSTRIAL", cantidad: 1, precio_unitario: 21500 }],
  itemsGratuitos: [],
  adjuntos: [],
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

  // El expediente del cierre (migración 0099): en el papel va la lista de
  // documentos, no los archivos.
  it("lista los documentos adjuntos sin romper el maquetado", async () => {
    const pdf = await render({
      codigo: "002-2026",
      adjuntos: [
        { etiqueta: "Orden de compra", nombre: "4510105315.PDF" },
        { etiqueta: "Voucher / pago", nombre: "voucher-bcp-28-08.jpg" },
      ],
    });
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.length).toBeGreaterThan(5000);
  });

  it("aguanta la entrega sin fecha ni hora cerradas", async () => {
    const pdf = await render({ entrega: { fecha: "Por confirmar", hora: "Por confirmar", lugar: null, direccion: null } });
    expect(pdf.length).toBeGreaterThan(5000);
  });

  // El cierre de Ariana con FANCAVEL (02-09): trece repuestos y un servicio.
  // La columna no puede decir EQUIPOS, y catorce filas tienen que caber sin
  // romper el maquetado (los números romanos se acaban en el X).
  it("rotula la tabla como REPUESTOS Y SERVICIOS y aguanta catorce renglones", async () => {
    const repuestos = [
      "VALVULA DE DRENAJE", "BOLA DE SOPORTE MOD:4280FR4048N", "BOLA DE SOPORTE MOD 4280FR4048Z", "EMPAQUE RETEN MOD MDS62058301",
      "AMORTIGUADOR ENSAMBLAJE", "KIT DE INTERRUPTOR DE PUERTA", "EMPAQUETADURA DE PUERTA", "ENSAMBLAJE DE PIERNA (PATA DE LAVADORA)",
      "ABRAZADERA P/DOSIFICADOR", "ABRAZADERA P/MANGUERA", "ABRAZADERA P/LAVADORA", "ARNES CON GANCHO, ENSAMBLAJE DE PERNOS",
      "CONJUNTO DE PERNOS DE ANCLAJE",
    ].map((descripcion, i) => ({ tipo: "repuesto", descripcion, cantidad: 1 + (i % 3), precio_unitario: 5 + i }));
    const pdf = await render({
      serie: "OPEN",
      items: [
        ...repuestos,
        {
          tipo: "servicio",
          descripcion: "SERVICIO DE MANTENIMIENTO CORRECTIVO PARA LAVADORA\nMARCA: LG\nMODELO: TITAN C\nCAPACIDAD: 15KG\nSERIE: 707KWXD21746",
          cantidad: 1,
          precio_unitario: 325,
        },
      ],
    });
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
    let texto = "";
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      texto += contenido.items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
    }
    expect(texto).toContain("REPUESTOS Y SERVICIOS");
    expect(texto).not.toMatch(/\bEQUIPOS\b/);
    expect(texto).toContain("CONJUNTO DE PERNOS DE ANCLAJE");
    expect(texto).toContain("SERIE: 707KWXD21746");
  });
});

// Firma del comercial: hasta el 24-08 salía solo el nombre, porque
// perfiles.telefono/celular/email_contacto estaban en null y el PDF solo pinta
// lo que existe. Lo reportó Brenda el primer día de uso real.
describe("correo según razón social", () => {
  it("mantiene el usuario y cambia el dominio", async () => {
    const { correoEnSerie } = await import("./series");
    expect(correoEnSerie("comercial5@efameinsa.com", "OPEN")).toBe("comercial5@openinvestments.com.pe");
    expect(correoEnSerie("comercial5@efameinsa.com", "EFAMEINSA")).toBe("comercial5@efameinsa.com");
    expect(correoEnSerie("comercial1@openinvestments.com.pe", "EFAMEINSA")).toBe("comercial1@efameinsa.com");
  });

  it("sin correo cargado devuelve null en vez de inventar uno", async () => {
    const { correoEnSerie } = await import("./series");
    expect(correoEnSerie(null, "OPEN")).toBeNull();
  });
});
