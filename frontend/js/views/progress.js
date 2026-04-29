import { api } from '../api.js';
import { el, clear, reportError, fmtDate, trimFloat, emptyState } from '../ui.js';

const charts = new Map();

export async function renderProgress(root) {
    clear(root);
    for (const c of charts.values()) c.destroy();
    charts.clear();

    root.appendChild(el('h2', { style: { marginBottom: '16px' } }, ['Progress']));

    let exercises = [];
    try { exercises = await api.listExercises(); } catch (err) { reportError(err); return; }
    if (!exercises.length) {
        root.appendChild(emptyState({ title: 'Nothing to chart', hint: 'Add an exercise and log a set with a weight to see it here.' }));
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
            title: 'Quiet waters',
            hint: 'Log a set with a weight during a workout to start seeing trends here.',
        }));
        return;
    }

    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#C8A96E';
    const textCol = styles.getPropertyValue('--text-secondary').trim() || '#7A6A52';
    const grid = styles.getPropertyValue('--border').trim() || '#E4DBC8';

    if (withCharts.length) {
        root.appendChild(el('div', { class: 'section-title' }, ['Trends']));
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
                `PR set on ${fmtDate(data.pr.date)}`,
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
                    backgroundColor: accent + '22',
                    pointBackgroundColor: accent,
                    pointRadius: 4,
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: textCol }, grid: { color: grid } },
                    y: { ticks: { color: textCol }, grid: { color: grid }, beginAtZero: false },
                },
            },
        });
        charts.set(exercise.id, chart);
    }

    if (withSetsButNoChart.length) {
        root.appendChild(el('div', { class: 'section-title' }, ['Awaiting weights']));
        const list = el('ul', { class: 'list' });
        for (const { exercise, data } of withSetsButNoChart) {
            const total = data.logged_sets || 0;
            list.appendChild(el('li', { class: 'list-item' }, [
                el('div', { class: 'grow' }, [
                    el('div', {}, [exercise.name]),
                    el('div', { class: 'meta' }, [
                        `${total} set${total === 1 ? '' : 's'} logged · no weights yet`,
                    ]),
                ]),
            ]));
        }
        root.appendChild(list);
    }
}
