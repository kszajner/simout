import { api } from '../api.js';
import { el, clear, toast, reportError, fmtDate, todayIso, confirmDialog, trimFloat, emptyState } from '../ui.js';

const FIELDS = [
    { key: 'weight', label: 'Waga (kg)' },
    { key: 'chest', label: 'Klatka (cm)' },
    { key: 'waist', label: 'Talia (cm)' },
    { key: 'hips', label: 'Biodra (cm)' },
    { key: 'bicep_left', label: 'Biceps L (cm)' },
    { key: 'bicep_right', label: 'Biceps P (cm)' },
    { key: 'thigh_left', label: 'Udo L (cm)' },
    { key: 'thigh_right', label: 'Udo P (cm)' },
];

const charts = new Map();

function chartOptions(textCol, grid, elevated, textPrimary) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: elevated, titleColor: textCol, bodyColor: textPrimary,
                borderColor: grid, borderWidth: 1, padding: 10, cornerRadius: 8, displayColors: false,
            },
        },
        scales: {
            x: { ticks: { color: textCol, maxTicksLimit: 6 }, grid: { display: false } },
            y: { ticks: { color: textCol }, grid: { color: grid }, beginAtZero: false },
        },
    };
}

export async function renderMeasurements(root) {
    clear(root);
    for (const c of charts.values()) c.destroy();
    charts.clear();

    // Add form
    const form = el('div', { class: 'card' });
    const dateInput = el('input', { type: 'date', class: 'input', value: todayIso() });
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Data']), dateInput]));

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
            if (!any) { toast('Wpisz przynajmniej jedną wartość', 'error'); return; }
            try {
                await api.createMeasurement(payload);
                toast('Zapisano', 'success');
                renderMeasurements(root);
            } catch (err) { reportError(err); }
        },
    }, ['Zapisz']));
    root.appendChild(form);

    // Charts
    let chartData;
    try { chartData = await api.measurementsChart(); } catch (err) { reportError(err); return; }
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent-measurements').trim() || '#6D84A1';
    const text = styles.getPropertyValue('--text-secondary').trim() || '#9C9184';
    const grid2 = styles.getPropertyValue('--border').trim() || 'rgba(237,230,220,.09)';
    const elevated = styles.getPropertyValue('--bg-elevated').trim() || '#241F19';
    const textPrimary = styles.getPropertyValue('--text-primary').trim() || '#EDE6DC';

    root.appendChild(el('div', { class: 'section-title' }, ['Trendy']));
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
                    backgroundColor: accent + '1A',
                    pointRadius: series.length > 45 ? 0 : 3,
                    pointHoverRadius: 4,
                    pointHitRadius: 12,
                    pointBackgroundColor: accent,
                    borderWidth: 2,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',
                    tension: 0.3,
                    fill: true,
                }],
            },
            options: chartOptions(text, grid2, elevated, textPrimary),
        });
        charts.set(f.key, chart);
    }
    if (!anyChart) {
        root.appendChild(emptyState({ hint: 'Zapisz pomiar powyżej, żeby zacząć śledzić trendy.' }));
    }

    // Apple Health body composition (separate source, own chart-key namespace)
    const HEALTH_FIELDS = [
        { key: 'weight_kg', label: 'Waga (kg)' },
        { key: 'bmi', label: 'BMI' },
        { key: 'body_fat_pct', label: 'Tkanka tłuszczowa (%)' },
        { key: 'lean_body_mass_kg', label: 'Masa mięśniowa (kg)' },
    ];
    let bodyComp = null;
    try { bodyComp = await api.healthBodyCompositionChart(); } catch { /* no health data yet */ }
    if (bodyComp) {
        const healthColor = styles.getPropertyValue('--accent-health').trim();
        let anyHealthChart = false;
        for (const f of HEALTH_FIELDS) {
            const series = (bodyComp.series || {})[f.key] || [];
            if (!series.length) continue;
            if (!anyHealthChart) root.appendChild(el('div', { class: 'section-title' }, ['Skład ciała (Apple Health)']));
            anyHealthChart = true;
            const wrap = el('div', { class: 'chart-wrap' }, [
                el('h3', {}, [f.label]),
                el('div', { class: 'chart-canvas-wrap' }, [el('canvas', {})]),
            ]);
            root.appendChild(wrap);
            const chart = new window.Chart(wrap.querySelector('canvas'), {
                type: 'line',
                data: {
                    labels: series.map(p => p.date),
                    datasets: [{
                        label: f.label,
                        data: series.map(p => p.value),
                        borderColor: healthColor,
                        backgroundColor: healthColor + '1A',
                        pointRadius: series.length > 45 ? 0 : 3,
                        pointHoverRadius: 4,
                        pointHitRadius: 12,
                        pointBackgroundColor: healthColor,
                        borderWidth: 2,
                        borderCapStyle: 'round',
                        borderJoinStyle: 'round',
                        tension: 0.3,
                        fill: true,
                    }],
                },
                options: chartOptions(text, grid2, elevated, textPrimary),
            });
            charts.set('bc_' + f.key, chart);
        }
    }

    // List of past entries
    let rows;
    try { rows = await api.listMeasurements(); } catch (err) { reportError(err); return; }
    if (!rows.length) return;
    root.appendChild(el('div', { class: 'section-title' }, ['Wpisy']));
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
        }, ['Edytuj']),
        el('button', {
            class: 'btn-danger btn btn-sm',
            onClick: async () => {
                if (!await confirmDialog('Usunąć ten pomiar?')) return;
                try { await api.deleteMeasurement(r.id); toast('Usunięto', 'success'); renderMeasurements(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['Usuń']),
    ]);
    return item;
}

function openEdit(r, rootForRefresh) {
    const overlay = el('div', {
        class: 'modal-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); },
    });
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', { style: { marginBottom: '12px' } }, ['Edytuj pomiar']));
    const dateInput = el('input', { type: 'date', class: 'input', value: r.date });
    card.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Data']), dateInput]));
    const inputs = {};
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
    for (const f of FIELDS) {
        const inp = el('input', { type: 'number', step: '0.1', class: 'input', value: r[f.key] != null ? r[f.key] : '' });
        inputs[f.key] = inp;
        grid.appendChild(el('div', { class: 'field', style: { marginBottom: 0 } }, [el('label', {}, [f.label]), inp]));
    }
    card.appendChild(grid);
    card.appendChild(el('div', { class: 'row', style: { marginTop: '16px' } }, [
        el('button', { class: 'btn btn-ghost grow', onClick: () => overlay.remove() }, ['Anuluj']),
        el('button', { class: 'btn btn-primary grow', onClick: async () => {
            const payload = { date: dateInput.value || r.date };
            for (const f of FIELDS) {
                const v = inputs[f.key].value.trim();
                payload[f.key] = v === '' ? null : parseFloat(v);
            }
            try { await api.updateMeasurement(r.id, payload); toast('Zapisano', 'success'); overlay.remove(); renderMeasurements(rootForRefresh); }
            catch (err) { reportError(err); }
        } }, ['Zapisz']),
    ]));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}
