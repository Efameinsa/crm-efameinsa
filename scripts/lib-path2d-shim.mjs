// node-canvas no implementa Path2D, y pdfjs 6 dibuja TODOS los trazos con él:
// sin este apaño las páginas salen sin bordes, sin rellenos y sin las líneas de
// las tablas —lo que hacía irreconocible la vista de una ficha—. Se graba la
// ruta y se reproduce sobre el contexto en el momento de rellenar o trazar.
import { CanvasRenderingContext2D } from "canvas";

class Path2DApanado {
  constructor(otra) {
    this.cmds = otra instanceof Path2DApanado ? [...otra.cmds] : [];
  }
  _add(m, a) {
    this.cmds.push([m, a]);
  }
  moveTo(...a) {
    this._add("moveTo", a);
  }
  lineTo(...a) {
    this._add("lineTo", a);
  }
  bezierCurveTo(...a) {
    this._add("bezierCurveTo", a);
  }
  quadraticCurveTo(...a) {
    this._add("quadraticCurveTo", a);
  }
  arc(...a) {
    this._add("arc", a);
  }
  arcTo(...a) {
    this._add("arcTo", a);
  }
  ellipse(...a) {
    this._add("ellipse", a);
  }
  rect(...a) {
    this._add("rect", a);
  }
  roundRect(x, y, w, h) {
    this._add("rect", [x, y, w, h]);
  }
  closePath() {
    this._add("closePath", []);
  }
  addPath(otra, t) {
    if (!t) {
      this.cmds.push(...otra.cmds);
      return;
    }
    this._add("__save", []);
    this._add("__transform", [t.a, t.b, t.c, t.d, t.e, t.f]);
    this.cmds.push(...otra.cmds);
    this._add("__restore", []);
  }
  reproducir(ctx) {
    ctx.beginPath();
    for (const [m, a] of this.cmds) {
      if (m === "__save") ctx.save();
      else if (m === "__restore") ctx.restore();
      else if (m === "__transform") ctx.transform(...a);
      else ctx[m](...a);
    }
  }
}

for (const metodo of ["fill", "stroke", "clip"]) {
  const original = CanvasRenderingContext2D.prototype[metodo];
  CanvasRenderingContext2D.prototype[metodo] = function (...args) {
    if (args[0] instanceof Path2DApanado) {
      const [ruta, ...resto] = args;
      ruta.reproducir(this);
      return original.apply(this, resto);
    }
    return original.apply(this, args);
  };
}

globalThis.Path2D = Path2DApanado;
