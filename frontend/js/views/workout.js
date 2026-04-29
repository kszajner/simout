import { api } from '../api.js';
import { el, clear, toast, reportError, summarizeSets, trimFloat, confirmDialog, emptyState } from '../ui.js';
import { navigate } from '../router.js';

export async function renderWorkout(root, sessionId) {
    clear(root);
    root.appendChild(el('div', { class: 'center muted', html: 'loading…' }));

    let detail;
    try {
        detail = await api.sessionDetail(sessionId);
    } catch (err) {
        clear(root);
        root.appendChild(emptyState({ title: 'Session not found', hint: 'It may have been discarded.' }));
        root.appendChild(el('div', { class: 'center', style: { marginTop: '12px' } }, [
            el('button', { class: 'btn', onClick: () => navigate('/') }, ['Home']),
        ]));
        return;
    }

    const { session, template, sets } = detail;
    const isFinished = !!session.finished_at;
    clear(root);

    // ----- Header card -----
    const header = el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
                el('h2', {}, [session.training_day_name || 'Workout']),
                session.plan_name ? el('div', { class: 'muted', style: { fontSize: '14px' } }, [session.plan_name]) : null,
            ]),
            el('div', { class: 'hint', style: { textAlign: 'right' } }, [session.date]),
        ]),
    ]);
    root.appendChild(header);

    // Build exercise list from union of template + already-logged sets
    // Order: template order first (template list is already sorted), then any extra exercises that have sets but aren't in template (ordered by first set id)
    const exerciseOrder = [];
    const seen = new Set();
    for (const t of template) {
        if (!seen.has(t.exercise_id)) { seen.add(t.exercise_id); exerciseOrder.push({ exercise_id: t.exercise_id, exercise_name: t.exercise_name, template: t }); }
    }
    for (const s of sets) {
        if (!seen.has(s.exercise_id)) { seen.add(s.exercise_id); exerciseOrder.push({ exercise_id: s.exercise_id, exercise_name: s.exercise_name, template: null }); }
    }

    if (!exerciseOrder.length) {
        root.appendChild(emptyState({ title: 'Empty plan', hint: 'This day has no exercises. Add some on the Plans tab, then start again.' }));
    }

    // Group existing sets by exercise
    const setsByExercise = new Map();
    for (const s of sets) {
        if (!setsByExercise.has(s.exercise_id)) setsByExercise.set(s.exercise_id, []);
        setsByExercise.get(s.exercise_id).push(s);
    }
    for (const arr of setsByExercise.values()) arr.sort((a, b) => a.set_number - b.set_number);

    // Render each exercise block
    const blocks = el('div', {});
    for (const ex of exerciseOrder) {
        const block = await renderExerciseBlock({
            sessionId,
            exerciseId: ex.exercise_id,
            exerciseName: ex.exercise_name,
            template: ex.template,
            existingSets: setsByExercise.get(ex.exercise_id) || [],
            isFinished,
        });
        blocks.appendChild(block);
    }
    root.appendChild(blocks);

    // ----- Finish bar -----
    if (!isFinished) {
        const finishBar = el('div', { class: 'finish-bar' }, [
            el('div', { class: 'finish-bar-inner row' }, [
                el('button', {
                    class: 'btn btn-ghost',
                    onClick: async () => {
                        if (!await confirmDialog('Discard this in-progress workout? All logged sets will be lost.')) return;
                        try {
                            await api.deleteSession(sessionId);
                            toast('Session discarded', 'success');
                            navigate('/');
                        } catch (err) { reportError(err); }
                    },
                }, ['Discard']),
                el('div', { class: 'spacer' }),
                el('button', {
                    class: 'btn btn-primary',
                    onClick: async () => {
                        try {
                            await api.finishSession(sessionId);
                            toast('Workout complete', 'success');
                            navigate('/');
                        } catch (err) { reportError(err); }
                    },
                }, ['Finish workout']),
            ]),
        ]);
        root.appendChild(finishBar);
        // Padding so finish-bar doesn't cover content
        root.style.paddingBottom = '160px';
    }
}

async function renderExerciseBlock({ sessionId, exerciseId, exerciseName, template, existingSets, isFinished }) {
    const block = el('div', { class: 'workout-exercise' });

    block.appendChild(el('h3', {}, [exerciseName]));

    // Last-session hint (fetched lazily)
    const hint = el('div', { class: 'last-hint' }, ['…']);
    block.appendChild(hint);
    api.lastSession(exerciseId, sessionId).then(last => {
        if (!last || !last.sets || !last.sets.length) {
            hint.textContent = 'No previous record.';
            return;
        }
        hint.textContent = `Last (${last.date}): ${summarizeSets(last.sets)}`;
    }).catch(() => { hint.textContent = ''; });

    // Column header row — makes reps/kg unmistakable
    block.appendChild(el('div', { class: 'set-row set-head', 'aria-hidden': 'true' }, [
        el('div', { class: 'set-num' }, ['#']),
        el('div', { class: 'set-head-label' }, ['reps']),
        el('div', { class: 'set-head-label' }, ['kg']),
        el('div', {}, []),
        el('div', {}, []),
    ]));

    const setsContainer = el('div', { class: 'sets-container' });
    block.appendChild(setsContainer);

    // Determine target set count: max(template.sets, existingSets.length, 1)
    const templateSets = template ? template.sets : 0;
    const initialCount = Math.max(templateSets, existingSets.length, 1);

    // Map of set_number -> { row element, persisted set object | null }
    const state = {
        rows: new Map(),
        nextSetNumber: 1,
    };

    // Pre-fill existing
    for (const s of existingSets) {
        addSetRow(setsContainer, state, { sessionId, exerciseId, isFinished, persisted: s, setNumber: s.set_number, templateReps: template?.reps });
    }

    // Pad with empty rows up to initialCount
    while (state.rows.size < initialCount) {
        const next = nextFreeSetNumber(state);
        addSetRow(setsContainer, state, { sessionId, exerciseId, isFinished, persisted: null, setNumber: next, templateReps: template?.reps });
    }

    if (!isFinished) {
        const addBtn = el('button', {
            class: 'add-set-btn',
            onClick: () => {
                const next = nextFreeSetNumber(state);
                addSetRow(setsContainer, state, { sessionId, exerciseId, isFinished, persisted: null, setNumber: next, templateReps: template?.reps });
            },
        }, ['+ add set']);
        block.appendChild(addBtn);
    }

    return block;
}

function nextFreeSetNumber(state) {
    let n = 1;
    while (state.rows.has(n)) n++;
    return n;
}

function addSetRow(container, state, { sessionId, exerciseId, isFinished, persisted, setNumber, templateReps }) {
    const repsInput = el('input', {
        type: 'number',
        inputmode: 'numeric',
        class: 'set-input',
        placeholder: templateReps != null ? String(templateReps) : 'reps',
        value: persisted?.reps != null ? persisted.reps : '',
        disabled: isFinished,
    });
    const weightInput = el('input', {
        type: 'number',
        inputmode: 'decimal',
        step: '0.5',
        class: 'set-input',
        placeholder: 'kg',
        value: persisted?.weight != null ? trimFloat(persisted.weight) : '',
        disabled: isFinished,
    });

    const checkBtn = el('button', {
        class: 'check-btn' + (persisted?.completed ? ' checked' : ''),
        'aria-label': 'Mark set complete',
        type: 'button',
        disabled: isFinished,
    }, ['✓']);

    const delBtn = el('button', {
        class: 'del-set-btn',
        'aria-label': 'Remove set',
        type: 'button',
        disabled: isFinished,
        title: 'Remove set',
    }, ['×']);

    const row = el('div', {
        class: 'set-row' + (persisted?.completed ? ' completed' : ''),
    }, [
        el('div', { class: 'set-num' }, [String(setNumber)]),
        repsInput,
        weightInput,
        checkBtn,
        delBtn,
    ]);

    const ref = { row, persisted: persisted ? { ...persisted } : null };
    state.rows.set(setNumber, ref);

    const readReps = () => {
        const v = repsInput.value.trim();
        return v === '' ? null : Math.max(0, parseInt(v, 10) || 0);
    };
    const readWeight = () => {
        const v = weightInput.value.trim();
        return v === '' ? null : parseFloat(v);
    };

    const setCompletedUI = (completed) => {
        checkBtn.classList.toggle('checked', completed);
        row.classList.toggle('completed', completed);
    };

    // Tap ✓ → save (creates if not yet persisted), toggle completed flag
    checkBtn.addEventListener('click', async () => {
        if (isFinished) return;
        checkBtn.disabled = true;
        try {
            const reps = readReps();
            const weight = readWeight();
            if (!ref.persisted) {
                const nowCompleted = true;
                const created = await api.logSet(sessionId, {
                    exercise_id: exerciseId,
                    set_number: setNumber,
                    reps, weight,
                    completed: nowCompleted,
                });
                ref.persisted = created;
                setCompletedUI(true);
            } else {
                const newCompleted = !ref.persisted.completed;
                const updated = await api.updateSet(ref.persisted.id, {
                    reps, weight, completed: newCompleted,
                });
                ref.persisted = updated;
                setCompletedUI(!!updated.completed);
            }
        } catch (err) {
            reportError(err);
        } finally {
            checkBtn.disabled = isFinished;
        }
    });

    // Edits to a saved set re-save on blur
    const saveOnBlur = async () => {
        if (!ref.persisted || isFinished) return;
        const reps = readReps();
        const weight = readWeight();
        if (reps === ref.persisted.reps && weight === ref.persisted.weight) return;
        try {
            const updated = await api.updateSet(ref.persisted.id, { reps, weight });
            ref.persisted = updated;
        } catch (err) { reportError(err); }
    };
    repsInput.addEventListener('blur', saveOnBlur);
    weightInput.addEventListener('blur', saveOnBlur);

    delBtn.addEventListener('click', async () => {
        if (isFinished) return;
        if (ref.persisted) {
            if (!await confirmDialog('Remove this set?')) return;
            try { await api.deleteSet(ref.persisted.id); } catch (err) { reportError(err); return; }
        }
        state.rows.delete(setNumber);
        row.remove();
    });

    container.appendChild(row);
}
