// Módulo CANCHAS (complejos de fútbol, pádel…): deporte → día → horario → cancha → datos → seña con Mercado Pago o "pago en el complejo".
// La demo dibuja su propio selector (un mapa del predio, un tablero…) con la API y abre el checkout del kit:
//
//   kit.canchas.dias()                                  [{ fecha, dow, abierto, offset }]
//   kit.canchas.disponibilidad('padel', fecha)          [{ desde, hasta, label, pico, pasado, libres, unidades: [{ id, nombre, libre }] }]
//   kit.canchas.estado(fecha, desde, hasta)             { p1: true, f1: false… }  (true = libre)
//   kit.canchas.cotizar('padel', fecha, desde, { paleta: 2 })
//   kit.canchas.abrir({ deporte, unidad, fecha, desde, extras })   popup del checkout
//   kit.canchas.onCambio(fn)                            se llama cuando cambia la ocupación (otra reserva, el panel…)
//
// Sin JS propio: <div data-kit="canchas"></div> dibuja un selector simple con la marca del cliente.
// La demo puede dibujar su propia confirmación: document.addEventListener('kit:cancha-lista', e => { e.preventDefault(); … e.detail })
import { esc, h, $$, telValido } from '../core/util.js';
import { t } from '../core/i18n.js';
import { popup, toast } from '../core/ui.js';
import { diaNum, fechaDeNum, diaSemana, aHora, ahoraEn } from '../core/turnos.js';
import { configCanchas, deporteDe, unidades, ocupaDe, disponibilidad, diasReservables, cotizar, libre, extrasDe, tarifasDe } from '../core/canchas.js';
import { linkWhatsApp } from '../core/pedidos.js';

export function initCanchas(ctx, opts = {}) {
  const { config, store } = ctx;
  const C = configCanchas(config);
  let ocup = [];
  let tarifas = tarifasDe(C, {});
  const subs = new Set();
  const widgets = new Set();

  const hoy = () => ctx.hoy();
  const ahora = () => ahoraEn(ctx.tz);
  async function cargar() {
    const H = hoy();
    try {
      [ocup, tarifas] = await Promise.all([store.getOcupacionCanchas(fechaDeNum(diaNum(H) - 1), fechaDeNum(diaNum(H) + C.diasAdelante)), store.getTarifasCancha()]);
      ocup = ocup.map((o, i) => ({ id: `o${i}`, ...o }));
    } catch (e) { console.error('[kit] canchas', e); }
    subs.forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
    widgets.forEach(w => (w.isConnected ? w._pintar() : widgets.delete(w)));
    document.dispatchEvent(new CustomEvent('kit:canchas'));
  }
  const cargado = cargar();
  store.onChange(cargar);

  const dep = (id) => deporteDe(C, id);
  const uNombre = (depId, uId) => unidades(C, depId).find(u => u.id === uId)?.nombre || uId;
  const fLarga = (f) => { const [, m, d] = f.split('-').map(Number); return `${t('diasLargos')?.[diaSemana(f)] || t('diasCortos')[diaSemana(f)]} ${d}/${m}`; };
  const hhmm = (m) => aHora(m >= 1440 ? m - 1440 : m);
  const titulo = (depId, uId) => { const d = dep(depId); return d?.combinada ? d.nombre : `${d?.nombre || ''} · ${uNombre(depId, uId)}`.replace(/^(.+) · \1/, '$1'); };

  const api = {
    config: C, listo: cargado, recargar: cargar,
    deportes: C.deportes, canchas: C.canchas,
    dias: () => diasReservables(C, config.horarios, hoy()),
    disponibilidad: (depId, fecha) => disponibilidad(C, config.horarios, ocup, depId, fecha, ahora()),
    estado(fecha, desde, hasta) { const o = {}; C.canchas.forEach(c => { o[c.id] = libre(ocup, [c.id], fecha, desde, hasta); }); return o; },
    libre: (depId, uId, fecha, desde) => { const d = dep(depId); return !!d && libre(ocup, ocupaDe(C, depId, uId), fecha, desde, desde + d.duracion); },
    cotizar: (depId, fecha, desde, extras) => cotizar(C, tarifas, depId, fecha, desde, extras),
    tarifas: () => tarifas,
    onCambio(fn) { subs.add(fn); return () => subs.delete(fn); },
    abrir, titulo,
  };

  // ---------- checkout
  function crearCheckout(sel, { onDone } = {}) {
    const d = dep(sel.deporte);
    const st = { extras: { ...(sel.extras || {}) }, nombre: '', telefono: '', email: '' };
    const xs = extrasDe(C, sel.deporte);
    const mp = !!config.pagos?.mercadopago;
    const el = h(`<form class="kit-root kit-can" novalidate>
      <div class="kit-can__tk">
        <div class="kit-can__tk-top"><span class="kit-can__dep">${esc(titulo(sel.deporte, sel.unidad))}</span><span class="kit-can__fr" data-franja></span></div>
        <div class="kit-can__tk-h"><div><small>${esc(t('canDia'))}</small><b>${esc(fLarga(sel.fecha))}</b></div><div><small>${esc(t('canSale'))}</small><b>${esc(hhmm(sel.desde))}</b></div><div><small>${esc(t('canLlega'))}</small><b>${esc(hhmm(sel.desde + d.duracion))}</b></div></div>
      </div>
      ${xs.length ? `<div class="kit-can__xs"><span class="kit-label">${esc(t('canExtras'))}</span>${xs.map(x => `<div class="kit-can__x"><span>${esc(x.nombre)}<small>${ctx.money(Number(tarifas.extras?.[x.id] ?? x.precio) || 0)} ${esc(t('canPorTurno'))}</small></span>
        <div class="kit-step" role="group" aria-label="${esc(x.nombre)}"><button type="button" data-x="${esc(x.id)}" data-d="-1" aria-label="−">−</button><output data-xn="${esc(x.id)}">0</output><button type="button" data-x="${esc(x.id)}" data-d="1" aria-label="+">+</button></div></div>`).join('')}</div>` : ''}
      <div class="kit-can__datos">
        <label class="kit-field"><span>${esc(t('nombre'))}</span><input name="nombre" autocomplete="name" required></label>
        <label class="kit-field"><span>${esc(t('telefono'))}</span><input name="telefono" type="tel" inputmode="tel" autocomplete="tel" required></label>
      </div>
      <div class="kit-can__tot" data-tot aria-live="polite"></div>
      <p class="kit-msg" role="alert" hidden></p>
      <div class="kit-can__acc">
        ${mp ? `<button type="submit" name="pago" value="mercadopago" class="kit-btn kit-btn--big kit-btn--block" data-mp></button>` : ''}
        <button type="submit" name="pago" value="complejo" class="kit-btn kit-btn--big kit-btn--block ${mp ? 'kit-btn--ghost' : ''}">${esc(t('canReservarAlla'))}</button>
      </div>
      <p class="kit-can__nota">${esc(t('canPolitica', { horas: C.cancelacionHoras }))}</p>
    </form>`);
    const q = () => cotizar(C, tarifas, sel.deporte, sel.fecha, sel.desde, st.extras);
    function pintar() {
      const c = q();
      el.querySelector('[data-franja]').textContent = t(c.pico ? 'canPico' : 'canNoPico');
      el.querySelector('[data-franja]').classList.toggle('is-pico', c.pico);
      xs.forEach(x => { const n = st.extras[x.id] || 0; el.querySelector(`[data-xn="${x.id}"]`).textContent = n; el.querySelector(`[data-x="${x.id}"][data-d="-1"]`).disabled = n <= 0; el.querySelector(`[data-x="${x.id}"][data-d="1"]`).disabled = n >= (x.max ?? 10); });
      el.querySelector('[data-tot]').innerHTML = `
        <div><span>${esc(t('canTurno'))} · ${esc(t(c.pico ? 'canPico' : 'canNoPico').toLowerCase())}</span><b>${c.precio != null ? ctx.money(c.precio) : esc(t('sinPrecio'))}</b></div>
        ${c.extras.map(l => `<div><span>${l.cant} × ${esc(l.nombre)}</span><b>${ctx.money(l.precio * l.cant)}</b></div>`).join('')}
        <div class="kit-can__tot-t"><span>${esc(t('total'))}</span><b>${c.total != null ? ctx.money(c.total) : esc(t('sinPrecio'))}</b></div>
        ${mp && c.sena ? `<div class="kit-can__tot-s"><span>${esc(t('canSenaHoy', { pct: c.pct }))}</span><b>${ctx.money(c.sena)}</b></div><div><span>${esc(t('canResto'))}</span><b>${ctx.money(c.resto)}</b></div>` : ''}`;
      const b = el.querySelector('[data-mp]');
      if (b) { b.textContent = c.sena ? t('canPagarSena', { monto: ctx.money(c.sena) }) : t('canPagarMP'); b.disabled = c.total == null; }
    }
    function error(msg) { const m = el.querySelector('.kit-msg'); m.textContent = msg; m.hidden = false; m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const x = xs.find(y => y.id === b.dataset.x); st.extras[x.id] = Math.max(0, Math.min(x.max ?? 10, (st.extras[x.id] || 0) + Number(b.dataset.d))); pintar();
    });
    el.addEventListener('input', (e) => { if (['nombre', 'telefono', 'email'].includes(e.target.name)) st[e.target.name] = e.target.value; });
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pago = e.submitter?.value || 'complejo';
      const faltan = [];
      if (!st.nombre.trim()) faltan.push(t('nombre').toLowerCase());
      if (!telValido(st.telefono)) faltan.push(t('telefono').toLowerCase());
      if (faltan.length) return error(t('faltan', { campos: faltan.join(', ') }));
      if (!api.libre(sel.deporte, sel.unidad, sel.fecha, sel.desde)) return error(t('canOcupado'));
      const btns = $$('[type=submit]', el); btns.forEach(b => { b.disabled = true; }); e.submitter?.classList.add('is-loading');
      try {
        const tn = await store.createTurnoCancha({ deporte: sel.deporte, unidad: sel.unidad, fecha: sel.fecha, desde: sel.desde, extras: st.extras, nombre: st.nombre.trim(), telefono: st.telefono.trim(), pago, origen: 'web' });
        document.dispatchEvent(new CustomEvent('kit:cancha', { detail: tn }));
        cargar();
        const r = resumenDe(tn);
        if (pago === 'mercadopago' && tn.sena) { await pagarMP(tn, r); return; }
        const { url } = linkWhatsApp(config.whatsapp, mensajeWA(r, pago));
        listo(tn, r, 'complejo', url);
        onDone && onDone(tn);
      } catch (err) {
        btns.forEach(b => { b.disabled = false; b.classList.remove('is-loading'); });
        if (err.code === 'sin_lugar' || /sin_lugar/.test(err.message)) { error(t('canOcupado')); cargar(); }
        else { console.error('[kit] cancha', err); error(t('error')); }
      }
    });
    pintar();
    return el;
  }

  function abrir(sel = {}) {
    const d = dep(sel.deporte);
    if (!d || !sel.fecha || sel.desde == null) { toast(t('canElegi'), 'warn'); return null; }
    if (!sel.unidad) sel.unidad = unidades(C, d.id).find(u => libre(ocup, u.ocupa, sel.fecha, sel.desde, sel.desde + d.duracion))?.id;
    if (!sel.unidad || !api.libre(d.id, sel.unidad, sel.fecha, sel.desde)) { toast(t('canOcupado'), 'warn'); return null; }
    let p; const form = crearCheckout(sel, { onDone: () => p?.close() });
    p = popup({ titulo: t('canTitulo'), contenido: form, tipo: 'modal', clase: 'kit-pop--can' });
    return p;
  }

  function resumenDe(x) {
    return { codigo: x.codigo, cancha: titulo(x.deporte, x.unidad), fecha: fLarga(x.fecha), desde: hhmm(x.desde), hasta: hhmm(x.hasta), nombre: x.nombre,
      extras: (x.extras || []).map(l => `${l.cant} × ${l.nombre}`).join(', '), total: x.total != null ? ctx.money(x.total) : t('sinPrecio'),
      sena: x.sena ? ctx.money(x.sena) : '', resto: x.total != null ? ctx.money(x.total - (x.sena || 0)) : '', negocio: config.nombre, turno: x };
  }
  const mensajeWA = (r, pago) => [t('canWA', r), r.extras ? `${t('canExtras')}: ${r.extras}` : '', t(pago === 'mercadopago' ? 'canWAPagoMP' : 'canWAPagoAlla', r)].filter(Boolean).join('\n');

  function listo(turno, resumen, pago, waUrl) {
    document.querySelectorAll('.kit-pop--can').forEach(p => p.querySelector('[data-close]')?.click());
    const ev = new CustomEvent('kit:cancha-lista', { detail: { turno, resumen, pago, whatsapp: waUrl || linkWhatsApp(config.whatsapp, mensajeWA(resumen, pago)).url }, cancelable: true });
    if (!document.dispatchEvent(ev)) return;
    const url = ev.detail.whatsapp;
    const html = `<div class="kit-done">
      <div class="kit-done__ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h3>${esc(t(pago === 'mercadopago' ? 'canSenaPagada' : 'canListo'))}</h3><p>${esc(t('canListoSub', resumen))}</p>
      ${url ? `<div class="kit-row kit-row--center"><a class="kit-btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('avisarWA'))}</a></div>` : ''}</div>`;
    popup({ titulo: t('canListo'), contenido: html, clase: 'kit-pop--sm' });
  }

  // ---------- Mercado Pago (seña)
  const limpiar = (u) => { [...u.searchParams.keys()].forEach(k => { if (k === 'kit_turno' || /^(collection_|payment_|merchant_|preference_id|external_reference|status|site_id|processing_mode)/.test(k)) u.searchParams.delete(k); }); return u; };
  function urlRetorno(x) { const u = limpiar(new URL(location.href)); u.hash = ''; u.searchParams.set('kit_turno', x.id); return u.href; }
  async function pagarMP(x, r) {
    const mp = config.pagos.mercadopago;
    if (mp.modo === 'simulado' || !mp.endpoint) return simularMP(x);
    try {
      const res = await fetch(mp.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negocio: config.id, pais: config.pais, modo: mp.modo || 'sandbox', pedidoId: x.id, codigo: x.codigo,
          items: [{ title: `${t('canSenaCorta')} · ${r.cancha} · ${r.fecha} ${r.desde}`, quantity: 1, unit_price: x.sena }],
          backUrl: urlRetorno(x), payer: { name: x.nombre } }) });
      const j = await res.json().catch(() => ({}));
      const destino = (mp.modo !== 'produccion' && j.sandbox_init_point) || j.init_point;
      if (!res.ok || !destino) throw new Error(j.error || 'sin init_point');
      location.href = destino;
    } catch (err) {
      console.warn('[kit] Mercado Pago:', err.message); toast(t('mpSinConexion'), 'warn', 4200); simularMP(x);
    }
  }
  function simularMP(x) {
    document.querySelectorAll('.kit-pop--can').forEach(p => p.querySelector('[data-close]')?.click());
    const box = h(`<div class="kit-sim"><p class="kit-sim__tag">DEMO</p><p>${esc(t('mpSimuladoSub'))}</p>
      <div class="kit-sim__total"><span>${esc(x.codigo)} · ${esc(t('canSenaCorta'))}</span><b>${ctx.money(x.sena)}</b></div>
      <div class="kit-row kit-row--stack"><button type="button" class="kit-btn kit-btn--block" data-ok>${esc(t('mpAprobar'))}</button>
      <button type="button" class="kit-btn kit-btn--ghost kit-btn--block" data-no>${esc(t('mpRechazar'))}</button></div></div>`);
    const p = popup({ titulo: t('mpSimulado'), contenido: box, clase: 'kit-pop--sm' });
    box.querySelector('[data-ok]').onclick = () => { p.close(); retorno(x.id, 'approved', 'SIM-' + Date.now()); };
    box.querySelector('[data-no]').onclick = () => { p.close(); retorno(x.id, 'rejected'); };
  }
  async function retorno(id, status, pagoId = '') {
    const estado = status === 'approved' ? 'aprobado' : (/rejected|null|failure/.test(status)) ? 'rechazado' : 'pendiente';
    try { await store.updateTurnoCancha(id, { pagoEstado: estado, pagoId, ...(estado === 'rechazado' ? { estado: 'cancelada' } : {}) }); } catch (_) { /* en producción lo actualiza el webhook */ }
    cargar();
    const x = await store.getTurnoCanchaPublico(id);
    if (estado === 'aprobado' && x) listo(x, resumenDe(x), 'mercadopago');
    else if (estado === 'pendiente') toast(t('pagoPendiente'), 'warn', 4200);
    else toast(t('canPagoNo'), 'warn', 4200);
  }
  const qs = new URLSearchParams(location.search);
  if (qs.get('kit_turno')) {
    const id = qs.get('kit_turno'); const status = qs.get('collection_status') || qs.get('status') || 'pending';
    const u = limpiar(new URL(location.href)); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    cargado.then(() => retorno(id, status, qs.get('payment_id') || qs.get('collection_id') || ''));
  }

  // ---------- selector simple (sin diseño propio de la demo)
  function crearWidget() {
    const st = { deporte: C.deportes[0]?.id, fecha: hoy(), desde: null, unidad: null };
    const el = h(`<div class="kit-root kit-canw"><div class="kit-canw__dep" role="tablist" data-deps></div><div class="kit-canw__dias" data-dias></div><div class="kit-canw__hs" data-hs></div><div class="kit-canw__us" data-us></div>
      <button type="button" class="kit-btn kit-btn--big kit-btn--block" data-res>${esc(t('canReservar'))}</button></div>`);
    el._pintar = () => {
      const dias = api.dias().filter(x => x.abierto).slice(0, 10);
      if (!dias.some(x => x.fecha === st.fecha)) st.fecha = dias[0]?.fecha;
      const disp = st.fecha ? api.disponibilidad(st.deporte, st.fecha) : [];
      if (st.desde != null && !disp.some(x => x.desde === st.desde && x.libres)) st.desde = null;
      const slot = disp.find(x => x.desde === st.desde);
      if (!slot || !slot.unidades.some(u => u.id === st.unidad && u.libre)) st.unidad = slot?.unidades.find(u => u.libre)?.id || null;
      el.querySelector('[data-deps]').innerHTML = C.deportes.map(d => `<button type="button" role="tab" aria-selected="${d.id === st.deporte}" class="kit-chip${d.id === st.deporte ? ' is-on' : ''}" data-dep="${esc(d.id)}">${esc(d.nombre)}</button>`).join('');
      el.querySelector('[data-dias]').innerHTML = dias.map(x => { const [, m, dd] = x.fecha.split('-').map(Number); return `<button type="button" class="kit-chip${x.fecha === st.fecha ? ' is-on' : ''}" data-fecha="${x.fecha}">${esc(t('diasCortos')[x.dow])} ${dd}/${m}</button>`; }).join('');
      el.querySelector('[data-hs]').innerHTML = disp.length ? disp.map(x => `<button type="button" class="kit-chip${x.desde === st.desde ? ' is-on' : ''}" data-desde="${x.desde}" ${x.libres ? '' : 'disabled'}>${esc(x.label)}</button>`).join('') : `<p class="kit-muted">${esc(t('canSinTurnos'))}</p>`;
      el.querySelector('[data-us]').innerHTML = slot ? slot.unidades.map(u => `<button type="button" class="kit-chip${u.id === st.unidad ? ' is-on' : ''}" data-u="${esc(u.id)}" ${u.libre ? '' : 'disabled'}>${esc(u.nombre)}</button>`).join('') : '';
      el.querySelector('[data-res]').disabled = !st.unidad;
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.dep) { st.deporte = b.dataset.dep; st.desde = null; }
      else if (b.dataset.fecha) { st.fecha = b.dataset.fecha; st.desde = null; }
      else if (b.dataset.desde) st.desde = Number(b.dataset.desde);
      else if (b.dataset.u) st.unidad = b.dataset.u;
      else if (b.hasAttribute('data-res')) { abrir({ deporte: st.deporte, unidad: st.unidad, fecha: st.fecha, desde: st.desde }); return; }
      el._pintar();
    });
    el._pintar(); widgets.add(el);
    return el;
  }
  document.querySelectorAll('[data-kit="canchas"]').forEach(box => { box.innerHTML = ''; box.appendChild(crearWidget()); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kit-open="canchas"]'); if (!b) return;
    e.preventDefault(); abrir({ deporte: b.dataset.kitDeporte, unidad: b.dataset.kitCancha, fecha: b.dataset.kitFecha, desde: b.dataset.kitDesde != null ? Number(b.dataset.kitDesde) : null });
  });

  return api;
}
