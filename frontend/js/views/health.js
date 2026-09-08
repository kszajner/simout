import { api } from '../api.js';
import { el, clear, toast, reportError, emptyState } from '../ui.js';

const RANGES = [
    { key: '7d', label: '7D', days: 7 },
    { key: '30d', label: '30D', days: 30 },
    { key: '90d', label: '90D', days: 90 },
    { key: '1y', label: '1R', days: 365 },
];
const DEFAULT_RANGE = '30d';

const charts = new Map();

function destroyCharts() {
    for (const c of charts.values()) c.destroy();
    charts.clear();
}

function styleVars() {
    const s = getComputedStyle(document.documentElement);
    return {
        textCol: s.getPropertyValue('--text-secondary').trim() || '#9C9184',
        grid: s.getPropertyValue('--border').trim() || 'rgba(237,230,220,.09)',
        elevated: s.getPropertyValue('--bg-elevated').trim() || '#241F19',
        textPrimary: s.getPropertyValue('--text-primary').trim() || '#EDE6DC',
    };
}

function accentColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---- chart rendering: thin lines, hairline grid, index-mode tooltip (a
// pointer anywhere along X reveals every series at that date), sparse points.
function lineChart(canvas, key, labels, datasets) {
    const { textCol, grid, elevated, textPrimary } = styleVars();
    const chart = new window.Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: datasets.map(d => ({
                label: d.label,
                data: d.data,
                borderColor: d.color,
                backgroundColor: d.color + '1A',
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 12,
                pointBackgroundColor: d.color,
                borderWidth: 2,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.3,
                fill: d.fill !== false,
                spanGaps: true,
            })),
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: datasets.length > 1, position: 'bottom', labels: { color: textCol, boxWidth: 12, usePointStyle: true } },
                tooltip: {
                    backgroundColor: elevated,
                    titleColor: textCol,
                    bodyColor: textPrimary,
                    borderColor: grid,
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: datasets.length > 1,
                    boxPadding: 4,
                },
            },
            scales: {
                x: { ticks: { color: textCol, maxTicksLimit: 6 }, grid: { display: false } },
                y: { ticks: { color: textCol }, grid: { color: grid, drawTicks: false }, beginAtZero: false },
            },
        },
    });
    charts.set(key, chart);
}

function chartSection(root, title, key, labels, datasets) {
    const wrap = el('div', { class: 'chart-wrap' }, [
        el('h3', {}, [title]),
        el('div', { class: 'chart-canvas-wrap' }, [el('canvas', {})]),
    ]);
    root.appendChild(wrap);
    lineChart(wrap.querySelector('canvas'), key, labels, datasets);
}

function seriesToLabelsAndPoints(points) {
    return { labels: points.map(p => p.date), values: points.map(p => p.value) };
}

function daysAgoIso(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

function splitByCutoff(points, cutoffIso) {
    const current = points.filter(p => p.date >= cutoffIso);
    const previous = points.filter(p => p.date < cutoffIso);
    return { current, previous };
}

function avg(points) {
    if (!points.length) return null;
    return points.reduce((s, p) => s + p.value, 0) / points.length;
}

function sum(points) {
    return points.reduce((s, p) => s + p.value, 0);
}

function fmtNum(n, decimals = 0) {
    if (n == null) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

// tone: 'neutral' (just report direction) or 'lowerIsBetter' (down = good, colored)
function deltaLine(curAvg, prevAvg, tone = 'neutral') {
    if (curAvg == null || prevAvg == null || prevAvg === 0) return null;
    const pct = ((curAvg - prevAvg) / prevAvg) * 100;
    if (Math.abs(pct) < 1) return el('div', { class: 'stat-delta' }, ['bez zmian']);
    const up = pct > 0;
    const arrow = up ? '▲' : '▼';
    let cls = '';
    if (tone === 'lowerIsBetter') cls = up ? 'warn' : 'good';
    return el('div', { class: 'stat-delta' + (cls ? ' ' + cls : '') }, [`${arrow} ${Math.abs(pct).toFixed(0)}% vs poprzedni okres`]);
}

function statTile(label, value, deltaEl) {
    return el('div', { class: 'status-chip' }, [
        el('div', { class: 'status-value' }, [value]),
        el('div', { class: 'status-label' }, [label]),
        deltaEl,
    ]);
}

export async function renderHealth(root) {
    clear(root);
    destroyCharts();

    root.appendChild(el('div', { class: 'card' }, [
        el('h3', { style: { marginBottom: '8px' } }, ['Import Apple Health']),
        el('p', { class: 'hint', style: { marginBottom: '12px' } }, [
            'iPhone: Zdrowie → profil → Wyeksportuj wszystkie dane → udostępnij ten plik .zip tutaj.',
        ]),
        el('input', { type: 'file', accept: '.zip', id: 'health-file-input' }),
        el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, id: 'health-upload-btn' }, ['Importuj']),
        el('div', { id: 'health-upload-status', class: 'hint', style: { marginTop: '8px' } }),
    ]));

    document.getElementById('health-upload-btn').addEventListener('click', async () => {
        const input = document.getElementById('health-file-input');
        const file = input.files && input.files[0];
        if (!file) { toast('Wybierz plik .zip', 'error'); return; }
        const status = document.getElementById('health-upload-status');
        status.textContent = 'Importowanie — przy dużym eksporcie może to chwilę potrwać…';
        try {
            const summary = await api.uploadHealthImport(file);
            status.textContent = `Gotowe: ${summary.record_count.toLocaleString()} rekordów, ${summary.days_activity} dni aktywności.`;
            toast('Import zakończony', 'success');
            await renderBody(root, DEFAULT_RANGE);
        } catch (err) {
            reportError(err);
            status.textContent = '';
        }
    });

    await renderBody(root, DEFAULT_RANGE);
}

async function renderBody(root, rangeKey) {
    root.querySelectorAll('.range-row, .section-title, .chart-wrap, .stat-row, .empty').forEach(n => n.remove());
    destroyCharts();

    let status;
    try { status = await api.healthStatus(); } catch (err) { reportError(err); return; }

    if (!status || !status.imported) {
        root.appendChild(emptyState({ title: 'Brak danych', hint: 'Zaimportuj eksport z Apple Health, żeby zobaczyć wykresy.' }));
        return;
    }

    const range = RANGES.find(r => r.key === rangeKey) || RANGES.find(r => r.key === DEFAULT_RANGE);
    const rangeRow = el('div', { class: 'range-row' });
    rangeRow.style.setProperty('--range-accent', 'var(--accent-health)');
    for (const r of RANGES) {
        rangeRow.appendChild(el('button', {
            class: 'range-chip' + (r.key === range.key ? ' active' : ''),
            onClick: () => renderBody(root, r.key),
        }, [r.label]));
    }
    root.appendChild(rangeRow);

    const cutoff = daysAgoIso(range.days);

    const [activity, heartRate, sleep] = await Promise.all([
        api.healthActivityChart(range.days * 2).catch(() => null),
        api.healthHeartRateChart(range.days * 2).catch(() => null),
        api.healthSleepChart(range.days * 2).catch(() => null),
    ]);

    renderActivitySection(root, activity, cutoff);
    renderHeartRateSection(root, heartRate, cutoff);
    renderSleepSection(root, sleep, cutoff);
}

function renderActivitySection(root, activity, cutoff) {
    if (!activity || !activity.series.steps.length) return;
    const color = accentColor('--accent-health');

    const steps = splitByCutoff(activity.series.steps, cutoff);
    const kcal = splitByCutoff(activity.series.active_energy_kcal, cutoff);
    const dist = splitByCutoff(activity.series.distance_km, cutoff);

    root.appendChild(el('div', { class: 'section-title' }, ['Aktywność']));
    const row = el('div', { class: 'stat-row' });
    row.appendChild(statTile('kroki / dzień', fmtNum(avg(steps.current)), deltaLine(avg(steps.current), avg(steps.previous))));
    row.appendChild(statTile('kcal / dzień', fmtNum(avg(kcal.current)), deltaLine(avg(kcal.current), avg(kcal.previous))));
    row.appendChild(statTile('dystans (km)', fmtNum(sum(dist.current), 1), null));
    root.appendChild(row);

    const { labels, values } = seriesToLabelsAndPoints(steps.current);
    chartSection(root, 'Kroki', 'steps', labels, [{ label: 'Kroki', data: values, color }]);

    if (kcal.current.length) {
        const kc = seriesToLabelsAndPoints(kcal.current);
        chartSection(root, 'Kalorie aktywne', 'kcal', kc.labels, [{ label: 'kcal', data: kc.values, color }]);
    }
    if (dist.current.length) {
        const dc = seriesToLabelsAndPoints(dist.current);
        chartSection(root, 'Dystans', 'distance', dc.labels, [{ label: 'km', data: dc.values, color }]);
    }
}

function renderHeartRateSection(root, heartRate, cutoff) {
    if (!heartRate) return;
    const color = accentColor('--accent-workout');
    const secondary = accentColor('--text-hint');
    const avgSeries = heartRate.series.avg_bpm;
    const restingSeries = heartRate.series.resting_bpm;
    if (!avgSeries.length && !restingSeries.length) return;

    const avgSplit = splitByCutoff(avgSeries, cutoff);
    const restSplit = splitByCutoff(restingSeries, cutoff);

    root.appendChild(el('div', { class: 'section-title' }, ['Tętno']));
    const row = el('div', { class: 'stat-row' });
    if (restSplit.current.length) {
        row.appendChild(statTile('spoczynkowe (bpm)', fmtNum(avg(restSplit.current)), deltaLine(avg(restSplit.current), avg(restSplit.previous), 'lowerIsBetter')));
    }
    if (avgSplit.current.length) {
        row.appendChild(statTile('średnie w ciągu dnia', fmtNum(avg(avgSplit.current)), null));
    }
    if (row.children.length) root.appendChild(row);

    const labelSet = Array.from(new Set([...avgSplit.current.map(p => p.date), ...restSplit.current.map(p => p.date)])).sort();
    if (!labelSet.length) return;
    const avgByDate = Object.fromEntries(avgSplit.current.map(p => [p.date, p.value]));
    const restByDate = Object.fromEntries(restSplit.current.map(p => [p.date, p.value]));

    const datasets = [];
    if (avgSplit.current.length) datasets.push({ label: 'Średnie', data: labelSet.map(d => avgByDate[d] ?? null), color, fill: false });
    if (restSplit.current.length) datasets.push({ label: 'Spoczynkowe', data: labelSet.map(d => restByDate[d] ?? null), color: secondary, fill: false });

    chartSection(root, 'Tętno w czasie', 'hr', labelSet, datasets);
}

function renderSleepSection(root, sleep, cutoff) {
    if (!sleep || !sleep.series.asleep_hours.length) return;
    const color = accentColor('--accent-measurements');
    const split = splitByCutoff(sleep.series.asleep_hours, cutoff);
    if (!split.current.length) return;

    const poorNights = split.current.filter(p => p.value < 6).length;

    root.appendChild(el('div', { class: 'section-title' }, ['Sen']));
    const row = el('div', { class: 'stat-row' });
    row.appendChild(statTile('godzin / noc', fmtNum(avg(split.current), 1), deltaLine(avg(split.current), avg(split.previous))));
    row.appendChild(statTile('nocy z danymi', String(split.current.length), null));
    row.appendChild(statTile('nocy < 6h', String(poorNights), poorNights > 0 ? el('div', { class: 'stat-delta warn' }, ['niedobór snu']) : null));
    root.appendChild(row);

    const { labels, values } = seriesToLabelsAndPoints(split.current);
    chartSection(root, 'Sen w czasie', 'sleep', labels, [{ label: 'godziny', data: values, color }]);
}
