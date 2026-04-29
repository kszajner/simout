import { api } from '../api.js';
import { el, clear, toast, reportError, fmtDate, todayIso, confirmDialog, trimFloat, emptyState } from '../ui.js';

const FIELDS = [
    { key: 'weight', label: 'Weight (kg)' },
    { key: 'chest', label: 'Chest (cm)' },
    { key: 'waist', label: 'Waist (cm)' },
    { key: 'hips', label: 'Hips (cm)' },
    { key: 'bicep_left', label: 'Bicep L (cm)' },
    { key: 'bicep_right', label: 'Bicep R (cm)' },
    { key: 'thigh_left', label: 'Thigh L (cm)' },
    { key: 'thigh_right', label: 'Thigh R (cm)' },
];

const charts = new Map();

export async function renderMeasurements(root) {
    clear(root);
    for (const c of charts.values()) c.destroy();
    charts.clear();

    root.appendChild(el('h2', { style: { marginBottom: '16px' } }, ['Body measurements']));

    // Add form
    const form = el('div', { class: 'card' });
    const dateInput = el('input', { type: 'date', class: 'input', value: todayIso() });
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Date']), dateInput]));

    const fieldInputs = {};
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
    for (const f of FIELDS) {
        const inp = el('input', { type: 'number', step: '0.1', class: 'input', placeholder: f.label });
        fieldInputs[f.key] = inp;
        grid.appendChild(el('div', { class: 'field', style: { marginBottom: 0 } }, [el('label', {}, [f.label]), inp]));
    }
    form.appendChild(grid);
    form.appendChild(el('button', {
        class: 'btn btn-primary btn-block',
        style: { marginTop: '12px' },
        onClick: async () => {
            const payload = { date: dateInput.value || todayIso() };
            let any = false;
            for (const f of FIELDS) {
                const v = fieldInputs[f.key].value.trim();
                if (v !== '') { payload[f.key] = parseFloat(v); any = true; }
            }
            if (!any) { toast('Enter at least one value', 'error'); return; }
            try {
                await api.createMeasurement(payload);
                toast('Saved', 'success');
                renderMeasurements(root);
            } catch (err) { reportError(err); }
        },
    }, ['Save']));
    root.appendChild(form);

    // Charts
    let chartData;
    try { chartData = await api.measurementsChart(); } catch (err) { reportError(err); return; }
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#C8A96E';
    const text = styles.getPropertyValue('--text-secondary').trim() || '#7A6A52';
    const grid2 = styles.getPropertyValue('--border').trim() || '#E4DBC8';

    root.appendChild(el('div', { class: 'section-title' }, ['Trends']));
    let anyChart = false;
    for (const f of FIELDS) {
        const series = (chartData.series || {})[f.key] || [];
        if (!series.length) continue;
        anyChart = true;
        const wrap = el('div', { class: 'chart-wrap' }, [
            el('h3', {}, [f.label]),
            el('div', { class: 'chart-canvas-wrap' }, [el('canvas', {})]),
        ]);
        root.appendChild(wrap);
        const canvas = wrap.querySelector('canvas');
        const chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: series.map(p => p.date),
                datasets: [{
                    label: f.label,
                    data: series.map(p => p.value),
                    borderColor: accent,
                    backgroundColor: accent + '22',
                    pointBackgroundColor: accent,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: text }, grid: { color: grid2 } },
                    y: { ticks: { color: text }, grid: { color: grid2 }, beginAtZero: false },
                },
            },
        });
        charts.set(f.key, chart);
    }
    if (!anyChart) {
        root.appendChild(emptyState({ hint: 'Save a measurement above to start tracking trends.' }));
    }

    // List of past entries
    let rows;
    try { rows = await api.listMeasurements(); } catch (err) { reportError(err); return; }
    if (!rows.length) return;
    root.appendChild(el('div', { class: 'section-title' }, ['Entries']));
    const list = el('ul', { class: 'list' });
    for (const r of rows) list.appendChild(measurementRow(r, root));
    root.appendChild(list);
}

function measurementRow(r, rootForRefresh) {
    const summary = FIELDS
        .filter(f => r[f.key] != null)
        .map(f => `${f.label.split(' ')[0]} ${trimFloat(r[f.key])}`)
        .join(' · ') || '—';
    const item = el('li', { class: 'list-item' }, [
        el('div', { class: 'grow' }, [
            el('div', {}, [fmtDate(r.date)]),
            el('div', { class: 'meta' }, [summary]),
        ]),
        el('button', {
            class: 'btn btn-ghost btn-sm',
            onClick: () => openEdit(r, rootForRefresh),
        }, ['Edit']),
        el('button', {
            class: 'btn-danger btn btn-sm',
            onClick: async () => {
                if (!await confirmDialog('Delete this measurement?')) return;
                try { await api.deleteMeasurement(r.id); toast('Deleted', 'success'); renderMeasurements(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['Delete']),
    ]);
    return item;
}

function openEdit(r, rootForRefresh) {
    const overlay = el('div', {
        style: {
            position: 'fixed', inset: '0', background: 'rgba(44,36,22,0.5)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        },
        onClick: (e) => { if (e.target === overlay) overlay.remove(); },
    });
    const card = el('div', { class: 'card', style: { maxWidth: '480px', width: '100%', maxHeight: '90vh', overflow: 'auto' } });
    card.appendChild(el('h3', { style: { marginBottom: '12px' } }, ['Edit measurement']));
    const dateInput = el('input', { type: 'date', class: 'input', value: r.date });
    card.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Date']), dateInput]));
    const inputs = {};
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
    for (const f of FIELDS) {
        const inp = el('input', { type: 'number', step: '0.1', class: 'input', value: r[f.key] != null ? r[f.key] : '' });
        inputs[f.key] = inp;
        grid.appendChild(el('div', { class: 'field', style: { marginBottom: 0 } }, [el('label', {}, [f.label]), inp]));
    }
    card.appendChild(grid);
    card.appendChild(el('div', { class: 'row', style: { marginTop: '16px' } }, [
        el('button', { class: 'btn btn-ghost grow', onClick: () => overlay.remove() }, ['Cancel']),
        el('button', { class: 'btn btn-primary grow', onClick: async () => {
            const payload = { date: dateInput.value || r.date };
            for (const f of FIELDS) {
                const v = inputs[f.key].value.trim();
                payload[f.key] = v === '' ? null : parseFloat(v);
            }
            try { await api.updateMeasurement(r.id, payload); toast('Saved', 'success'); overlay.remove(); renderMeasurements(rootForRefresh); }
            catch (err) { reportError(err); }
        } }, ['Save']),
    ]));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}
