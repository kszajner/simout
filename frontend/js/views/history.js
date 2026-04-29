import { api } from '../api.js';
import { el, clear, reportError, fmtDate, fmtDuration, summarizeSets, emptyState } from '../ui.js';

export async function renderHistory(root, focusedSessionId = null) {
    clear(root);

    if (focusedSessionId) {
        await renderSessionDetail(root, focusedSessionId);
        return;
    }

    root.appendChild(el('h2', { style: { marginBottom: '16px' } }, ['History']));

    let sessions = [];
    try { sessions = await api.listSessions(50, 0); } catch (err) { reportError(err); return; }

    if (!sessions.length) {
        root.appendChild(emptyState({ title: 'No history yet', hint: 'Finished workouts will be remembered here.' }));
        return;
    }

    const list = el('ul', { class: 'list' });
    for (const s of sessions) {
        const item = el('li', {
            class: 'list-item',
            style: { cursor: 'pointer' },
            onClick: () => { window.location.hash = `#/sessions/${s.id}`; },
        }, [
            el('div', { class: 'grow' }, [
                el('div', {}, [s.training_day_name || 'Workout', s.plan_name ? el('span', { class: 'hint', style: { marginLeft: '8px' } }, [`· ${s.plan_name}`]) : null]),
                el('div', { class: 'meta' }, [
                    fmtDate(s.date),
                    s.finished_at ? ` · ${fmtDuration(s.started_at, s.finished_at)}` : ' · in progress',
                ]),
            ]),
            el('div', { class: 'hint' }, ['›']),
        ]);
        list.appendChild(item);
    }
    root.appendChild(list);
}

async function renderSessionDetail(root, sessionId) {
    let detail;
    try { detail = await api.sessionDetail(sessionId); } catch (err) { reportError(err); return; }
    const { session, sets } = detail;

    root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
                el('h2', {}, [session.training_day_name || 'Workout']),
                session.plan_name ? el('div', { class: 'muted', style: { fontSize: '14px' } }, [session.plan_name]) : null,
            ]),
            el('div', { class: 'hint', style: { textAlign: 'right' } }, [
                fmtDate(session.date),
                el('br', {}),
                session.finished_at ? fmtDuration(session.started_at, session.finished_at) : 'in progress',
            ]),
        ]),
    ]));

    if (!sets.length) {
        root.appendChild(emptyState({ hint: 'No sets were logged in this session.' }));
        return;
    }

    // Group sets by exercise
    const byExercise = new Map();
    for (const s of sets) {
        const key = s.exercise_id;
        if (!byExercise.has(key)) byExercise.set(key, { name: s.exercise_name, sets: [] });
        byExercise.get(key).sets.push(s);
    }

    for (const [, group] of byExercise) {
        group.sets.sort((a, b) => a.set_number - b.set_number);
        const card = el('div', { class: 'card' }, [
            el('h3', { style: { marginBottom: '6px', fontSize: '17px' } }, [group.name]),
            el('div', { class: 'muted', style: { fontSize: '14px' } }, [summarizeSets(group.sets) || '—']),
        ]);
        root.appendChild(card);
    }
}
