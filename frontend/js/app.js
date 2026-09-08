import { defineRoutes, startRouter, navigate } from './router.js';
import { setViewTitle, showBackButton, clear } from './ui.js';

import { renderHome } from './views/home.js';
import { renderPlans } from './views/plans.js';
import { renderWorkout } from './views/workout.js';
import { renderHistory } from './views/history.js';
import { renderProgress } from './views/progress.js';
import { renderMeasurements } from './views/measurements.js';
import { renderExercises } from './views/exercises.js';
import { renderHealth } from './views/health.js';
import { renderBlood } from './views/blood.js';

const view = () => document.getElementById('view');

function before(title, withBack) {
    setViewTitle(title || '');
    showBackButton(withBack ? () => history.back() : null);
    clear(view());
}

defineRoutes({
    '/':                 async ()       => { before('', false);                 await renderHome(view()); },
    '/plans':            async ()       => { before('plany', true);             await renderPlans(view()); },
    '/exercises':        async ()       => { before('ćwiczenia', true);         await renderExercises(view()); },
    '/history':          async ()       => { before('historia', true);         await renderHistory(view()); },
    '/progress':         async ()       => { before('postępy', true);          await renderProgress(view()); },
    '/measurements':     async ()       => { before('pomiary', true);          await renderMeasurements(view()); },
    '/health':            async ()       => { before('zdrowie', true);          await renderHealth(view()); },
    '/blood':             async ()       => { before('wyniki krwi', true);      await renderBlood(view()); },
    '/workout/:id':      async (params) => { before('trening', true);          await renderWorkout(view(), Number(params.id)); },
    '/sessions/:id':     async (params) => { before('sesja', true);            await renderHistory(view(), Number(params.id)); },
}, async () => {
    before('', false);
    view().innerHTML = '<div class="empty"><div class="empty-mark">…</div><p>Nie znaleziono strony.</p></div>';
});

startRouter();

// Re-dispatch after first hash navigation when app loads at non-root anchor
window.addEventListener('load', () => {
    if (!window.location.hash) navigate('/');
});
