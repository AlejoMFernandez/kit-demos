// PANEL /admin con la identidad del cliente: pedidos, reservas y carta (ABM).
// Pensado para el celular del dueño: navegación abajo, tarjetas grandes, acciones a un toque.
//
//   <div id="kit-admin"></div>
//   <script type="module">
//     import { initAdmin } from '../kit/admin/admin.js';
//     initAdmin({ config: '../cliente.json', sitio: '../' });
//   </script>
import { cargarConfig, crearContexto } from '../kit.js';
import { esc, h, $, $$, slug, soloDigitos } from '../core/util.js';
import { t } from '../core/i18n.js';
import { popup, confirmar, toast } from '../core/ui.js';
import { ahoraEn, horaVisible, aMin, diaSemana, configReservas } from '../core/turnos.js';
import { linkWhatsApp } from '../core/pedidos.js';

const ESTADOS_PEDIDO = ['pendiente', 'confirmado', 'listo', 'entregado', 'cancelado'];
const SIGUIENTE = { pendiente: ['confirmado', 'cancelado'], confirmado: ['listo', 'cancelado'], listo: ['entregado'] };
const BOTON = { confirmado: 'confirmar', listo: 'marcarListo', entregado: 'marcarEntregado', cancelado: 'cancelar', confirmada: 'confirmar', cancelada: 'cancelar' };

export async function initAdmin(opts = {}) {
  const root = document.getElementById(opts.mount || 'kit-admin');
  let ctx;
  try { ctx = await crearContexto(await cargarConfig(opts.config || '../cliente.json')); }
  catch (e) { root.innerHTML = `<p class="kit-error">No se pudo cargar cliente.json</p>`; throw e; }
  const { config, store } = ctx;
  const sitio = opts.sitio || '../';
  document.documentElement.classList.add('kit-on', `kit-${store.modo}`);
  document.title = `${t('panel')} · ${config.nombre}`;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = config.marca?.colores?.primario || '#111';
  if (config.marca?.favicon) { const l = document.querySelector('link[rel=icon]') || document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon' })); l.href = ctx.asset(config.marca.favicon); }

  const vistas = [
    config.modulos.carrito && { id: 'pedidos', icono: '<path d="M5 8h14l-1.3 11.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>' },
    config.modulos.reservas && { id: 'reservas', icono: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
    config.modulos.carta && { id: 'carta', icono: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>' },
  ].filter(Boolean);
  let vista = (location.hash.slice(1) && vistas.some(v => v.id === location.hash.slice(1))) ? location.hash.slice(1) : vistas[0]?.id;
  const filtros = { pedidos: 'activos', reservas: 'proximas' };
  const vistos = new Set(JSON.parse(sessionStorage.getItem(`kit:${config.id}:vistos`) || '[]'));
  let primeraCarga = true;

  // ---------- login
  async function pantallaLogin() {
    const demo = store.modo === 'demo';
    root.className = 'kit-root kit-admin kit-admin--login';
    root.innerHTML = `<div class="kit-login">
      ${config.marca?.logo ? `<img class="kit-login__logo" src="${esc(ctx.asset(config.marca.logoPanel || config.marca.logo))}" alt="${esc(config.nombre)}">` : `<h1>${esc(config.nombre)}</h1>`}
      <p class="kit-login__kicker">${esc(t('panel'))}</p>
      <form class="kit-form">
        ${demo ? `<p>${esc(t('entrarDemoSub'))}</p>` : `
          <label class="kit-field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
          <label class="kit-field"><span>${esc(t('password'))}</span><input name="password" type="password" autocomplete="current-password" required></label>`}
        <p class="kit-msg" role="alert" hidden></p>
        <button class="kit-btn kit-btn--block kit-btn--big">${esc(demo ? t('entrarDemo') : t('entrar'))}</button>
      </form>
      <a class="kit-login__back" href="${esc(sitio)}">← ${esc(t('verSitio'))}</a></div>`;
    $('form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try { await store.login(f.get('email'), f.get('password')); arrancar(); }
      catch (_) { const m = $('.kit-msg', root); m.textContent = t('loginError'); m.hidden = false; }
    });
  }

  // ---------- layout
  function layout() {
    root.className = 'kit-root kit-admin';
    root.innerHTML = `
      <header class="kad-top">
        <a class="kad-brand" href="${esc(sitio)}" title="${esc(t('verSitio'))}">
          ${config.marca?.logo ? `<img src="${esc(ctx.asset(config.marca.logoPanel || config.marca.logo))}" alt="${esc(config.nombre)}">` : `<b>${esc(config.nombre)}</b>`}
        </a>
        <span class="kad-top__title">${esc(t('panel'))}</span>
        <div class="kad-top__actions">
          <a class="kit-btn kit-btn--ghost kit-btn--sm" href="${esc(sitio)}" target="_blank" rel="noopener">${esc(t('verSitio'))} ↗</a>
          <button type="button" class="kit-btn kit-btn--ghost kit-btn--sm" data-salir>${esc(t('salir'))}</button>
        </div>
      </header>
      ${store.modo === 'demo' ? `<div class="kad-demo"><span><b>${esc(t('modoDemo'))}.</b> ${esc(t('modoDemoSub'))}</span><button type="button" class="kit-btn kit-btn--sm kit-btn--ghost" data-reset>↺ ${esc(t('reiniciar'))}</button></div>` : ''}
      <nav class="kad-nav" aria-label="${esc(t('panel'))}">
        ${vistas.map(v => `<a href="#${v.id}" class="kad-nav__a" data-vista="${v.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${v.icono}</svg><span>${esc(t(v.id))}</span><i class="kad-count" data-count="${v.id}" hidden></i></a>`).join('')}
      </nav>
      <main class="kad-main" id="kad-main" tabindex="-1"></main>`;
    root.addEventListener('click', onClick);
  }

  async function onClick(e) {
    const a = e.target.closest('[data-vista]');
    if (a) { e.preventDefault(); ir(a.dataset.vista); return; }
    if (e.target.closest('[data-salir]')) { await store.logout(); pantallaLogin(); return; }
    if (e.target.closest('[data-reset]')) {
      if (await confirmar(t('reiniciarSeguro'), { ok: t('reiniciar'), peligro: true })) { await store.reset(); vistos.clear(); guardarVistos(); toast(t('guardado')); render(); }
      return;
    }
    const fil = e.target.closest('[data-filtro]');
    if (fil) { filtros[vista] = fil.dataset.filtro; render(); return; }
    const est = e.target.closest('[data-estado]');
    if (est) {
      const id = est.closest('[data-id]').dataset.id; const nuevo = est.dataset.estado;
      if (nuevo.startsWith('cancel') && !(await confirmar(`${t('cancelar')}?`, { ok: t('cancelar'), peligro: true }))) return;
      est.disabled = true;
      if (vista === 'pedidos') await store.updatePedido(id, { estado: nuevo }); else await store.updateReserva(id, { estado: nuevo });
      toast(t(nuevo)); render();
      return;
    }
  }

  function ir(v) {
    vista = v; history.replaceState(null, '', '#' + v);
    render(); $('#kad-main')?.focus({ preventScroll: true }); scrollTo({ top: 0 });
  }

  // ---------- helpers de formato
  const hoy = () => ahoraEn(ctx.tz).fecha;
  function relativo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return t('ahora');
    const m = Math.round(s / 60); if (m < 60) return t('hace', { t: `${m} min` });
    const hh = Math.round(m / 60); if (hh < 24) return t('hace', { t: `${hh} h` });
    return new Date(iso).toLocaleDateString(ctx.pais.locale, { day: 'numeric', month: 'short' }) + ' ' + new Date(iso).toLocaleTimeString(ctx.pais.locale, { hour: '2-digit', minute: '2-digit' });
  }
  function fechaLarga(f) {
    const [, m, d] = f.split('-').map(Number);
    const pref = f === hoy() ? `${t('hoy')} · ` : '';
    return `${pref}${t('dias')[diaSemana(f)]} ${d} ${t('meses')[m - 1]}`;
  }
  const waCliente = (tel, texto) => {
    let d = soloDigitos(tel);
    if (d.length <= 11 && !d.startsWith(ctx.pais.prefijoTel)) d = ctx.pais.prefijoTel + (ctx.pais.prefijoTel === '54' && !d.startsWith('9') ? '9' : '') + d.replace(/^0/, '');
    return linkWhatsApp(d, texto).url;
  };
  function guardarVistos() { sessionStorage.setItem(`kit:${config.id}:vistos`, JSON.stringify([...vistos])); }

  // ---------- PEDIDOS
  async function vistaPedidos(main) {
    const todos = await store.getPedidos();
    const f = filtros.pedidos;
    const lista = todos.filter(p => f === 'todos' ? true : f === 'activos' ? ['pendiente', 'confirmado', 'listo'].includes(p.estado) : p.estado === f);
    const n = (e) => todos.filter(p => e === 'activos' ? ['pendiente', 'confirmado', 'listo'].includes(p.estado) : p.estado === e).length;
    main.innerHTML = `
      <div class="kad-head"><h1>${esc(t('pedidos'))}</h1></div>
      <div class="kit-chips kit-chips--scroll kad-filtros">
        ${[['activos', t('enCurso')], ['pendiente', t('pendientes')], ['entregado', t('entregado')], ['cancelado', t('cancelado')], ['todos', t('todos')]].map(([k, l]) => `<button type="button" class="kit-chip${f === k ? ' is-on' : ''}" data-filtro="${k}">${esc(l)}${k !== 'todos' ? ` <small>${n(k)}</small>` : ''}</button>`).join('')}
      </div>
      ${lista.length ? `<div class="kad-list">${lista.map(tarjetaPedido).join('')}</div>`
        : `<div class="kit-empty"><p class="kit-empty__t">${esc(t('sinPedidos'))}</p><p>${esc(t('sinPedidosSub'))}</p><a class="kit-btn" href="${esc(sitio)}" target="_blank" rel="noopener">${esc(t('verSitio'))} ↗</a></div>`}`;
    lista.forEach(p => vistos.add(p.id)); guardarVistos();
  }
  function badgePago(p) {
    if (p.pago !== 'mercadopago') return `<span class="kit-badge">${esc(t('aCoordinar'))}</span>`;
    const map = { aprobado: ['ok', 'mpPagoAprobado'], rechazado: ['danger', 'mpPagoRechazado'], pendiente: ['warn', 'mpPagoPendiente'] };
    const [c, k] = map[p.pagoEstado] || map.pendiente;
    return `<span class="kit-badge kit-badge--${c}">${esc(t(k))}</span>`;
  }
  function tarjetaPedido(p) {
    const nuevo = !vistos.has(p.id) && !primeraCarga;
    const wa = waCliente(p.cliente?.telefono, t('waAvisoPedido', { nombre: p.cliente?.nombre || '', codigo: p.codigo, negocio: config.nombre }));
    return `<article class="kad-card kad-card--${p.estado}${nuevo ? ' is-new' : ''}" data-id="${esc(p.id)}">
      <header class="kad-card__head">
        <b class="kad-code">${esc(p.codigo)}</b>
        <span class="kit-badge kit-badge--st-${p.estado}">${esc(t(p.estado))}</span>
        ${nuevo ? `<span class="kit-badge kit-badge--new">${esc(t('nuevo'))}</span>` : ''}
        <time class="kad-time" datetime="${esc(p.creado)}">${esc(relativo(p.creado))}</time>
      </header>
      <div class="kad-card__who">
        <b>${esc(p.cliente?.nombre)}</b>
        <span>${esc(p.tipo === 'delivery' ? `${t('delivery')} · ${p.cliente?.direccion || ''}` : t('retiro'))}</span>
      </div>
      <ul class="kad-items">${(p.items || []).map(i => `<li><span><b>${i.cant}×</b> ${esc(i.nombre)}${i.nota ? `<em>${esc(i.nota)}</em>` : ''}</span><span>${ctx.money(i.subtotal) || ''}</span></li>`).join('')}</ul>
      ${p.nota ? `<p class="kad-note">“${esc(p.nota)}”</p>` : ''}
      <footer class="kad-card__foot">
        <div class="kad-total"><span>${esc(t('total'))}</span><b>${ctx.money(p.total)}</b></div>
        ${badgePago(p)}
        <div class="kad-actions">
          ${wa ? `<a class="kit-btn kit-btn--ghost kit-btn--sm" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t('escribir'))}</a>` : ''}
          ${(SIGUIENTE[p.estado] || []).map(s => `<button type="button" class="kit-btn kit-btn--sm${s === 'cancelado' ? ' kit-btn--ghost kit-btn--danger-t' : ''}" data-estado="${s}">${esc(t(BOTON[s]))}</button>`).join('')}
        </div>
      </footer></article>`;
  }

  // ---------- RESERVAS
  async function vistaReservas(main) {
    const R = configReservas(config.reservas);
    const todas = await store.getReservas();
    const f = filtros.reservas; const h0 = hoy();
    let lista = todas.filter(r => f === 'pasadas' ? r.fecha < h0 : f === 'pendiente' ? r.estado === 'pendiente' && r.fecha >= h0 : f === 'todas' ? true : r.fecha >= h0);
    if (f === 'pasadas') lista = lista.reverse();
    const grupos = {}; lista.forEach(r => { (grupos[r.fecha] = grupos[r.fecha] || []).push(r); });
    const cnt = { proximas: todas.filter(r => r.fecha >= h0 && r.estado !== 'cancelada').length, pendiente: todas.filter(r => r.estado === 'pendiente' && r.fecha >= h0).length };
    main.innerHTML = `
      <div class="kad-head"><h1>${esc(t('reservas'))}</h1><p class="kad-sub">${esc(t('resumenReservas', { intervalo: R.intervaloMin, capacidad: R.capacidad, duracion: R.duracionMin }))}</p></div>
      <div class="kit-chips kit-chips--scroll kad-filtros">
        ${[['proximas', t('proximas'), cnt.proximas], ['pendiente', t('pendientes'), cnt.pendiente], ['pasadas', t('pasadas')], ['todas', t('todos')]].map(([k, l, c]) => `<button type="button" class="kit-chip${f === k ? ' is-on' : ''}" data-filtro="${k}">${esc(l)}${c != null ? ` <small>${c}</small>` : ''}</button>`).join('')}
      </div>
      ${lista.length ? Object.entries(grupos).map(([fecha, rs]) => `
        <section class="kad-day"><h2 class="kad-day__t">${esc(fechaLarga(fecha))} <small>${rs.filter(r => r.estado !== 'cancelada').reduce((s, r) => s + r.personas, 0)} ${esc(t('personasN'))}</small></h2>
        <div class="kad-list">${rs.map(tarjetaReserva).join('')}</div></section>`).join('')
        : `<div class="kit-empty"><p class="kit-empty__t">${esc(t('sinReservas'))}</p><a class="kit-btn" href="${esc(sitio)}" target="_blank" rel="noopener">${esc(t('verSitio'))} ↗</a></div>`}`;
    lista.forEach(r => vistos.add(r.id)); guardarVistos();
  }
  function tarjetaReserva(r) {
    const nuevo = !vistos.has(r.id) && !primeraCarga;
    const hora = horaVisible(aMin(r.hora));
    const [, m, d] = r.fecha.split('-').map(Number);
    const wa = waCliente(r.telefono, t('waConfirmaReserva', { nombre: r.nombre, negocio: config.nombre, personas: `${r.personas} ${r.personas === 1 ? t('persona') : t('personasN')}`, dia: `${d}/${m}`, hora }));
    const acciones = r.estado === 'pendiente' ? ['confirmada', 'cancelada'] : r.estado === 'confirmada' ? ['cancelada'] : [];
    return `<article class="kad-card kad-card--res kad-card--${r.estado}${nuevo ? ' is-new' : ''}" data-id="${esc(r.id)}">
      <div class="kad-res__time"><b>${esc(hora)}</b><span>${r.personas} <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg></span></div>
      <div class="kad-res__body">
        <header class="kad-card__head"><b>${esc(r.nombre)}</b><span class="kit-badge kit-badge--st-${r.estado}">${esc(t(r.estado))}</span>${nuevo ? `<span class="kit-badge kit-badge--new">${esc(t('nuevo'))}</span>` : ''}</header>
        <span class="kad-muted">${esc(r.telefono)}${r.email ? ` · ${esc(r.email)}` : ''}</span>
        ${r.comentario ? `<p class="kad-note">“${esc(r.comentario)}”</p>` : ''}
        <div class="kad-actions">
          ${wa ? `<a class="kit-btn kit-btn--ghost kit-btn--sm" href="${esc(wa)}" target="_blank" rel="noopener">${esc(t('escribir'))}</a>` : ''}
          ${acciones.map(s => `<button type="button" class="kit-btn kit-btn--sm${s === 'cancelada' ? ' kit-btn--ghost kit-btn--danger-t' : ''}" data-estado="${s}">${esc(t(BOTON[s]))}</button>`).join('')}
        </div>
      </div></article>`;
  }

  // ---------- CARTA (ABM)
  async function vistaCarta(main) {
    const [cats, prods] = await Promise.all([store.getCategorias(), store.getProductos()]);
    const grupos = [...cats.map(c => ({ ...c, items: prods.filter(p => p.categoria === c.id) }))];
    const sueltos = prods.filter(p => !cats.some(c => c.id === p.categoria));
    if (sueltos.length) grupos.push({ id: '', nombre: t('sinCategoria'), items: sueltos, virtual: true });
    main.innerHTML = `
      <div class="kad-head kad-head--row"><div><h1>${esc(t('carta'))}</h1><p class="kad-sub">${esc(t('productosN', { n: prods.length }))}</p></div>
        <button type="button" class="kit-btn" data-nuevo-prod>+ ${esc(t('nuevoProducto'))}</button></div>
      ${store.modo === 'produccion' && !prods.length && config.carta?.productos?.length ? `<div class="kad-demo"><span>${esc(t('importarCartaSub'))}</span><button class="kit-btn kit-btn--sm" data-importar>${esc(t('importarCarta'))}</button></div>` : ''}
      <section class="kad-cats">
        <h2 class="kad-sec">${esc(t('categorias'))}</h2>
        <ul class="kad-catlist">${cats.map((c, i) => `<li data-cat="${esc(c.id)}"><span>${esc(c.nombre)}</span>
          <span class="kad-catlist__btns">
            <button type="button" class="kit-icon" data-cat-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('subir'))}">↑</button>
            <button type="button" class="kit-icon" data-cat-mover="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="${esc(t('bajar'))}">↓</button>
            <button type="button" class="kit-icon" data-cat-editar aria-label="${esc(t('editar'))}">✎</button>
            <button type="button" class="kit-icon kit-icon--danger" data-cat-borrar aria-label="${esc(t('borrar'))}">✕</button></span></li>`).join('')}
          <li class="kad-catlist__add"><button type="button" class="kit-btn kit-btn--ghost kit-btn--sm" data-cat-nueva>+ ${esc(t('nuevaCategoria'))}</button></li></ul>
      </section>
      ${grupos.map(g => `<section class="kad-group">
        <h2 class="kad-sec">${esc(g.nombre)} <small>${g.items.length}</small></h2>
        ${g.items.length ? `<ul class="kad-prods">${g.items.map(p => `<li class="kad-prod${p.disponible === false ? ' is-off' : ''}" data-prod="${esc(p.id)}">
            ${p.foto ? `<img src="${esc(ctx.asset(p.foto))}" alt="" loading="lazy">` : '<span class="kad-prod__ph" aria-hidden="true"></span>'}
            <button type="button" class="kad-prod__main" data-editar><b>${esc(p.nombre)}</b><span>${p.precio != null ? ctx.money(p.precio) : esc(t('sinPrecio'))}</span></button>
            <label class="kit-switch" title="${esc(t('disponible'))}"><input type="checkbox" data-disp ${p.disponible !== false ? 'checked' : ''}><span class="kit-switch__ui" aria-hidden="true"></span><span class="kit-sr">${esc(t('disponible'))}</span></label>
          </li>`).join('')}</ul>` : `<p class="kad-muted">${esc(t('vacioCategoria'))}</p>`}
        ${!g.virtual ? `<button type="button" class="kit-btn kit-btn--ghost kit-btn--sm kad-addin" data-nuevo-prod="${esc(g.id)}">+ ${esc(t('nuevoProductoEn', { cat: g.nombre }))}</button>` : ''}
      </section>`).join('')}`;

    main.onclick = async (e) => {
      const np = e.target.closest('[data-nuevo-prod]');
      if (np) return editorProducto(null, cats, prods, np.dataset.nuevoProd || cats[0]?.id);
      const ed = e.target.closest('[data-editar]');
      if (ed) return editorProducto(prods.find(p => p.id === ed.closest('[data-prod]').dataset.prod), cats, prods);
      if (e.target.closest('[data-importar]')) { await store.importarCarta(); toast(t('guardado')); return render(); }
      if (e.target.closest('[data-cat-nueva]')) return editorCategoria(null, cats);
      const li = e.target.closest('[data-cat]'); if (!li) return;
      const cat = cats.find(c => c.id === li.dataset.cat);
      if (e.target.closest('[data-cat-editar]')) return editorCategoria(cat, cats);
      if (e.target.closest('[data-cat-borrar]')) {
        if (await confirmar(t('borrarCategoria', { nombre: cat.nombre }), { ok: t('borrar'), peligro: true })) { await store.deleteCategoria(cat.id); toast(t('borrado')); render(); }
        return;
      }
      const mv = e.target.closest('[data-cat-mover]');
      if (mv) {
        const i = cats.indexOf(cat), j = i + Number(mv.dataset.catMover);
        const orden = cats.slice(); [orden[i], orden[j]] = [orden[j], orden[i]];
        for (let k = 0; k < orden.length; k++) await store.saveCategoria({ ...orden[k], orden: k + 1 });
        render();
      }
    };
    main.onchange = async (e) => {
      if (!e.target.matches('[data-disp]')) return;
      const id = e.target.closest('[data-prod]').dataset.prod;
      await store.saveProducto({ ...prods.find(p => p.id === id), disponible: e.target.checked });
      toast(t('guardado'));
    };
  }

  function editorCategoria(cat, cats) {
    const f = h(`<form class="kit-form"><label class="kit-field"><span>${esc(t('nombreCategoria'))}</span><input name="nombre" required maxlength="40" value="${esc(cat?.nombre || '')}"></label>
      <div class="kit-row kit-row--end"><button type="button" class="kit-btn kit-btn--ghost" data-close>${esc(t('cancelar'))}</button><button class="kit-btn">${esc(t('guardar'))}</button></div></form>`);
    const p = popup({ titulo: cat ? t('editar') : t('nuevaCategoria'), contenido: f, clase: 'kit-pop--sm' });
    setTimeout(() => f.nombre.focus(), 80);
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const nombre = f.nombre.value.trim(); if (!nombre) return;
      let id = cat?.id || slug(nombre); while (!cat && cats.some(c => c.id === id)) id += '-2';
      await store.saveCategoria({ ...(cat || { orden: cats.length + 1 }), id, nombre });
      p.close(); toast(t('guardado')); render();
    });
  }

  function editorProducto(prod, cats, prods, catDefault) {
    const p0 = prod || { nombre: '', descripcion: '', precio: '', categoria: catDefault || cats[0]?.id || null, etiquetas: [], disponible: true, foto: '' };
    let foto = p0.foto || '';
    const f = h(`<form class="kit-form kad-editor" novalidate>
      <div class="kad-editor__foto">
        <div class="kad-editor__prev">${foto ? `<img src="${esc(ctx.asset(foto))}" alt="">` : '<span aria-hidden="true">+</span>'}</div>
        <div class="kit-row">
          <label class="kit-btn kit-btn--ghost kit-btn--sm kad-file"><input type="file" accept="image/*" data-file hidden><span>${esc(foto ? t('cambiarFoto') : t('subirFoto'))}</span></label>
          <button type="button" class="kit-btn kit-btn--ghost kit-btn--sm" data-sin-foto ${foto ? '' : 'hidden'}>${esc(t('quitarFoto'))}</button>
        </div>
      </div>
      <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" required maxlength="80" value="${esc(p0.nombre)}"></label>
      <div class="kit-field-row">
        <label class="kit-field"><span>${esc(t('precio'))} (${esc(ctx.pais.moneda)})</span><input name="precio" type="number" inputmode="decimal" min="0" step="${ctx.pais.decimales ? '0.01' : '1'}" value="${p0.precio ?? ''}"></label>
        <label class="kit-field"><span>${esc(t('categoria'))}</span><select name="categoria">${cats.map(c => `<option value="${esc(c.id)}" ${c.id === p0.categoria ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}<option value="" ${!p0.categoria ? 'selected' : ''}>${esc(t('sinCategoria'))}</option></select></label>
      </div>
      <label class="kit-field"><span>${esc(t('descripcion'))}</span><textarea name="descripcion" rows="3" maxlength="400">${esc(p0.descripcion)}</textarea></label>
      <label class="kit-field"><span>${esc(t('etiquetas'))}</span><input name="etiquetas" value="${esc((p0.etiquetas || []).join(', '))}" placeholder="picante, veggie, casa, nuevo"></label>
      <label class="kit-check"><input type="checkbox" name="disponible" ${p0.disponible !== false ? 'checked' : ''}><span>${esc(t('disponible'))}</span></label>
      <p class="kit-msg" role="alert" hidden></p>
      <div class="kit-row kit-row--between kad-editor__foot">
        ${prod ? `<button type="button" class="kit-btn kit-btn--ghost kit-btn--danger-t" data-borrar>${esc(t('borrar'))}</button>` : '<span></span>'}
        <div class="kit-row"><button type="button" class="kit-btn kit-btn--ghost" data-close>${esc(t('cancelar'))}</button><button class="kit-btn">${esc(t('guardar'))}</button></div>
      </div></form>`);
    const pop = popup({ titulo: prod ? prod.nombre : t('nuevoProducto'), contenido: f, clase: 'kit-pop--editor' });
    const prev = $('.kad-editor__prev', f);
    $('[data-file]', f).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      prev.classList.add('is-loading');
      try {
        foto = await store.uploadFoto(file);
        prev.innerHTML = `<img src="${esc(ctx.asset(foto))}" alt="">`; $('[data-sin-foto]', f).hidden = false;
        $('.kad-file span', f).textContent = t('cambiarFoto');
      } catch (_) { toast(t('fotoGrande'), 'warn'); }
      prev.classList.remove('is-loading');
    });
    $('[data-sin-foto]', f).addEventListener('click', (e) => { foto = ''; prev.innerHTML = '<span aria-hidden="true">+</span>'; e.target.hidden = true; });
    $('[data-borrar]', f)?.addEventListener('click', async () => {
      if (!(await confirmar(t('borrarProducto', { nombre: prod.nombre }), { ok: t('borrar'), peligro: true }))) return;
      await store.deleteProducto(prod.id); pop.close(); toast(t('borrado')); render();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = f.nombre.value.trim();
      if (!nombre) { const m = $('.kit-msg', f); m.textContent = t('faltan', { campos: t('nombre').toLowerCase() }); m.hidden = false; return; }
      let id = prod?.id || slug(nombre); while (!prod && prods.some(x => x.id === id)) id += '-2';
      const enCat = prods.filter(x => x.categoria === f.categoria.value);
      try {
        await store.saveProducto({
          ...(prod || {}), id, nombre, descripcion: f.descripcion.value.trim(),
          precio: f.precio.value === '' ? null : Number(f.precio.value), categoria: f.categoria.value || null,
          etiquetas: f.etiquetas.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
          disponible: f.disponible.checked, foto, orden: prod?.orden ?? (Math.max(0, ...enCat.map(x => x.orden || 0)) + 1),
        });
        pop.close(); toast(t('guardado')); render();
      } catch (err) {
        const m = $('.kit-msg', f); m.textContent = err.code === 'quota' ? t('fotoGrande') : t('error'); m.hidden = false;
      }
    });
    setTimeout(() => { if (!prod) f.nombre.focus(); }, 80);
  }

  // ---------- contadores de la navegación
  async function contadores() {
    const [peds, ress] = await Promise.all([
      config.modulos.carrito ? store.getPedidos() : [], config.modulos.reservas ? store.getReservas() : [],
    ]);
    const np = peds.filter(p => p.estado === 'pendiente').length;
    const nr = ress.filter(r => r.estado === 'pendiente' && r.fecha >= hoy()).length;
    const set = (k, n) => { const el = $(`[data-count="${k}"]`, root); if (el) { el.textContent = n; el.hidden = !n; } };
    set('pedidos', np); set('reservas', nr);
    document.title = `${np + nr ? `(${np + nr}) ` : ''}${t('panel')} · ${config.nombre}`;
  }

  async function render() {
    const main = $('#kad-main', root); if (!main) return;
    $$('[data-vista]', root).forEach(a => { const on = a.dataset.vista === vista; a.classList.toggle('is-on', on); a.setAttribute('aria-current', on ? 'page' : 'false'); });
    main.classList.remove('is-in'); void main.offsetWidth;
    try {
      if (vista === 'pedidos') await vistaPedidos(main);
      else if (vista === 'reservas') await vistaReservas(main);
      else if (vista === 'carta') await vistaCarta(main);
    } catch (err) { console.error('[kit] panel', err); main.innerHTML = `<p class="kit-error">${esc(t('error'))}</p>`; }
    main.classList.add('is-in');
    primeraCarga = false;
    contadores();
  }

  let rt;
  store.onChange((ev) => {
    if (!$('#kad-main', root)) return;
    clearTimeout(rt);
    rt = setTimeout(() => {
      // no repintar con un popup abierto (el dueño está editando)
      if (document.querySelector('.kit-pop')) { contadores(); return; }
      render();
      if (ev?.origen !== 'local' && vista !== 'carta') toast(`${t('nuevo')} ✓`);
    }, 120);
  });
  setInterval(() => { if (!document.querySelector('.kit-pop') && vista !== 'carta') render(); }, 60_000);

  async function arrancar() { layout(); render(); }
  if (await store.getSession()) arrancar(); else pantallaLogin();
  return ctx;
}
