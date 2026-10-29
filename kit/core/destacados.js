// Destacados editables (kit 1.11): textos cortos que el dueño cambia desde el panel y la web muestra
// (ej. "En tolva": el café de la semana). Puro, sin DOM.
//
// cliente.json → "destacados": [{ "id": "tolva", "nombre": "En tolva", "ayuda": "El café que está hoy en la tolva.",
//   "campos": [{ "id": "origen", "label": "Origen" }, { "id": "notas", "label": "Notas de sabor", "largo": true }],
//   "valores": { "origen": "Perú · Amazonas", "notas": "Caramelo, muy dulce" } }]
// En la web: <span data-kit-destacado="tolva.origen"></span> se completa solo, y el evento "kit:destacados" trae todos.
export const destacadosDe = (config) => (Array.isArray(config?.destacados) ? config.destacados.filter(d => d && d.id && Array.isArray(d.campos)) : []);

// { tolva: { origen: '…', notas: '…' } } = los de cliente.json pisados por lo guardado (solo campos conocidos)
export function mezclarDestacados(config, guardados = {}) {
  const out = {};
  for (const d of destacadosDe(config)) {
    const g = guardados?.[d.id] || {};
    out[d.id] = {};
    for (const c of d.campos) {
      const v = g[c.id] ?? d.valores?.[c.id] ?? '';
      out[d.id][c.id] = String(v).slice(0, c.largo ? 400 : 120);
    }
  }
  return out;
}
