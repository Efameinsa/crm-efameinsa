// Reportado por Santos 26-08 (sospecha de "error de colores"): el catálogo
// oficial V:\LESLY\COCHES\CATALOGO\Efamein-Coches de lavandería- 2026.pdf
// (página propia para HM-402) muestra 4 pastillas de color: Azul, Blanco,
// Gris y Verde. El sistema solo tenía 3 (sin Verde) -- y la propia foto ya
// cargada para CO402 es la variante VERDE de ese mismo catálogo, lo cual era
// inconsistente con su lista de colores. El maestro de Lesly solo menciona
// "AZUL/WHITE/GREY" (no se toca esa cita textual en descripcion_maestro),
// pero el campo `colores` -- el que de verdad se muestra en pantalla -- se
// corrige contra el catálogo del fabricante, la fuente más confiable para
// qué colores existen realmente.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: producto, error: errBuscar } = await supabase
  .from('productos')
  .select('id, ficha')
  .eq('sku', 'CO402')
  .single();
if (errBuscar) { console.error('CO402 no encontrado:', errBuscar.message); process.exit(1); }

const ficha = { ...producto.ficha, colores: ['Azul', 'Blanco', 'Gris', 'Verde'] };
const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
if (errUpd) { console.error('Error actualizando ficha:', errUpd.message); process.exit(1); }
console.log('CO402 -> colores actualizados a Azul, Blanco, Gris, Verde');
process.exit(0);
