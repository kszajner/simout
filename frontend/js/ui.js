// Tiny DOM + toast helpers shared by views.

export function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') e.innerHTML = v;
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child == null || child === false) continue;
        e.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return e;
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer = null;
export function toast(message, kind = 'info', ms = 2600) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = el('div', { class: 'toast ' + (kind === 'error' ? 'error' : kind === 'success' ? 'success' : '') }, [message]);
    c.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 200ms, transform 200ms';
        t.style.opacity = '0';
        t.style.transform = 'translateY(8px)';
        setTimeout(() => t.remove(), 220);
    }, ms);
}

export function reportError(err) {
    const msg = err && err.message ? err.message : 'Something went wrong';
    toast(msg, 'error');
    if (err) console.error(err);
}

export function setViewTitle(text) {
    const t = document.getElementById('view-title');
    if (t) t.textContent = text || '';
    const bar = document.getElementById('topbar');
    if (bar) bar.classList.toggle('has-title', !!text);
}

export function showBackButton(onClick) {
    const b = document.getElementById('back-btn');
    if (!b) return;
    b.hidden = !onClick;
    b.onclick = onClick || null;
}

export function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDuration(startIso, endIso) {
    if (!startIso || !endIso) return '';
    const s = new Date(startIso), e = new Date(endIso);
    const mins = Math.max(0, Math.round((e - s) / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

export function todayIso() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
}

export function confirmDialog(message) {
    return Promise.resolve(window.confirm(message));
}

export function summarizeSets(sets) {
    if (!sets || !sets.length) return '';
    return sets
        .filter(s => s.reps != null || s.weight != null)
        .map(s => {
            const r = s.reps != null ? s.reps : '–';
            const w = s.weight != null ? `${trimFloat(s.weight)}kg` : '–';
            return `${r}×${w}`;
        })
        .join(', ');
}

export function trimFloat(n) {
    if (n == null) return '';
    const x = Number(n);
    if (!isFinite(x)) return String(n);
    return x % 1 === 0 ? String(x) : x.toFixed(1).replace(/\.0$/, '');
}

const WAVE_MARK_SVG = `<svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M0 18 Q12 8 24 18 T48 18 T72 18 T96 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M0 28 Q12 18 24 28 T48 28 T72 28 T96 28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>
</svg>`;

export function emptyState({ title, hint } = {}) {
    return el('div', { class: 'empty' }, [
        el('div', { class: 'wave-mark', html: WAVE_MARK_SVG }),
        title ? el('p', { class: 'empty-title' }, [title]) : null,
        hint ? el('p', { class: 'hint' }, [hint]) : null,
    ]);
}
