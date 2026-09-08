// All HTTP calls in one place. Throws ApiError on non-2xx.

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
    }
}

async function request(method, path, body) {
    const opts = { method, headers: {}, cache: 'no-store' };
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
        const detail = data && typeof data === 'object' && data.detail ? data.detail : (data || res.statusText);
        throw new ApiError(typeof detail === 'string' ? detail : 'Request failed', res.status, data);
    }
    return data;
}

const get = (p) => request('GET', p);
const post = (p, b) => request('POST', p, b ?? {});
const put = (p, b) => request('PUT', p, b ?? {});
const del = (p) => request('DELETE', p);

export const api = {
    // exercises
    listExercises: () => get('/api/exercises'),
    createExercise: (name) => post('/api/exercises', { name }),
    renameExercise: (id, name) => put(`/api/exercises/${id}`, { name }),
    deleteExercise: (id) => del(`/api/exercises/${id}`),
    lastSession: (exerciseId, beforeSessionId) => {
        const q = beforeSessionId ? `?before_session_id=${beforeSessionId}` : '';
        return get(`/api/exercises/${exerciseId}/last-session${q}`);
    },
    progress: (exerciseId) => get(`/api/exercises/${exerciseId}/progress`),

    // plans
    listPlans: () => get('/api/plans'),
    createPlan: (name) => post('/api/plans', { name }),
    renamePlan: (id, name) => put(`/api/plans/${id}`, { name }),
    deletePlan: (id) => del(`/api/plans/${id}`),

    // days
    listDays: (planId) => get(`/api/plans/${planId}/days`),
    createDay: (planId, name, order_index = 0) => post(`/api/plans/${planId}/days`, { name, order_index }),
    updateDay: (dayId, name, order_index = 0) => put(`/api/days/${dayId}`, { name, order_index }),
    deleteDay: (dayId) => del(`/api/days/${dayId}`),

    // day exercises (templates)
    listDayExercises: (dayId) => get(`/api/days/${dayId}/exercises`),
    addDayExercise: (dayId, payload) => post(`/api/days/${dayId}/exercises`, payload),
    updateDayExercise: (id, patch) => put(`/api/day-exercises/${id}`, patch),
    removeDayExercise: (id) => del(`/api/day-exercises/${id}`),

    // sessions
    listSessions: (limit = 20, offset = 0) => get(`/api/sessions?limit=${limit}&offset=${offset}`),
    activeSession: () => get('/api/sessions/active'),
    lastUsedDay: () => get('/api/sessions/last-day'),
    sessionDetail: (id) => get(`/api/sessions/${id}`),
    startSession: (training_day_id, dateStr) => post('/api/sessions', { training_day_id, date: dateStr }),
    finishSession: (id) => put(`/api/sessions/${id}/finish`),
    deleteSession: (id) => del(`/api/sessions/${id}`),

    // sets
    logSet: (sessionId, payload) => post(`/api/sessions/${sessionId}/sets`, payload),
    updateSet: (setId, patch) => put(`/api/sets/${setId}`, patch),
    deleteSet: (setId) => del(`/api/sets/${setId}`),

    // measurements
    listMeasurements: () => get('/api/measurements'),
    createMeasurement: (payload) => post('/api/measurements', payload),
    updateMeasurement: (id, payload) => put(`/api/measurements/${id}`, payload),
    deleteMeasurement: (id) => del(`/api/measurements/${id}`),
    measurementsChart: () => get('/api/measurements/chart'),

    // apple health
    healthStatus: () => get('/api/health/status'),
    healthActivityChart: (days = 90) => get(`/api/health/activity/chart?days=${days}`),
    healthHeartRateChart: (days = 90) => get(`/api/health/heart-rate/chart?days=${days}`),
    healthSleepChart: (nights = 30) => get(`/api/health/sleep/chart?nights=${nights}`),
    healthBodyCompositionChart: () => get('/api/health/body-composition/chart'),
    uploadHealthImport: async (file) => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/health/import', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new ApiError(data.detail || 'Upload failed', res.status, data);
        return data;
    },

    // blood
    listBloodPanels: () => get('/api/blood/panels'),
    createBloodPanel: (payload) => post('/api/blood/panels', payload),
    updateBloodPanel: (id, payload) => put(`/api/blood/panels/${id}`, payload),
    deleteBloodPanel: (id) => del(`/api/blood/panels/${id}`),
    bloodMarkersChart: () => get('/api/blood/markers/chart'),
};
