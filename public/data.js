// All Supabase calls live here. The UI in app.js and a/address.js only talks to window.Data.
(function () {
  const CFG = window.APP_CONFIG;
  if (!window.supabase || !CFG) { window.Data = null; return; }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    db: { schema: 'shirts' },
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const clean = v => (typeof v === 'string' ? v.trim().slice(0, 300) || null : null);
  const TOKEN_RE = /^[a-f0-9]{64}$/;

  function must({ data, error }) {
    if (!error) return data;
    let msg = error.message || 'Something went wrong';
    if (error.code === '42501' || /row-level security|permission denied/i.test(msg))
      msg = "This login isn't set up as the shop admin. Run tools/add-admin.sql in Supabase.";
    else if (error.code === '23503') msg = 'That size does not exist.';
    else if (error.code === 'P0002') msg = 'Order not found.';
    else if (/schema must be one of/i.test(msg)) msg = 'Supabase is not exposing the "shirts" schema yet (Project Settings > Data API).';
    else if (/Failed to fetch|NetworkError/i.test(msg)) msg = 'Network error. Check your connection.';
    const e = new Error(msg); e.code = error.code; throw e;
  }

  // ----- auth -----
  async function isAdmin() { return must(await sb.rpc('is_admin')) === true; }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) throw new Error('Wrong email or password.');
    if (!(await isAdmin())) {
      await sb.auth.signOut();
      throw new Error("That login isn't set up as the shop admin yet. Run tools/add-admin.sql in Supabase.");
    }
  }
  async function hasAdminSession() {
    try {
      const { data } = await sb.auth.getSession();
      return !!data.session && (await isAdmin());
    } catch { return false; }
  }
  const signOut = () => sb.auth.signOut();
  const onSignedOut = cb => sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cb(); });

  // ----- orders, stock, pricing -----
  function shape(row, order) {
    const { order_items, ...o } = row;
    o.items = (order_items || []).map(i => ({ size: i.size, qty: i.qty }))
      .sort((a, b) => (order[a.size] ?? 99) - (order[b.size] ?? 99));
    return o;
  }
  async function load() {
    const [orders, sizes, settings] = await Promise.all([
      sb.from('orders').select('*, order_items(size, qty)').order('created_at', { ascending: false }).then(must),
      sb.from('inventory_summary').select('*').order('sort_order').then(must),
      sb.from('settings').select('shirt_price, shipping_fee').single().then(must),
    ]);
    const order = Object.fromEntries(sizes.map(s => [s.size, s.sort_order]));
    return { orders: orders.map(r => shape(r, order)), sizes, settings };
  }
  function payload(b) {
    const f = {
      name: clean(b.name), email: clean(b.email), phone: clean(b.phone),
      amount_due: Math.max(0, Number(b.amount_due) || 0),
      paid: !!b.paid, payment_method: clean(b.payment_method),
      ship_needed: b.ship_needed !== false,
      addr_name: clean(b.addr_name), addr_line1: clean(b.addr_line1), addr_line2: clean(b.addr_line2),
      addr_city: clean(b.addr_city), addr_state: clean(b.addr_state), addr_zip: clean(b.addr_zip),
      shipped: !!b.shipped, carrier: clean(b.carrier), tracking_number: clean(b.tracking_number),
      picked_up: !!b.picked_up, notes: clean(b.notes),
    };
    if (!f.name) throw new Error('Name is required.');
    f.items = (b.items || []).map(i => ({ size: String(i.size || ''), qty: parseInt(i.qty, 10) })).filter(i => i.size && i.qty > 0);
    return f;
  }
  const saveOrder = async (id, body) => must(await sb.rpc('save_order', { p_id: id || null, p: payload(body) }));
  const deleteOrder = async id => must(await sb.from('orders').delete().eq('id', id));
  const setStock = async (size, stock) =>
    must(await sb.from('inventory').update({ stock: Math.max(0, parseInt(stock, 10) || 0) }).eq('size', size));
  const setPricing = async (price, ship) =>
    must(await sb.from('settings').update({ shirt_price: Math.max(0, Number(price) || 0), shipping_fee: Math.max(0, Number(ship) || 0) }).eq('id', true));

  // ----- public address link (works without signing in) -----
  async function getAddressLink(token) {
    if (!TOKEN_RE.test(token || '')) return null;
    return must(await sb.rpc('get_address_link', { p_token: token }));
  }
  async function submitAddress(token, f) {
    if (!TOKEN_RE.test(token || '')) throw new Error('Link not found.');
    const ok = must(await sb.rpc('submit_address', {
      p_token: token, p_addr_name: f.addr_name || null, p_line1: f.addr_line1 || null, p_line2: f.addr_line2 || null,
      p_city: f.addr_city || null, p_state: f.addr_state || null, p_zip: f.addr_zip || null, p_phone: f.phone || null,
    }));
    if (!ok) throw new Error('Link not found.');
  }

  window.Data = { signIn, hasAdminSession, signOut, onSignedOut, load, saveOrder, deleteOrder, setStock, setPricing, getAddressLink, submitAddress };
})();
