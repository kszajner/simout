import { api } from '../api.js';
import { el, clear, toast, reportError, fmtDate, todayIso, confirmDialog, trimFloat, emptyState } from '../ui.js';

const charts = new Map();

function destroyCharts() {
    for (const c of charts.values()) c.destroy();
    charts.clear();
}

function markerRow(marker = {}) {
    const name = el('input', { type: 'text', class: 'input', placeholder: 'nazwa (np. Cholesterol)', value: marker.name || '' });
    const value = el('input', { type: 'number', step: '0.01', class: 'input', placeholder: 'wartość', value: marker.value != null ? marker.value : '' });
    const unit = el('input', { type: 'text', class: 'input', placeholder: 'jednostka', value: marker.unit || '' });
    const refLow = el('input', { type: 'number', step: '0.01', class: 'input', placeholder: 'od', value: marker.ref_low != null ? marker.ref_low : '' });
    const refHigh = el('input', { type: 'number', step: '0.01', class: 'input', placeholder: 'do', value: marker.ref_high != null ? marker.ref_high : '' });
    const row = el('div', {
        class: 'row',
        style: { marginBottom: '8px', flexWrap: 'wrap' },
    }, [
        el('div', { style: { flex: '2 1 140px' } }, [name]),
        el('div', { style: { flex: '1 1 80px' } }, [value]),
        el('div', { style: { flex: '1 1 70px' } }, [unit]),
        el('div', { style: { flex: '1 1 60px' } }, [refLow]),
        el('div', { style: { flex: '1 1 60px' } }, [refHigh]),
        el('button', { class: 'btn btn-ghost btn-sm', onClick: () => row.remove() }, ['✕']),
    ]);
    row._inputs = { name, value, unit, refLow, refHigh };
    return row;
}

function readMarkerRows(container) {
    const markers = [];
    for (const row of container.children) {
        const { name, value, unit, refLow, refHigh } = row._inputs;
        const n = name.value.trim();
        const v = value.value.trim();
        if (!n || v === '') continue;
        markers.push({
            name: n,
            value: parseFloat(v),
            unit: unit.value.trim() || null,
            ref_low: refLow.value.trim() === '' ? null : parseFloat(refLow.value),
            ref_high: refHigh.value.trim() === '' ? null : parseFloat(refHigh.value),
        });
    }
    return markers;
}

export async function renderBlood(root) {
    clear(root);
    destroyCharts();

    // Add panel form
    const form = el('div', { class: 'card' });
    form.appendChild(el('h3', { style: { marginBottom: '12px' } }, ['Nowy panel badań']));
    const dateInput = el('input', { type: 'date', class: 'input', value: todayIso() });
    const labInput = el('input', { type: 'text', class: 'input', placeholder: 'laboratorium (opcjonalnie)' });
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Data']), dateInput]));
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Laboratorium']), labInput]));

    const markersWrap = el('div', {});
    markersWrap.appendChild(markerRow());
    form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Markery']), markersWrap]));
    form.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm',
        style: { marginBottom: '12px' },
        onClick: () => markersWrap.appendChild(markerRow()),
    }, ['+ dodaj marker']));

    form.appendChild(el('button', {
        class: 'btn btn-primary btn-block',
        onClick: async () => {
            const markers = readMarkerRows(markersWrap);
            if (!markers.length) { toast('Dodaj przynajmniej jeden marker', 'error'); return; }
            try {
                await api.createBloodPanel({ date: dateInput.value || todayIso(), lab_name: labInput.value.trim() || null, markers });
                toast('Zapisano', 'success');
                renderBlood(root);
            } catch (err) { reportError(err); }
        },
    }, ['Zapisz panel']));
    root.appendChild(form);

    // Past panels
    let panels;
    try { panels = await api.listBloodPanels(); } catch (err) { reportError(err); return; }

    root.appendChild(el('div', { class: 'section-title' }, ['Panele']));
    if (!panels.length) {
        root.appendChild(emptyState({ hint: 'Dodaj pierwszy panel powyżej.' }));
    } else {
        const list = el('ul', { class: 'list' });
        for (const p of panels) {
            list.appendChild(el('li', {
                class: 'list-item',
                style: { cursor: 'pointer' },
                onClick: () => openPanel(p, root),
            }, [
                el('div', { class: 'grow' }, [
                    el('div', {}, [fmtDate(p.date), p.lab_name ? ` · ${p.lab_name}` : '']),
                    el('div', { class: 'meta' }, [`${p.markers.length} marker${p.markers.length === 1 ? '' : 'ów'}`]),
                ]),
                el('div', { class: 'hint' }, ['›']),
            ]));
        }
        root.appendChild(list);
    }

    // Trend charts for recurring markers
    let trend;
    try { trend = await api.bloodMarkersChart(); } catch { trend = null; }
    if (trend && Object.keys(trend.series).length) {
        root.appendChild(el('div', { class: 'section-title' }, ['Trendy']));
        const styles = getComputedStyle(document.documentElement);
        const color = styles.getPropertyValue('--accent-blood').trim();
        const textCol = styles.getPropertyValue('--text-secondary').trim();
        const grid = styles.getPropertyValue('--border').trim();
        const elevated = styles.getPropertyValue('--bg-elevated').trim();
        const textPrimary = styles.getPropertyValue('--text-primary').trim();
        for (const [name, points] of Object.entries(trend.series)) {
            const wrap = el('div', { class: 'chart-wrap' }, [
                el('h3', {}, [name]),
                el('div', { class: 'chart-canvas-wrap' }, [el('canvas', {})]),
            ]);
            root.appendChild(wrap);
            const chart = new window.Chart(wrap.querySelector('canvas'), {
                type: 'line',
                data: {
                    labels: points.map(p => p.date),
                    datasets: [{
                        label: name,
                        data: points.map(p => p.value),
                        borderColor: color,
                        backgroundColor: color + '1A',
                        pointRadius: 4,
                        pointHoverRadius: 5,
                        pointHitRadius: 12,
                        pointBackgroundColor: color,
                        borderWidth: 2,
                        borderCapStyle: 'round',
                        borderJoinStyle: 'round',
                        tension: 0.3,
                        fill: true,
                    }],
                },
                options: {
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
                        x: { ticks: { color: textCol }, grid: { display: false } },
                        y: { ticks: { color: textCol }, grid: { color: grid }, beginAtZero: false },
                    },
                },
            });
            charts.set('trend_' + name, chart);
        }
    }
}

function rangeTag(marker) {
    if (marker.ref_low == null && marker.ref_high == null) return null;
    const inRange = (marker.ref_low == null || marker.value >= marker.ref_low) &&
                     (marker.ref_high == null || marker.value <= marker.ref_high);
    return el('span', { class: 'range-tag ' + (inRange ? 'in-range' : 'out-range') }, [inRange ? 'norma' : 'poza normą']);
}

function openPanel(panel, rootForRefresh) {
    const overlay = el('div', {
        class: 'modal-overlay',
        onClick: (e) => { if (e.target === overlay) overlay.remove(); },
    });
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', { style: { marginBottom: '4px' } }, [fmtDate(panel.date)]));
    if (panel.lab_name) card.appendChild(el('p', { class: 'hint', style: { marginBottom: '12px' } }, [panel.lab_name]));

    const list = el('ul', { class: 'list' });
    for (const m of panel.markers) {
        const range = (m.ref_low != null || m.ref_high != null)
            ? `${m.ref_low ?? '–'}–${m.ref_high ?? '–'} ${m.unit || ''}`
            : (m.unit || '');
        list.appendChild(el('li', { class: 'list-item' }, [
            el('div', { class: 'grow' }, [
                el('div', {}, [m.name]),
                el('div', { class: 'meta' }, [`${trimFloat(m.value)} ${m.unit || ''} · norma ${range}`]),
            ]),
            rangeTag(m),
        ]));
    }
    card.appendChild(list);

    card.appendChild(el('div', { class: 'row', style: { marginTop: '16px' } }, [
        el('button', { class: 'btn btn-ghost grow', onClick: () => overlay.remove() }, ['Zamknij']),
        el('button', {
            class: 'btn-danger btn grow',
            onClick: async () => {
                if (!await confirmDialog('Usunąć ten panel?')) return;
                try { await api.deleteBloodPanel(panel.id); toast('Usunięto', 'success'); overlay.remove(); renderBlood(rootForRefresh); }
                catch (err) { reportError(err); }
            },
        }, ['Usuń']),
    ]));

    overlay.appendChild(card);
    document.body.appendChild(overlay);
}
