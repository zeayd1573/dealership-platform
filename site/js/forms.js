/* =====================================================
   M6 MOTORS — SHARED FORM PAGE LOGIC
   Multi-step forms with client-side validation. Submits to
   the platform API when available; otherwise shows success
   in demo mode.
   ===================================================== */

function initSteppedForm(form, endpoint, extra = {}) {
  const steps = [...form.querySelectorAll('[data-step]')];
  const dots = [...document.querySelectorAll('[data-step-dot]')];
  const status = form.querySelector('.form-msg');
  let i = 0;

  const show = n => {
    i = n;
    steps.forEach((s, k) => s.hidden = k !== i);
    dots.forEach((d, k) => { d.classList.toggle('active', k === i); d.classList.toggle('done', k < i); });
    steps[i].querySelector('input, select, textarea')?.focus({ preventScroll: true });
  };
  const valid = () => {
    let ok = true;
    steps[i].querySelectorAll('[required]').forEach(el => {
      const bad = el.type === 'checkbox' ? !el.checked : !el.value.trim() || (el.type === 'email' && !/^\S+@\S+\.\S+$/.test(el.value));
      el.classList.toggle('invalid', bad); if (bad) ok = false;
    });
    if (!ok) { status.className = 'form-msg err'; status.textContent = 'Please complete the highlighted fields.'; }
    else status.className = 'form-msg';
    return ok;
  };

  form.addEventListener('click', e => {
    if (e.target.matches('[data-next]')) { e.preventDefault(); if (valid()) show(i + 1); }
    if (e.target.matches('[data-back]')) { e.preventDefault(); show(i - 1); }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!valid()) return;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, ...extra }) }).catch(() => null);
      if (!res || !res.ok) { const d = res ? await res.json().catch(() => ({})) : {}; status.className = 'form-msg err'; status.textContent = d.error || 'Sorry, we could not send that. Please call or WhatsApp us instead.'; return; }
      status.className = 'form-msg ok';
      status.textContent = 'Thanks, we have your details and will be in touch shortly.';
      steps.forEach(s => s.hidden = true); form.querySelector('.form-actions')?.setAttribute('hidden', '');
      dots.forEach(d => d.classList.add('done'));
    } finally { btn.disabled = false; btn.textContent = 'Submit'; }
  });
  show(0);
}
window.initSteppedForm = initSteppedForm;

/* Populate a <select> with the current stock, for "which car" pickers */
function fillCarSelect(sel, cars, selectedId) {
  cars.forEach(c => sel.add(new Option(`${c.name} · ${c.variant} · ${fmt.eur(c.price)}`, c.id)));
  if (selectedId) sel.value = selectedId;
}
window.fillCarSelect = fillCarSelect;
