// Temporadas de la carta (invierno, primavera…): cada sección puede pertenecer a una temporada
// y el dueño elige desde /admin cuál se ve. Sin "temporada" la sección se ve siempre.
//
// cliente.json → "carta": { "temporadas": [{ "id": "primavera", "nombre": "Primavera" }, …], "temporadaActiva": "primavera",
//                           "categorias": [{ "id": "tortillas", "nombre": "Tortillas", "temporada": "primavera" }, …] }

export const temporadasDe = (config) => Array.isArray(config?.carta?.temporadas) ? config.carta.temporadas.filter(t => t && t.id) : [];

// Activa válida: la guardada si existe en la lista; si no, la de cliente.json; si no, la primera.
export function temporadaValida(config, guardada) {
  const ts = temporadasDe(config);
  if (!ts.length) return null;
  if (guardada && ts.some(t => t.id === guardada)) return guardada;
  const def = config.carta?.temporadaActiva;
  return ts.some(t => t.id === def) ? def : ts[0].id;
}

// Tienda online (kit 1.16): secciones con "tienda": true son productos armados para encargar
// (torta entera, docena, caja, bolsa). No aparecen en la carta del local, en la carta del QR ni en la impresa.
export const esTienda = (cat) => !!cat?.tienda;
// La carta conserva los productos sin sección ("Otros"); la tienda solo trae los de sus secciones.
export function soloCarta(cats, prods) {
  const fuera = new Set(cats.filter(esTienda).map(c => c.id));
  return { cats: cats.filter(c => !fuera.has(c.id)), prods: prods.filter(p => !fuera.has(p.categoria)) };
}
export function soloTienda(cats, prods) {
  const dentro = new Set(cats.filter(esTienda).map(c => c.id));
  return { cats: cats.filter(c => dentro.has(c.id)), prods: prods.filter(p => dentro.has(p.categoria)) };
}

export const seVe = (cat, activa) => !cat?.temporada || !activa || cat.temporada === activa;

// Separa la carta visible: secciones de la temporada activa (o sin temporada) y sus productos.
// Los productos de secciones guardadas no aparecen ni como "sin sección".
export function filtrarCarta(cats, prods, activa) {
  const visibles = cats.filter(c => seVe(c, activa));
  const ocultas = new Set(cats.filter(c => !seVe(c, activa)).map(c => c.id));
  return { cats: visibles, prods: prods.filter(p => !ocultas.has(p.categoria)) };
}
