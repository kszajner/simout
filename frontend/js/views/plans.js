import { api } from '../api.js';
import { el, clear, toast, reportError, confirmDialog, emptyState } from '../ui.js';

export async function renderPlans(root) {
    clear(root);
    root.appendChild(el('div', { class: 'row', style: { alignItems: 'center', marginBottom: '16px' } }, [
        el('h2', { class: 'grow' }, ['Plans']),
        el('a', { href: '#/exercises', class: 'btn btn-sm' }, ['📖 Library']),
    ]));

    // Add-plan form
    const newName = el('input', { class: 'input', placeholder: 'New plan name' });
    const addBtn = el('button', { class: 'btn btn-primary', onClick: async () => {
        const name = newName.value.trim();
        if (!name) return;
        try {
            await api.createPlan(name);
            newName.value = '';
            toast('Plan created', 'success');
            renderPlans(root);
        } catch (err) { reportError(err); }
    } }, ['Add']);
    root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [el('div', { class: 'grow' }, [newName]), addBtn]),
    ]));

    let plans = [];
    try { plans = await api.listPlans(); } catch (err) { reportError(err); return; }

    if (!plans.length) {
        root.appendChild(emptyState({ title: 'No plans yet', hint: 'Create one above to begin shaping your week.' }));
        return;
    }

    const tree = el('div', { style: { marginTop: '24px' } });
    for (const plan of plans) tree.appendChild(await renderPlanNode(plan, root));
    root.appendChild(tree);
}

async function renderPlanNode(plan, rootForRefresh) {
    const wrap = el('div', { class: 'tree-plan card' });

    const planNameInput = el('input', {
        class: 'inline-edit',
        value: plan.name,
        onChange: async (e) => {
            const v = e.target.value.trim();
            if (!v || v === plan.name) { e.target.value = plan.name; return; }
            try { await api.renamePlan(plan.id, v); plan.name = v; toast('Renamed', 'success'); }
            catch (err) { reportError(err); e.target.value = plan.name; }
        },
    });

    wrap.appendChild(el('div', { class: 'row', style: { marginBottom: '8px' } }, [
        el('div', { class: 'grow' }, [planNameInput]),
        el('button', {
            class: 'btn-danger btn btn-sm',
            onClick: async () => {
                if (!await confirmDialog(`Delete plan "${plan.name}" and all its days?`)) return;
                try { await api.deletePlan(plan.id); toast('Plan deleted', 'success'); renderPlans(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['Delete']),
    ]));

    // Days
    const daysWrap = el('div', {});
    wrap.appendChild(daysWrap);
    let days = [];
    try { days = await api.listDays(plan.id); } catch (err) { reportError(err); }
    for (const day of days) daysWrap.appendChild(await renderDayNode(plan, day, rootForRefresh));

    // Add day
    const newDay = el('input', { class: 'input', placeholder: 'New day (e.g. Push A)' });
    daysWrap.appendChild(el('div', { class: 'row', style: { marginTop: '8px' } }, [
        el('div', { class: 'grow' }, [newDay]),
        el('button', { class: 'btn btn-sm', onClick: async () => {
            const n = newDay.value.trim();
            if (!n) return;
            try {
                await api.createDay(plan.id, n, days.length);
                toast('Day added', 'success');
                renderPlans(rootForRefresh);
            } catch (err) { reportError(err); }
        } }, ['+ day']),
    ]));

    return wrap;
}

async function renderDayNode(plan, day, rootForRefresh) {
    const wrap = el('div', { class: 'tree-day' });
    const dayName = el('input', {
        class: 'inline-edit',
        value: day.name,
        onChange: async (e) => {
            const v = e.target.value.trim();
            if (!v || v === day.name) { e.target.value = day.name; return; }
            try { await api.updateDay(day.id, v, day.order_index); day.name = v; toast('Renamed', 'success'); }
            catch (err) { reportError(err); e.target.value = day.name; }
        },
    });

    wrap.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [dayName]),
        el('button', {
            class: 'btn-danger btn btn-sm',
            onClick: async () => {
                if (!await confirmDialog(`Delete day "${day.name}"?`)) return;
                try { await api.deleteDay(day.id); toast('Day deleted', 'success'); renderPlans(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['×']),
    ]));

    // Exercises in this day
    let exercises = [];
    try { exercises = await api.listDayExercises(day.id); } catch (err) { reportError(err); }
    let library = [];
    try { library = await api.listExercises(); } catch (err) { reportError(err); }

    for (const tde of exercises) {
        wrap.appendChild(renderTdeRow(tde, day, rootForRefresh));
    }

    // Add exercise to day — supports inline creation
    const select = el('select', { class: 'select' }, [
        el('option', { value: '' }, ['+ add exercise…']),
        el('option', { value: '__new__' }, ['✦ Create new exercise…']),
        library.length ? el('option', { value: '', disabled: true }, ['── library ──']) : null,
        ...library.map(e => el('option', { value: String(e.id) }, [e.name])),
    ]);
    select.addEventListener('change', async () => {
        const v = select.value;
        if (!v) return;
        if (v === '__new__') {
            select.value = '';
            const name = window.prompt('New exercise name (e.g. Bench Press)');
            if (!name || !name.trim()) return;
            try {
                const created = await api.createExercise(name.trim());
                await api.addDayExercise(day.id, { exercise_id: created.id, sets: 3, reps: 10, order_index: exercises.length });
                toast('Added', 'success');
                renderPlans(rootForRefresh);
            } catch (err) { reportError(err); }
            return;
        }
        const exerciseId = parseInt(v, 10);
        if (!exerciseId) return;
        try {
            await api.addDayExercise(day.id, { exercise_id: exerciseId, sets: 3, reps: 10, order_index: exercises.length });
            toast('Added', 'success');
            renderPlans(rootForRefresh);
        } catch (err) { reportError(err); select.value = ''; }
    });
    wrap.appendChild(el('div', { style: { marginTop: '6px' } }, [select]));

    return wrap;
}

function renderTdeRow(tde, day, rootForRefresh) {
    const setsInput = el('input', { type: 'number', class: 'input', style: { width: '60px', height: '36px', textAlign: 'center' }, value: tde.sets });
    const repsInput = el('input', { type: 'number', class: 'input', style: { width: '60px', height: '36px', textAlign: 'center' }, value: tde.reps });
    const save = async () => {
        const sets = parseInt(setsInput.value, 10) || 0;
        const reps = parseInt(repsInput.value, 10) || 0;
        if (sets === tde.sets && reps === tde.reps) return;
        try { await api.updateDayExercise(tde.id, { sets, reps }); tde.sets = sets; tde.reps = reps; }
        catch (err) { reportError(err); }
    };
    setsInput.addEventListener('blur', save);
    repsInput.addEventListener('blur', save);

    return el('div', { class: 'tree-exercise' }, [
        el('div', { class: 'name' }, [tde.exercise_name]),
        setsInput, el('span', { class: 'hint' }, ['×']), repsInput,
        el('button', {
            class: 'del-set-btn',
            'aria-label': 'Remove',
            onClick: async () => {
                try { await api.removeDayExercise(tde.id); toast('Removed', 'success'); renderPlans(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['×']),
    ]);
}
