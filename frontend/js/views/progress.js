import { api } from '../api.js';
import { el, clear, reportError, fmtDate, trimFloat, emptyState } from '../ui.js';

const charts = new Map();

export async function renderProgress(root) {
    clear(root);
    for (const c of charts.values()) c.destroy();
    charts.clear();

    let exercises = [];
    try { exercises = await api.listExercises(); } catch (err) { reportError(err); return; }
    if (!exercises.length) {
        root.appendChild(emptyState({ title: 'Nic do pokazania', hint: 'Dodaj ćwiczenie i zapisz serię z obciążeniem, żeby zobaczyć je tutaj.' }));
        return;
    }

    // Fetch progress for every exercise in parallel
    const results = await Promise.all(exercises.map(async (e) => {
        try { return { exercise: e, data: await api.progress(e.id) }; }
        catch (err) { reportError(err); return { exercise: e, data: null }; }
    }));

    const withCharts = results.filter(r => r.data && (r.data.points || []).length > 0);
    const withSetsButNoChart = results.filter(r => r.data && (r.data.logged_sets || 0) > 0 && (r.data.points || []).length === 0);

    if (!withCharts.length && !withSetsButNoChart.length) {
        root.appendChild(emptyState({
            title: 'Cicha przystań',
            hint: 'Zapisz serię z obciążeniem podczas treningu, żeby zaczęły się tu pojawiać trendy.',
        }));
        return;
    }

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent-progress').trim() || '#8C7096';
    const textCol = styles.getPropertyValue('--text-secondary').trim() || '#9C9184';
    const grid = styles.getPropertyValue('--border').trim() || 'rgba(237,230,220,.09)';

    if (withCharts.length) {
        root.appendChild(el('div', { class: 'section-title' }, ['Trendy']));
    }
    for (const { exercise, data } of withCharts) {
        const wrap = el('div', { class: 'chart-wrap' });
        const headerRow = el('div', { class: 'row', style: { alignItems: 'baseline', marginBottom: '4px' } }, [
            el('h3', { class: 'grow' }, [exercise.name]),
        ]);
        if (data.pr) {
            headerRow.appendChild(el('span', { class: 'pr-inline' }, [
                el('span', { class: 'pr-inline-value' }, [`${trimFloat(data.pr.weight)} kg`]),
                el('span', { class: 'pr-inline-meta' }, [`× ${data.pr.reps ?? '–'}`]),
            ]));
        }
        wrap.appendChild(headerRow);
        wrap.appendChild(el('div', { class: 'chart-canvas-wrap' }, [el('canvas', {})]));

        if (data.pr) {
            wrap.appendChild(el('div', { class: 'pr-meta', style: { marginTop: '6px', fontSize: '12px', color: textCol } }, [
                `Rekord ustanowiony ${fmtDate(data.pr.date)}`,
            ]));
        }

        root.appendChild(wrap);

        const canvas = wrap.querySelector('canvas');
        const chart = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: data.points.map(p => p.date),
                datasets: [{
                    label: 'Max kg',
                    data: data.points.map(p => p.max_weight),
                    borderColor: accent,
                    backgroundColor: accent + '1A',
                    pointRadius: data.points.length > 45 ? 0 : 3,
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: styles.getPropertyValue('--bg-elevated').trim() || '#241F19',
                        titleColor: textCol,
                        bodyColor: styles.getPropertyValue('--text-primary').trim() || '#EDE6DC',
                        borderColor: grid,
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                    },
                },
                scales: {
                    x: { ticks: { color: textCol, maxTicksLimit: 6 }, grid: { display: false } },
                    y: { ticks: { color: textCol }, grid: { color: grid }, beginAtZero: false },
                },
            },
        });
        charts.set(exercise.id, chart);
    }

    if (withSetsButNoChart.length) {
        root.appendChild(el('div', { class: 'section-title' }, ['Bez obciążeń']));
        const list = el('ul', { class: 'list' });
        for (const { exercise, data } of withSetsButNoChart) {
            const total = data.logged_sets || 0;
            list.appendChild(el('li', { class: 'list-item' }, [
                el('div', { class: 'grow' }, [
                    el('div', {}, [exercise.name]),
                    el('div', { class: 'meta' }, [
                        `${total} seri${total === 1 ? 'a' : 'e'} zapisane · brak obciążeń`,
                    ]),
                ]),
            ]));
        }
        root.appendChild(list);
    }
}
