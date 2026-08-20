import { describe, expect, it } from "vitest";
import {
  anchoDeBanda,
  bigotesTukey,
  bordesTramos,
  curvaDensidad,
  escalaTramos,
  pisoBonito,
  techoBonito,
  type TramoCltv,
} from "@/lib/distribucion";

// Los mismos siete tramos que arma `finanzas_marketing()` en la migración 0046.
const TRAMOS: TramoCltv[] = [
  { tramo: "Menos de 1k", desde: 0, hasta: 1000, clientes: 5 },
  { tramo: "1k a 2,5k", desde: 1000, hasta: 2500, clientes: 104 },
  { tramo: "2,5k a 5k", desde: 2500, hasta: 5000, clientes: 191 },
  { tramo: "5k a 10k", desde: 5000, hasta: 10000, clientes: 108 },
  { tramo: "10k a 20k", desde: 10000, hasta: 20000, clientes: 47 },
  { tramo: "20k a 50k", desde: 20000, hasta: 50000, clientes: 33 },
  { tramo: "Más de 50k", desde: 50000, hasta: 1000000000, clientes: 12 },
];

describe("redondeo bonito", () => {
  it("baja al escalón 1-2-5 anterior", () => {
    expect(pisoBonito(114)).toBe(100);
    expect(pisoBonito(3790)).toBe(2000);
    expect(pisoBonito(1000)).toBe(1000);
  });

  it("sube al escalón 1-2-5 siguiente", () => {
    expect(techoBonito(194400)).toBe(200000);
    expect(techoBonito(50000)).toBe(50000);
    expect(techoBonito(6)).toBe(10);
  });
});

describe("bordes del eje", () => {
  it("cierra el primer y el último tramo, que vienen abiertos", () => {
    const bordes = bordesTramos(TRAMOS, 114, 194400);
    expect(bordes).toEqual([100, 1000, 2500, 5000, 10000, 20000, 50000, 200000]);
  });

  it("no deja el piso por encima del primer corte aunque el mínimo sea alto", () => {
    const bordes = bordesTramos(TRAMOS, 9000, 194400);
    expect(bordes[0]).toBeLessThan(TRAMOS[0].hasta);
  });
});

describe("escala compartida por tramos", () => {
  const bordes = bordesTramos(TRAMOS, 114, 194400);
  const u = escalaTramos(bordes);

  it("pone cada corte en un número entero: el tramo i ocupa [i, i+1]", () => {
    bordes.forEach((borde, i) => expect(u(borde)).toBeCloseTo(i, 6));
  });

  it("es creciente", () => {
    const valores = [114, 900, 1000, 2499, 2500, 3790, 7490, 20000, 194400];
    const us = valores.map(u);
    us.forEach((valor, i) => i > 0 && expect(valor).toBeGreaterThan(us[i - 1]));
  });

  it("interpola en logaritmo dentro del tramo: la mitad del tramo es la media geométrica", () => {
    expect(u(Math.sqrt(2500 * 5000))).toBeCloseTo(2.5, 6);
  });

  it("recorta los valores fuera del eje en vez de salirse del lienzo", () => {
    expect(u(1)).toBe(0);
    expect(u(9e9)).toBeCloseTo(7, 6);
  });

  it("contar por posición reproduce el histograma de la base", () => {
    // La invariante que sostiene el gráfico: las barras (conteos que calcula
    // SQL) y todo lo que se dibuja con la escala tienen que caer en el mismo
    // sitio. Se comprueba con valores repartidos por tramo.
    const muestras = TRAMOS.flatMap((t, i) =>
      Array.from({ length: t.clientes }, (_, k) => {
        const hasta = i === TRAMOS.length - 1 ? 194400 : t.hasta;
        const desde = i === 0 ? 114 : t.desde;
        return desde * (hasta / desde) ** ((k + 0.5) / t.clientes);
      }),
    );
    const conteos = new Array(TRAMOS.length).fill(0);
    for (const v of muestras) conteos[Math.min(Math.floor(u(v)), TRAMOS.length - 1)]++;
    expect(conteos).toEqual(TRAMOS.map((t) => t.clientes));
  });
});

describe("bigotes de Tukey", () => {
  it("separa los atípicos de arriba y deja el bigote en el último dato de dentro", () => {
    // Q1 = 3.087 y Q3 = 7.490 dan una valla superior de 14.095.
    const valores = [114, 3000, 3087, 3790, 7490, 14000, 14200, 60000, 194400];
    const { inferior, superior, atipicos } = bigotesTukey(valores, 3087, 7490);
    expect(inferior).toBe(114);
    expect(superior).toBe(14000);
    expect(atipicos).toEqual([14200, 60000, 194400]);
  });

  it("con una distribución simétrica no marca atípicos", () => {
    const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const { inferior, superior, atipicos } = bigotesTukey(valores, 30, 70);
    expect(atipicos).toEqual([]);
    expect(inferior).toBe(10);
    expect(superior).toBe(90);
  });
});

describe("curva de densidad", () => {
  const posiciones = [0.5, 1.2, 2.1, 2.3, 2.5, 2.6, 2.8, 3.1, 3.4, 4.2, 5.5, 6.4];

  it("respeta el piso del ancho de banda", () => {
    expect(anchoDeBanda([2.4, 2.5, 2.5, 2.6], 0.3)).toBe(0.3);
    expect(anchoDeBanda([2.4, 2.5, 2.5, 2.6])).toBe(0.35);
  });

  it("está en la misma unidad que las barras: el área es la cantidad de clientes", () => {
    const curva = curvaDensidad(posiciones, 7, { puntos: 700 });
    const paso = 7 / 700;
    const area = curva.reduce((s, p, i) => s + p.y * (i === 0 || i === curva.length - 1 ? paso / 2 : paso), 0);
    // No llega al 100 % porque la curva se corta en los extremos del eje.
    expect(area).toBeGreaterThan(posiciones.length * 0.9);
    expect(area).toBeLessThanOrEqual(posiciones.length);
  });

  it("pone el máximo donde se apiñan los datos", () => {
    const curva = curvaDensidad(posiciones, 7, { puntos: 700 });
    const pico = curva.reduce((a, b) => (b.y > a.y ? b : a));
    expect(pico.u).toBeGreaterThan(2);
    expect(pico.u).toBeLessThan(3);
  });

  it("no devuelve nada si no hay datos", () => {
    expect(curvaDensidad([], 7)).toEqual([]);
  });
});
