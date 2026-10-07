import { describe, expect, it } from "vitest";
import type { DatosApertura } from "@/lib/apertura-servicio";
import { destinatariosDelArea, esCorreoDeLaEmpresa } from "@/lib/directorio";
import { correoDeApertura, empresaDeApertura } from "./apertura";

const base: DatosApertura = {
  tipo: "entrega_puesta_marcha",
  empresa: "CORPORACION EFAMEINSA",
  cliente: 'HOTEL <b>RIVERA</b> S.A.C.',
  ruc: "20123456789",
  equipo: "CANTIDAD: 1\nLAVADORA 17 KG",
  serie: "FX-0001",
  nota: null,
  direccion: "Av. Los Olivos 123, Lima",
  direccionFinal: null,
  entregaModo: "domicilio",
  agenciaDestino: null,
  fecha: "2026-10-15",
  hora: "9:00 a. m.",
  recibeNombre: "Juan Pérez",
  recibeDoc: "40111222",
  recibeTelefono: "999888777",
  tecnico: "CRISTHIAN DOLORIER — DNI 72755590",
  transporte: "TRANSPORTE CONTRATADO",
  guia: "traslado",
  coordinaContabilidad: "Jhon",
};

describe("correoDeApertura", () => {
  const c = correoDeApertura(base, "https://crm.efameinsa.com/postventa/pedidos/1/apertura");
  it("lleva las 11 filas del formato y las columnas de Lesly", () => {
    for (const col of ["N.º", "Descripción", "Información", "Obs."]) expect(c.html).toContain(col);
    expect(c.html).toContain("PERSONAL ASIGNADO PARA EL SERVICIO");
    expect((c.html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(12);
  });
  it("la fila del técnico trae su DNI", () => {
    expect(c.html).toContain("CRISTHIAN DOLORIER — DNI 72755590");
    expect(c.texto).toContain("DNI 72755590");
  });
  it("escapa lo que viene de los datos del cliente", () => {
    expect(c.html).not.toContain("<b>RIVERA</b>");
    expect(c.html).toContain("HOTEL &lt;b&gt;RIVERA&lt;/b&gt; S.A.C.");
  });
  it("el asunto es el de siempre: EMPRESA // APERTURA DE SERVICIO // CLIENTE", () => {
    expect(c.asunto).toBe(`CORPORACION EFAMEINSA // APERTURA DE SERVICIO // ${base.cliente}`);
  });
  it("no lleva montos ni precios", () => {
    expect(c.html).not.toMatch(/US\$|S\/\s?\d|IGV/);
  });
  it("la guía pedida sale en las notas", () => {
    expect(c.html).toContain("SE SOLICITA GUÍA PARA EL TRASLADO DEL EQUIPO");
  });
  it("es HTML de correo (sin <style> ni flex)", () => {
    expect(c.html).not.toMatch(/<style|display:\s*(flex|grid)/i);
  });
  it("la empresa sale del pedido: OPEN usa el membrete de OPEN", () => {
    expect(empresaDeApertura({ empresa: "OPEN INVESTMENTS" })).toBe("OPEN");
    const o = correoDeApertura({ ...base, empresa: "OPEN INVESTMENTS" });
    expect(o.empresa).toBe("OPEN");
    expect(o.html).toContain("OPEN INVESTMENTS S.A.C.");
    expect(o.html).not.toContain("logo-efameinsa.png");
  });
});

const directorio = [
  { nombre: "Lesly Meneses", correo_efameinsa: "logistica2@efameinsa.com", correo_open: "logistica2@openinvestments.com.pe", avisos: ["almacen"] },
  { nombre: "Jhon Calsin", correo_efameinsa: "contabilidad1@efameinsa.com", correo_open: "gestion1@openinvestments.com.pe", avisos: ["finanzas"] },
  { nombre: "Karen", correo_efameinsa: "kycabrejos@efameinsa.com", correo_open: null, avisos: [] },
];

describe("destinatarios sugeridos y validación", () => {
  it("almacén y Finanzas, en el correo de la empresa del pedido", () => {
    expect(destinatariosDelArea(directorio, ["almacen", "finanzas"], "OPEN").map((d) => d.correo)).toEqual([
      "logistica2@openinvestments.com.pe",
      "gestion1@openinvestments.com.pe",
    ]);
    expect(destinatariosDelArea(directorio, ["almacen", "finanzas"], "EFAMEINSA").map((d) => [d.nombre, d.area])).toEqual([
      ["Lesly Meneses", "almacen"],
      ["Jhon Calsin", "finanzas"],
    ]);
  });
  it("solo acepta direcciones de la empresa", () => {
    for (const ok of ["a@efameinsa.com", "X@OpenInvestments.com.pe", "corporacionefameinsa.sa@gmail.com"]) expect(esCorreoDeLaEmpresa(ok)).toBe(true);
    for (const mal of ["cliente@gmail.com", "a@efameinsa.com.evil.com", "a@evil-efameinsa.com", "a b@efameinsa.com", "a@efameinsa.com,b@gmail.com", "@efameinsa.com", "<a@efameinsa.com>"]) {
      expect(esCorreoDeLaEmpresa(mal)).toBe(false);
    }
  });
});
