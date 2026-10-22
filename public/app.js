const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fdate = d => { if (!d) return ''; const x = new Date(d); return `${x.getMonth()+1}/${x.getDate()}/${String(x.getFullYear()).slice(2)}`; };

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 1800); }
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); toast(msg); }
}

const S = { orders: [], sizes: [], settings: { shirt_price: 25, shipping_fee: 0 }, filter: 'all', q: '', tab: 'orders' };

// ---------- login ----------
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#go').onclick = async () => {
  $('#loginErr').textContent = '';
  try { await Data.signIn($('#em').value, $('#pw').value); $('#pw').value = ''; boot(); }
  catch (e) { $('#loginErr').textContent = e.message; }
};
['#em', '#pw'].forEach(id => $(id).addEventListener('keydown', e => e.key === 'Enter' && $('#go').click()));

async function boot() {
  if (!window.Data) { showLogin(); $('#loginErr').textContent = 'Could not load the app libraries. Check your connection and reload.'; return; }
  if (!window.__wired) { window.__wired = true; Data.onSignedOut(showLogin); }
  if (!(await Data.hasAdminSession())) return showLogin();
  $('#login').hidden = true; $('#app').hidden = false;
  try { await refresh(); } catch (e) { toast(e.message); }
}
async function refresh() {
  const d = await Data.load();
  S.orders = d.orders; S.sizes = d.sizes; S.settings = d.settings;
  render(); renderStock();
}

// ---------- helpers ----------
const qty = o => o.items.reduce((a, i) => a + i.qty, 0);
const hasAddr = o => !!(o.addr_line1 && o.addr_city);
const FILTERS = [
  ['all', 'All', () => true],
  ['unpaid', 'Unpaid', o => !o.paid],
  ['paid', 'Paid', o => o.paid],
  ['toship', 'To ship', o => o.ship_needed && !o.shipped],
  ['ready', 'Ready to pack', o => o.paid && o.ship_needed && !o.shipped && hasAddr(o)],
  ['noaddr', 'Needs address', o => o.ship_needed && !hasAddr(o)],
  ['shipped', 'Shipped', o => o.shipped],
  ['pickup', 'Pickup', o => !o.ship_needed],
  ['pickwait', 'Awaiting pickup', o => !o.ship_needed && !o.picked_up],
];
const addrText = o => [o.addr_name || o.name, o.addr_line1, o.addr_line2, `${o.addr_city || ''}, ${o.addr_state || ''} ${o.addr_zip || ''}`.trim()].filter(Boolean).join('\n');
const trackUrl = o => {
  const t = encodeURIComponent(o.tracking_number || '');
  if (!t) return '';
  return ({ USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`, UPS: `https://www.ups.com/track?tracknum=${t}`, FedEx: `https://www.fedex.com/fedextrack/?trknbr=${t}` })[o.carrier] || '';
};
const linkFor = o => `${location.origin}/a/#${o.address_token}`;

// ---------- orders view ----------
function badges(o) {
  const b = [o.paid ? `<span class="b good">Paid ${o.payment_method ? '· ' + esc(o.payment_method) : ''}</span>` : `<span class="b bad">Unpaid</span>`];
  if (!o.ship_needed) b.push(`<span class="b ${o.picked_up ? 'good' : 'warn'}">${o.picked_up ? 'Picked up' : 'Pickup'}</span>`);
  else {
    b.push(hasAddr(o) ? `<span class="b info">Address in</span>` : `<span class="b warn">Needs address</span>`);
    b.push(o.shipped ? `<span class="b good">Shipped ${fdate(o.shipped_at)}${o.tracking_number ? ' · ' + esc(o.carrier || '') + ' ' + esc(o.tracking_number) : ''}</span>` : `<span class="b warn">Not shipped</span>`);
  }
  return b.join('');
}
function card(o) {
  const sizes = o.items.map(i => `<span class="sz">${esc(i.size)}${i.qty > 1 ? ' ×' + i.qty : ''}</span>`).join('') || '<span class="b info">No sizes yet</span>';
  return `<button class="card" data-id="${o.id}">
    <div class="top"><span class="nm">${esc(o.name)}</span><span class="amt">${money(o.amount_due)}</span></div>
    <div class="sizes">${sizes}</div><div class="badges">${badges(o)}</div></button>`;
}
function render() {
  const O = S.orders;
  const collected = O.filter(o => o.paid).reduce((a, o) => a + Number(o.amount_due), 0);
  const owed = O.filter(o => !o.paid).reduce((a, o) => a + Number(o.amount_due), 0);
  $('#stats').innerHTML = [[O.reduce((a, o) => a + qty(o), 0), 'shirts'], [money(collected), 'collected'], [money(owed), 'owed'], [O.filter(o => o.ship_needed && !o.shipped).length, 'to ship']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#chips').innerHTML = FILTERS.map(([k, l, fn]) => `<button class="chip ${S.filter === k ? 'on' : ''}" data-k="${k}">${l} ${O.filter(fn).length}</button>`).join('');
  const fn = FILTERS.find(f => f[0] === S.filter)[2];
  const rows = O.filter(fn).filter(o => o.name.toLowerCase().includes(S.q.toLowerCase()));
  $('#list').innerHTML = rows.length ? rows.map(card).join('')
    : `<div class="empty"><b>${O.length ? 'Nothing here' : 'No orders yet'}</b>${O.length ? 'Try a different filter.' : 'Tap + Order to add your first buyer.'}</div>`;
}
$('#chips').onclick = e => { const k = e.target.closest('.chip')?.dataset.k; if (k) { S.filter = k; render(); } };
$('#q').oninput = e => { S.q = e.target.value; render(); };
$('#list').onclick = e => { const id = e.target.closest('.card')?.dataset.id; if (id) openSheet(S.orders.find(o => o.id === id)); };
$('#newBtn').onclick = () => openSheet(null);
$('#tOrders').onclick = () => setTab('orders');
$('#tStock').onclick = () => setTab('stock');
function setTab(t) {
  S.tab = t; $('#orders').hidden = t !== 'orders'; $('#stockView').hidden = t !== 'stock';
  $('#tOrders').classList.toggle('on', t === 'orders'); $('#tStock').classList.toggle('on', t === 'stock');
  $('#newBtn').hidden = t !== 'orders';
}

// ---------- stock view ----------
function renderStock() {
  const tot = S.sizes.reduce((a, s) => ({ stock: a.stock + s.stock, sold: a.sold + s.sold, remaining: a.remaining + s.remaining }), { stock: 0, sold: 0, remaining: 0 });
  $('#stockView').innerHTML = `
    <div class="sec"><h3>Inventory</h3>
      <div class="stock"><span></span><span class="h">Have</span><span class="h">Sold</span><span class="h">Left</span></div>
      ${S.sizes.map(s => `<div class="stock"><b>${esc(s.size)}</b>
        <input type="number" inputmode="numeric" min="0" value="${s.stock}" data-size="${esc(s.size)}" aria-label="${esc(s.size)} total">
        <span class="v">${s.sold}</span><span class="v" style="color:${s.remaining < 0 ? 'var(--red)' : 'inherit'}">${s.remaining}</span></div>`).join('')}
      <div class="stock"><b>Total</b><span class="v">${tot.stock}</span><span class="v">${tot.sold}</span><span class="v">${tot.remaining}</span></div>
      <p style="color:var(--muted);font-size:14px;margin:8px 0 0">"Have" is how many of each size you ordered or have on hand. Sold counts every order. A negative Left means you've promised more than you have.</p>
    </div>
    <div class="sec"><h3>Pricing</h3>
      <div class="row"><div><label for="pPrice">Price per shirt</label><input id="pPrice" type="number" inputmode="decimal" step="0.01" value="${S.settings.shirt_price}"></div>
      <div><label for="pShip">Shipping fee</label><input id="pShip" type="number" inputmode="decimal" step="0.01" value="${S.settings.shipping_fee}"></div></div>
      <button class="btn red block" id="savePrice" style="margin-top:12px">Save pricing</button></div>
    <button class="btn ghost block" id="logout">Sign out</button>`;
  $('#stockView').querySelectorAll('input[data-size]').forEach(i => i.onchange = async () => {
    try { await Data.setStock(i.dataset.size, i.value); await refresh(); toast('Stock saved'); } catch (e) { toast(e.message); }
  });
  $('#savePrice').onclick = async () => { try { await Data.setPricing($('#pPrice').value, $('#pShip').value); await refresh(); toast('Pricing saved'); } catch (e) { toast(e.message); } };
  $('#logout').onclick = async () => { await Data.signOut(); showLogin(); };
}

// ---------- order sheet ----------
function openSheet(o) {
  const isNew = !o;
  const d = o ? JSON.parse(JSON.stringify(o)) : { name: '', items: [], paid: false, ship_needed: true, amount_due: 0, shipped: false, picked_up: false };
  const counts = Object.fromEntries(d.items.map(i => [i.size, i.qty]));
  let dirty = !isNew;
  const host = $('#sheetHost');
  const fld = (k, label, type = 'text', extra = '') => `<label for="f_${k}">${label}</label><input id="f_${k}" type="${type}" value="${esc(d[k])}" ${extra}>`;

  host.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${isNew ? 'New order' : 'Edit order'}">
    <div class="bar"><h2>${isNew ? 'New order' : esc(d.name)}</h2><button class="btn small" id="close">Close</button></div>
    <div class="body">
      <div class="sec"><h3>Buyer</h3>
        ${fld('name', 'Name')}${fld('phone', 'Phone', 'tel')}${fld('email', 'Email', 'email')}</div>

      <div class="sec"><h3>Sizes</h3><div class="steps" id="steps"></div></div>

      <div class="sec"><h3>Payment</h3>
        <div class="tog"><span>Paid</span><input class="sw" type="checkbox" id="f_paid" ${d.paid ? 'checked' : ''}></div>
        <div class="row"><div><label for="f_amount_due">Amount due</label><input id="f_amount_due" type="number" inputmode="decimal" step="0.01" value="${d.amount_due}"></div>
        <div><label for="f_payment_method">Paid with</label><select id="f_payment_method">${['', 'venmo', 'cash', 'zelle', 'paypal', 'check', 'other'].map(m => `<option value="${m}" ${d.payment_method === m || (!d.payment_method && !m) ? 'selected' : ''}>${m || '—'}</option>`).join('')}</select></div></div>
        ${d.paid_at ? `<p style="color:var(--muted);margin:8px 0 0">Paid ${fdate(d.paid_at)}</p>` : ''}</div>

      <div class="sec"><h3>Delivery</h3>
        <div class="tog"><span>Needs shipping</span><input class="sw" type="checkbox" id="f_ship_needed" ${d.ship_needed ? 'checked' : ''}></div>
        <div id="shipBox"></div>
        <div id="pickBox"></div></div>

      <div class="sec"><h3>Notes</h3><textarea id="f_notes" rows="3">${esc(d.notes)}</textarea></div>
      ${isNew ? '' : '<button class="btn ghost block" id="del" style="color:var(--red)">Delete order</button>'}
    </div>
    <div class="savebar"><button class="btn red" id="save">Save order</button></div></div>`;
  document.body.style.overflow = 'hidden';
  const close = () => { host.innerHTML = ''; document.body.style.overflow = ''; };
  $('#close').onclick = close;

  const price = () => {
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    return n * Number(S.settings.shirt_price) + (n && $('#f_ship_needed').checked ? Number(S.settings.shipping_fee) : 0);
  };
  const autoAmount = () => { if (!dirty) $('#f_amount_due').value = price(); };
  $('#f_amount_due').oninput = () => { dirty = true; };

  const drawSteps = () => {
    $('#steps').innerHTML = S.sizes.map(s => {
      const c = counts[s.size] || 0;
      const left = s.remaining + (o?.items.find(i => i.size === s.size)?.qty || 0) - c;
      return `<div class="step ${c ? 'has' : ''}"><div class="s">${esc(s.size)}</div><div class="r">${left} left</div>
        <div class="ctl"><button data-s="${esc(s.size)}" data-d="-1" aria-label="Less ${esc(s.size)}">−</button><span class="q">${c}</span><button data-s="${esc(s.size)}" data-d="1" aria-label="More ${esc(s.size)}">+</button></div></div>`;
    }).join('');
  };
  drawSteps();
  $('#steps').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    counts[b.dataset.s] = Math.max(0, (counts[b.dataset.s] || 0) + Number(b.dataset.d));
    drawSteps(); autoAmount();
  };

  const drawDelivery = () => {
    const ship = $('#f_ship_needed').checked;
    $('#pickBox').innerHTML = ship ? '' : `<div class="tog"><span>Picked up</span><input class="sw" type="checkbox" id="f_picked_up" ${d.picked_up ? 'checked' : ''}></div>`;
    $('#shipBox').innerHTML = !ship ? '' : `
      <div class="addr-actions" style="margin:0 0 6px">
        <button class="btn small" id="shareLink">Send address link</button>
        <button class="btn small ghost" id="copyLink">Copy link</button></div>
      ${d.address_submitted_at ? `<p style="color:var(--ok);font-weight:800;margin:4px 0 8px">Address received ${fdate(d.address_submitted_at)}</p>` : '<p style="color:var(--muted);margin:4px 0 8px">Or type it in yourself:</p>'}
      ${fld('addr_name', 'Ship to name')}${fld('addr_line1', 'Street')}${fld('addr_line2', 'Apt / suite')}
      <div class="row3"><div><label for="f_addr_city">City</label><input id="f_addr_city" type="text" value="${esc(d.addr_city)}"></div>
      <div><label for="f_addr_state">State</label><input id="f_addr_state" type="text" value="${esc(d.addr_state)}" maxlength="2" autocapitalize="characters"></div>
      <div><label for="f_addr_zip">ZIP</label><input id="f_addr_zip" type="text" inputmode="numeric" value="${esc(d.addr_zip)}"></div></div>
      <div class="addr-actions"><button class="btn small ghost" id="copyAddr">Copy address</button></div>
      <hr style="border:0;border-top:2px dashed var(--line);margin:14px 0">
      <div class="tog"><span>Shipped</span><input class="sw" type="checkbox" id="f_shipped" ${d.shipped ? 'checked' : ''}></div>
      <div class="row"><div><label for="f_carrier">Carrier</label><select id="f_carrier">${['', 'USPS', 'UPS', 'FedEx', 'Other'].map(c => `<option value="${c}" ${d.carrier === c || (!d.carrier && !c) ? 'selected' : ''}>${c || '—'}</option>`).join('')}</select></div>
      <div><label for="f_tracking_number">Tracking #</label><input id="f_tracking_number" type="text" value="${esc(d.tracking_number)}" autocapitalize="characters"></div></div>
      ${d.shipped_at ? `<p style="color:var(--muted);margin:8px 0 0">Shipped ${fdate(d.shipped_at)}${trackUrl(d) ? ` · <a href="${trackUrl(d)}" target="_blank" rel="noopener">Track package</a>` : ''}</p>` : ''}`;
    if (ship) {
      $('#copyAddr').onclick = () => copy(addrText(readForm()), 'Address copied');
      $('#copyLink').onclick = () => copy(linkFor(d), 'Link copied');
      $('#shareLink').onclick = () => {
        const text = `Hi ${d.name.split(' ')[0] || ''}! Where should I ship your shirt? Add your address here:`;
        if (navigator.share) navigator.share({ text, url: linkFor(d) }).catch(() => {});
        else copy(`${text} ${linkFor(d)}`, 'Message copied');
      };
      if (isNew) { $('#shareLink').disabled = $('#copyLink').disabled = true; $('#shareLink').title = 'Save the order first'; }
    }
  };
  drawDelivery();
  $('#f_ship_needed').onchange = () => { Object.assign(d, readForm()); drawDelivery(); autoAmount(); };

  const val = id => { const el = $('#' + id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
  function readForm() {
    const keys = ['name', 'phone', 'email', 'amount_due', 'payment_method', 'addr_name', 'addr_line1', 'addr_line2', 'addr_city', 'addr_state', 'addr_zip', 'carrier', 'tracking_number', 'notes'];
    const out = { ...d };
    keys.forEach(k => { const v = val('f_' + k); if (v !== undefined) out[k] = v; });
    ['paid', 'ship_needed', 'shipped', 'picked_up'].forEach(k => { const v = val('f_' + k); if (v !== undefined) out[k] = v; });
    out.items = Object.entries(counts).filter(([, q]) => q > 0).map(([size, q]) => ({ size, qty: q }));
    return out;
  }
  $('#save').onclick = async () => {
    const body = readForm();
    if (!body.name.trim()) { toast('Add a name first'); return; }
    try {
      await Data.saveOrder(isNew ? null : o.id, body);
      close(); await refresh(); toast('Saved');
    } catch (e) { toast(e.message); }
  };
  if (!isNew) $('#del').onclick = async () => {
    if (!confirm(`Delete ${o.name}'s order?`)) return;
    try { await Data.deleteOrder(o.id); close(); await refresh(); toast('Deleted'); } catch (e) { toast(e.message); }
  };
}

boot();
