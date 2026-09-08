import { api } from '../api.js';
import { el, clear, toast, reportError, fmtDate, confirmDialog, emptyState } from '../ui.js';
import { navigate } from '../router.js';

const ICON_ATTRS = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

const ICONS = {
    workout: '<path d="M4 12 h16"/><path d="M6 8 v8"/><path d="M18 8 v8"/><path d="M3 9 v6"/><path d="M21 9 v6"/>',
    exercises: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>',
    plans: '<path d="M12 4 v6"/><path d="M12 10 c0 3 -4 3 -4 6 v2"/><path d="M12 10 c0 3 4 3 4 6 v2"/><circle cx="12" cy="4" r="1.6"/><circle cx="8" cy="20" r="1.6"/><circle cx="16" cy="20" r="1.6"/>',
    history: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9 v4 l3 2"/><path d="M6.5 4.5 l-2.2 .8 .5 2.4"/>',
    progress: '<path d="M4 17 l5 -6 4 4 7 -9"/><path d="M15 6 h5 v5"/>',
    measurements: '<path d="M5 18 L18 5"/><path d="M7 16 l2 2"/><path d="M10.5 12.5 l2 2"/><path d="M14 9 l2 2"/>',
    health: '<path d="M3 12 h4 l2 -6 3 12 2 -9 1.5 3 H21"/>',
    blood: '<path d="M12 3 C12 3 6 11.5 6 15.5 A6 6 0 0 0 18 15.5 C18 11.5 12 3 12 3 Z"/>',
};

function iconSvg(name) {
    return `<svg ${Object.entries(ICON_ATTRS).map(([k, v]) => `${k}="${v}"`).join(' ')}>${ICONS[name]}</svg>`;
}

function tile({ accent, icon, title, sub, onClick, primary }) {
    const btn = el('button', {
        class: 'tile' + (primary ? ' tile-primary' : ''),
        onClick,
    }, [
        el('div', { class: 'tile-icon', html: iconSvg(icon) }),
        el('div', {}, [
            el('div', { class: 'tile-title' }, [title]),
            sub ? el('div', { class: 'tile-sub' }, [sub]) : null,
        ]),
    ]);
    // Custom properties aren't reflected through style-object assignment
    // (Object.assign(el.style, {...}) only works for known camelCase CSS
    // properties) — set it explicitly via the DOM API instead.
    btn.style.setProperty('--tile-accent', `var(--accent-${accent})`);
    return btn;
}

export async function renderHome(root) {
    clear(root);

    const [active, lastDay, recent, healthStatus] = await Promise.all([
        api.activeSession().catch(() => null),
        api.lastUsedDay().catch(() => null),
        api.listSessions(1, 0).catch(() => []),
        api.healthStatus().catch(() => null),
    ]);

    renderHub(root, { active, lastDay, recent, healthStatus });
}

function renderHub(root, { active, lastDay, recent, healthStatus }) {
    clear(root);

    // Status strip
    const steps = healthStatus && healthStatus.today ? healthStatus.today.steps : null;
    const lastWorkout = recent && recent[0] ? fmtDate(recent[0].date) : '—';
    root.appendChild(el('div', { class: 'status-strip' }, [
        el('div', { class: 'status-chip' }, [
            el('div', { class: 'status-value' }, [steps != null ? steps.toLocaleString() : '—']),
            el('div', { class: 'status-label' }, ['kroki dziś']),
        ]),
        el('div', { class: 'status-chip' }, [
            el('div', { class: 'status-value' }, [lastWorkout]),
            el('div', { class: 'status-label' }, ['ostatni trening']),
        ]),
    ]));

    if (active) {
        root.appendChild(el('div', { class: 'resume-banner' }, [
            el('div', { class: 'grow' }, [
                el('div', { style: { fontWeight: '500' } }, [`Wznów ${active.training_day_name || 'trening'}`]),
                el('div', { class: 'hint' }, [`Rozpoczęto ${fmtDate(active.date)}`]),
            ]),
            el('button', { class: 'btn btn-primary btn-sm', onClick: () => navigate(`/workout/${active.id}`) }, ['Wznów']),
            el('button', {
                class: 'btn btn-ghost btn-sm',
                onClick: async () => {
                    if (!await confirmDialog('Odrzucić rozpoczęty trening?')) return;
                    try { await api.deleteSession(active.id); toast('Odrzucono', 'success'); renderHome(root); }
                    catch (err) { reportError(err); }
                },
            }, ['Odrzuć']),
        ]));
    }

    const grid = el('div', { class: 'tile-grid' });

    grid.appendChild(tile({
        accent: 'workout', icon: 'workout', primary: true,
        title: 'Trening',
        sub: active ? 'w toku — wznów' : (lastDay ? `start: ${lastDay.day_name}` : 'wybierz plan'),
        onClick: () => {
            if (active) navigate(`/workout/${active.id}`);
            else if (lastDay) startWorkout(lastDay.day_id);
            else openPlanPicker(root, () => renderHub(root, { active, lastDay, recent, healthStatus }));
        },
    }));
    grid.appendChild(tile({ accent: 'exercises', icon: 'exercises', title: 'Ćwiczenia', onClick: () => navigate('/exercises') }));
    grid.appendChild(tile({ accent: 'plans', icon: 'plans', title: 'Plany', onClick: () => navigate('/plans') }));
    grid.appendChild(tile({ accent: 'history', icon: 'history', title: 'Historia', onClick: () => navigate('/history') }));
    grid.appendChild(tile({ accent: 'progress', icon: 'progress', title: 'Postępy', onClick: () => navigate('/progress') }));
    grid.appendChild(tile({ accent: 'measurements', icon: 'measurements', title: 'Pomiary', onClick: () => navigate('/measurements') }));
    grid.appendChild(tile({ accent: 'health', icon: 'health', title: 'Zdrowie', onClick: () => navigate('/health') }));
    grid.appendChild(tile({ accent: 'blood', icon: 'blood', title: 'Wyniki krwi', onClick: () => navigate('/blood') }));

    root.appendChild(grid);

    if (lastDay) {
        root.appendChild(el('div', { class: 'center', style: { marginTop: 'var(--space-4)' } }, [
            el('button', {
                class: 'btn btn-ghost btn-sm',
                disabled: !!active,
                onClick: () => openPlanPicker(root, () => renderHub(root, { active, lastDay, recent, healthStatus })),
            }, ['Wybierz inny dzień treningu']),
        ]));
    }
}

async function startWorkout(dayId) {
    try {
        const session = await api.startSession(dayId, todayIsoLocal());
        navigate(`/workout/${session.id}`);
    } catch (err) {
        reportError(err);
    }
}

function todayIsoLocal() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
}

async function openPlanPicker(root, onBack) {
    let plans = [];
    try { plans = await api.listPlans(); } catch (err) { reportError(err); return; }
    if (!plans.length) {
        toast('Najpierw utwórz plan w sekcji Plany', 'error');
        return;
    }

    clear(root);
    root.appendChild(el('h2', { style: { marginBottom: '16px' } }, ['Wybierz dzień']));
    for (const p of plans) {
        const planCard = el('div', { class: 'card' });
        planCard.appendChild(el('h3', { style: { marginBottom: '8px' } }, [p.name]));
        const daysWrap = el('div', { class: 'muted' }, ['ładowanie…']);
        planCard.appendChild(daysWrap);
        api.listDays(p.id).then(days => {
            clear(daysWrap);
            if (!days.length) {
                daysWrap.appendChild(el('div', { class: 'hint' }, ['Brak dni w tym planie.']));
                return;
            }
            for (const d of days) {
                daysWrap.appendChild(el('button', {
                    class: 'btn btn-block',
                    style: { marginBottom: '6px' },
                    onClick: () => startWorkout(d.id),
                }, [d.name]));
            }
        }).catch(reportError);
        root.appendChild(planCard);
    }
    root.appendChild(el('button', {
        class: 'btn btn-ghost btn-block',
        style: { marginTop: '16px' },
        onClick: onBack,
    }, ['Wstecz']));
}
