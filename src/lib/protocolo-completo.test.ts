import { describe, expect, it } from "vitest";
import { faltaParaProbar, type MaquinaParaProbar } from "./protocolo-completo";
import { PLANTILLAS, renglonesConMarca } from "./protocolo-checklist";

// El caso de COFACO INDUSTRIES (Santos, 13-10): sin fotos ni documento se podía marcar.
const cofaco: MaquinaParaProbar = {
  id: "a",
  descripcion: "LAVADORA TEÑIDORA DE MUESTRA AUTOMATICA MARCA EFAMEINSA MODELO EFALTM10",
  serie: "EF-001",
  protocolo_ref: null,
  protocolo_fotos: [],
  protocolo_datos: {},
  protocolo_chequeo: {},
};

const todoMarcado = Object.fromEntries(renglonesConMarca(PLANTILLAS[0]).map((k) => [k, "ok" as const]));

describe("faltaParaProbar", () => {
  it("sin nada no se puede marcar: dice todo lo que falta", () => {
    const falta = faltaParaProbar(cofaco, []).join(" | ");
    for (const f of ["N.º de protocolo", "fotos", "modelo de la placa", "técnico", "PROTOCOLO DE LAVADORA"]) expect(falta).toContain(f);
  });

  it("con hoja de chequeo no pide Word/PDF: el informe lo genera el sistema (Lesly, 13-10)", () => {
    const sinWord: MaquinaParaProbar = {
      ...cofaco,
      protocolo_ref: "P-100",
      protocolo_fotos: [{ path: "x/protocolo-1-a.jpg", tipo: "image/jpeg" }],
      protocolo_datos: { principal: { modelo: "EFALTM10", tecnico: "Juan" } },
      protocolo_chequeo: { principal: { plantilla: "lavadora", marcas: todoMarcado } },
    };
    expect(faltaParaProbar(sinWord, [])).toEqual([]);
  });

  it("sin hoja de chequeo en el sistema (calandria) sigue pidiendo el Word/PDF", () => {
    const calandria: MaquinaParaProbar = {
      ...cofaco,
      descripcion: "CALANDRIA INDUSTRIAL MARCA GMP MODELO 160.30A",
      protocolo_ref: "P-7",
      protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }],
      protocolo_datos: { principal: { modelo: "160.30A", tecnico: "T" } },
    };
    expect(faltaParaProbar(calandria, []).join()).toContain("PDF o Word");
  });

  it("el video de la prueba no reemplaza al Word/PDF (Ariana, 14-10)", () => {
    const calandria: MaquinaParaProbar = {
      ...cofaco,
      descripcion: "CALANDRIA INDUSTRIAL MARCA GMP MODELO 160.30A",
      protocolo_ref: "P-7",
      protocolo_fotos: [
        { path: "a.jpg", tipo: "image/jpeg" },
        { path: "prueba.mp4", tipo: "video/mp4", etiqueta: "video" },
      ],
      protocolo_datos: { principal: { modelo: "160.30A", tecnico: "T" } },
    };
    expect(faltaParaProbar(calandria, []).join()).toContain("PDF o Word");
  });

  it("con la ficha, fotos, PDF y la hoja completa se puede", () => {
    const lista: MaquinaParaProbar = {
      ...cofaco,
      protocolo_ref: "P-100",
      protocolo_fotos: [{ path: "x/protocolo-1-a.jpg", tipo: "image/jpeg" }, { path: "x/protocolo-1-b.pdf", tipo: "application/pdf" }],
      protocolo_datos: { principal: { modelo: "EFALTM10", tecnico: "Juan" } },
      protocolo_chequeo: { principal: { plantilla: "lavadora", marcas: todoMarcado } },
    };
    expect(faltaParaProbar(lista, [])).toEqual([]);
  });

  it("lo elegido en pantalla cuenta para el mismo clic", () => {
    const conFicha: MaquinaParaProbar = { ...cofaco, protocolo_datos: { principal: { modelo: "EFALTM10" } }, protocolo_chequeo: { principal: { marcas: todoMarcado } } };
    const falta = faltaParaProbar(conFicha, [], {
      clic: { protocoloRef: "P-1", tecnico: "Ana", principal: [{ path: "f.jpg", tipo: "image/jpeg" }, { path: "p.pdf", tipo: "application/pdf" }] },
    });
    expect(falta).toEqual([]);
  });

  it("no hace falta marcar todas las casillas: basta una (Ariana, 14-10)", () => {
    const [primera] = Object.keys(todoMarcado);
    const base: MaquinaParaProbar = {
      ...cofaco,
      protocolo_ref: "P",
      protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }],
      protocolo_datos: { principal: { modelo: "M", tecnico: "T" } },
    };
    const una = { ...base, protocolo_chequeo: { principal: { marcas: { [primera]: "ok" } } } } as MaquinaParaProbar;
    expect(faltaParaProbar(una, [])).toEqual([]);
    const vacia = { ...base, protocolo_chequeo: { principal: { marcas: {} } } };
    expect(faltaParaProbar(vacia, []).join()).toContain("ninguna casilla marcada");
  });

  it("«N/A» cuenta como respondida (0465, COFACO sin quemador ni carga)", () => {
    const conNa = Object.fromEntries(Object.keys(todoMarcado).map((k, i) => [k, i % 2 ? "na" : "ok"])) as typeof todoMarcado;
    const m: MaquinaParaProbar = {
      ...cofaco,
      protocolo_ref: "P",
      protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }, { path: "b.pdf", tipo: "application/pdf" }],
      protocolo_datos: { principal: { modelo: "M", tecnico: "T" } },
      protocolo_chequeo: { principal: { marcas: conNa } },
    };
    expect(faltaParaProbar(m, [])).toEqual([]);
  });

  it("el repuesto solo pide protocolo, fotos y técnico", () => {
    const r: MaquinaParaProbar = { ...cofaco, descripcion: "FAJA DE TAMBOR", protocolo_ref: "R1", protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }], protocolo_datos: { principal: { tecnico: "T" } } };
    expect(faltaParaProbar(r, [], { repuesto: true })).toEqual([]);
  });
});
