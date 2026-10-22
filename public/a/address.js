const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token = location.hash.slice(1);

(async () => {
  if (!window.Data) { $('#box').innerHTML = '<h3>Something went wrong</h3><p>This page could not load. Please try again in a minute.</p>'; return; }
  let d = null;
  try { d = await Data.getAddressLink(token); } catch (e) { /* fall through to not-found */ }
  if (!d) { $('#box').innerHTML = '<h3>Link not found</h3><p>This link doesn\'t look right. Ask for a fresh one.</p>'; return; }

  const first = esc((d.name || '').split(' ')[0]);
  const f = (k, label, extra = '') => `<label for="${k}">${label}</label><input id="${k}" type="text" value="${esc(d[k])}" ${extra}>`;
  $('#box').innerHTML = `<h3>Hi ${first}!</h3>
    <p style="margin-top:0">${d.address_submitted_at ? 'We have your address. Update it below if anything changed.' : 'Tell us where to send your shirt.'}</p>
    ${f('addr_name', 'Name on package', 'autocomplete="name"')}
    ${f('addr_line1', 'Street', 'autocomplete="address-line1"')}
    ${f('addr_line2', 'Apt / suite (optional)', 'autocomplete="address-line2"')}
    <div class="row3"><div><label for="addr_city">City</label><input id="addr_city" type="text" value="${esc(d.addr_city)}" autocomplete="address-level2"></div>
    <div><label for="addr_state">State</label><input id="addr_state" type="text" maxlength="2" autocapitalize="characters" value="${esc(d.addr_state)}" autocomplete="address-level1"></div>
    <div><label for="addr_zip">ZIP</label><input id="addr_zip" type="text" inputmode="numeric" value="${esc(d.addr_zip)}" autocomplete="postal-code"></div></div>
    <label for="phone">Phone (optional)</label><input id="phone" type="tel" autocomplete="tel">
    <button class="btn red block" id="send" style="margin-top:14px">Save my address</button><div class="err" id="err" role="alert"></div>`;
  if (!$('#addr_name').value) $('#addr_name').value = d.name;

  $('#send').onclick = async () => {
    const body = {};
    ['addr_name', 'addr_line1', 'addr_line2', 'addr_city', 'addr_state', 'addr_zip', 'phone'].forEach(k => body[k] = $('#' + k).value);
    $('#send').disabled = true; $('#err').textContent = '';
    try {
      await Data.submitAddress(token, body);
      $('#box').innerHTML = `<h3>You're all set, ${first}!</h3><p>Your address is saved. Thanks for riding with Team Jessie's Breasties.</p>`;
    } catch (e) { $('#err').textContent = e.message; $('#send').disabled = false; }
  };
})();
