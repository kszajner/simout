import { api } from '../api.js';
import { el, clear, toast, reportError, fmtDate, fmtDuration, todayIso, confirmDialog, emptyState } from '../ui.js';
import { navigate } from '../router.js';

export async function renderHome(root) {
    clear(root);
    root.appendChild(el('div', { class: 'hero' }, [
        el('div', { class: 'hero-art', html: HERO_SVG }),
        el('h1', {}, ['SimOut']),
        el('div', { class: 'tagline' }, ['simple workout']),
    ]));

    const [activePromise, lastDayPromise, recentPromise] = [
        api.activeSession().catch(() => null),
        api.lastUsedDay().catch(() => null),
        api.listSessions(3, 0).catch(() => []),
    ];

    const [active, lastDay, recent] = await Promise.all([activePromise, lastDayPromise, recentPromise]);

    if (active) {
        root.appendChild(el('div', { class: 'resume-banner' }, [
            el('div', { class: 'grow' }, [
                el('div', { style: { fontWeight: '500' } }, [`Resume ${active.training_day_name || 'workout'}`]),
                el('div', { class: 'hint' }, [`Started ${fmtDate(active.date)}`]),
            ]),
            el('button', { class: 'btn btn-primary btn-sm', onClick: () => navigate(`/workout/${active.id}`) }, ['Resume']),
            el('button', {
                class: 'btn btn-ghost btn-sm',
                onClick: async () => {
                    if (!await confirmDialog('Discard the in-progress workout?')) return;
                    try { await api.deleteSession(active.id); toast('Discarded', 'success'); renderHome(root); }
                    catch (err) { reportError(err); }
                },
            }, ['Discard']),
        ]));
    }

    // Start workout flow
    const startCard = el('div', { class: 'card' }, [
        el('h3', { style: { marginBottom: '12px' } }, ['Begin']),
    ]);

    if (lastDay) {
        startCard.appendChild(el('button', {
            class: 'btn btn-primary btn-block',
            style: { marginBottom: '8px' },
            disabled: !!active,
            onClick: () => startWorkout(lastDay.day_id),
        }, [`Start ${lastDay.day_name}`]));
        startCard.appendChild(el('div', { class: 'hint center', style: { marginBottom: '8px' } }, [`from ${lastDay.plan_name}`]));
    }

    startCard.appendChild(el('button', {
        class: 'btn btn-block',
        disabled: !!active,
        onClick: () => openPlanPicker(root),
    }, [lastDay ? 'Choose a different day' : 'Start a workout']));

    root.appendChild(startCard);

    // Recent sessions
    root.appendChild(el('div', { class: 'section-title' }, ['Recent']));
    if (!recent || !recent.length) {
        root.appendChild(emptyState({ title: 'A still harbour', hint: 'No sessions yet — your first one will appear here.' }));
    } else {
        const list = el('ul', { class: 'list' });
        for (const s of recent) {
            list.appendChild(el('li', {
                class: 'list-item',
                onClick: () => navigate(`/sessions/${s.id}`),
                style: { cursor: 'pointer' },
            }, [
                el('div', { class: 'grow' }, [
                    el('div', {}, [s.training_day_name || 'Workout']),
                    el('div', { class: 'meta' }, [fmtDate(s.date), s.finished_at ? ` · ${fmtDuration(s.started_at, s.finished_at)}` : ' · in progress']),
                ]),
                el('div', { class: 'hint' }, ['›']),
            ]));
        }
        root.appendChild(list);
        root.appendChild(el('div', { style: { marginTop: '12px', textAlign: 'center' } }, [
            el('a', { href: '#/history', class: 'muted', style: { fontSize: '14px' } }, ['See all history →']),
        ]));
    }

    root.appendChild(el('div', { class: 'section-title' }, ['Library']));
    root.appendChild(el('a', { href: '#/exercises', class: 'btn btn-block btn-ghost' }, ['Manage exercises']));
}

// Inline SVG: low horizon, distant island silhouette, sun, soft waves.
// (CSS vars must go through style="" since SVG presentation attributes don't resolve them.)
const HERO_SVG = `
<svg class="hero-svg" viewBox="0 0 320 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect class="sky"  x="0" y="0"  width="320" height="60"/>
  <rect class="sea"  x="0" y="60" width="320" height="60"/>
  <circle class="sun-glow" cx="240" cy="38" r="22"/>
  <circle class="sun"      cx="240" cy="38" r="14"/>
  <path class="island-far"  d="M 0 60 Q 30 48 60 56 T 120 58 L 120 62 L 0 62 Z"/>
  <path class="island-near" d="M 140 60 Q 180 42 220 56 T 320 58 L 320 62 L 140 62 Z"/>
  <path class="wave wave-1" d="M 0 76 Q 16 70 32 76 T 64 76 T 96 76 T 128 76 T 160 76 T 192 76 T 224 76 T 256 76 T 288 76 T 320 76" fill="none"/>
  <path class="wave wave-2" d="M 0 90 Q 20 84 40 90 T 80 90 T 120 90 T 160 90 T 200 90 T 240 90 T 280 90 T 320 90" fill="none"/>
  <path class="wave wave-3" d="M 0 106 Q 24 100 48 106 T 96 106 T 144 106 T 192 106 T 240 106 T 288 106 T 320 106" fill="none"/>
  <g class="boat" transform="translate(78,82)">
    <path class="boat-hull" d="M -8 4 L 8 4 L 6 8 L -6 8 Z"/>
    <path class="boat-sail" d="M 0 -8 L 0 4 L 6 4 Z"/>
    <line class="boat-mast" x1="0" y1="-8" x2="0" y2="4"/>
  </g>
</svg>`;

async function startWorkout(dayId) {
    try {
        const session = await api.startSession(dayId, todayIso());
        navigate(`/workout/${session.id}`);
    } catch (err) {
        reportError(err);
    }
}

async function openPlanPicker(root) {
    let plans = [];
    try { plans = await api.listPlans(); } catch (err) { reportError(err); return; }
    if (!plans.length) {
        toast('Create a plan first on the Plans tab', 'error');
        return;
    }

    // Replace home content with picker
    clear(root);
    root.appendChild(el('h2', { style: { marginBottom: '16px' } }, ['Choose a plan']));
    for (const p of plans) {
        const planCard = el('div', { class: 'card' });
        planCard.appendChild(el('h3', { style: { marginBottom: '8px' } }, [p.name]));
        const daysWrap = el('div', { class: 'muted' }, ['loading…']);
        planCard.appendChild(daysWrap);
        api.listDays(p.id).then(days => {
            clear(daysWrap);
            if (!days.length) {
                daysWrap.appendChild(el('div', { class: 'hint' }, ['No days in this plan.']));
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
        onClick: () => renderHome(root),
    }, ['Back']));
}
