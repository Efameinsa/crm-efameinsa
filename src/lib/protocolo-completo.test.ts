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
    for (const f of ["N.º de protocolo", "fotos", "PDF o Word", "modelo de la placa", "técnico", "PROTOCOLO DE LAVADORA"]) expect(falta).toContain(f);
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

  it("una casilla sin marcar frena", () => {
    const { [Object.keys(todoMarcado)[0]]: _, ...casi } = todoMarcado;
    const m: MaquinaParaProbar = {
      ...cofaco,
      protocolo_ref: "P",
      protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }, { path: "b.pdf", tipo: "application/pdf" }],
      protocolo_datos: { principal: { modelo: "M", tecnico: "T" } },
      protocolo_chequeo: { principal: { marcas: casi } },
    };
    expect(faltaParaProbar(m, []).join()).toContain("1 casilla sin marcar");
  });

  it("el repuesto solo pide protocolo, fotos y técnico", () => {
    const r: MaquinaParaProbar = { ...cofaco, descripcion: "FAJA DE TAMBOR", protocolo_ref: "R1", protocolo_fotos: [{ path: "a.jpg", tipo: "image/jpeg" }], protocolo_datos: { principal: { tecnico: "T" } } };
    expect(faltaParaProbar(r, [], { repuesto: true })).toEqual([]);
  });
});
