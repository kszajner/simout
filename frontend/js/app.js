import { defineRoutes, startRouter, navigate } from './router.js';
import { setViewTitle, showBackButton, clear } from './ui.js';

import { renderHome } from './views/home.js';
import { renderPlans } from './views/plans.js';
import { renderWorkout } from './views/workout.js';
import { renderHistory } from './views/history.js';
import { renderProgress } from './views/progress.js';
import { renderMeasurements } from './views/measurements.js';
import { renderExercises } from './views/exercises.js';

const view = () => document.getElementById('view');

function before(navKey, title, withBack) {
    setViewTitle(title || '');
    showBackButton(withBack ? () => history.back() : null);
    document.querySelectorAll('.bottom-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.nav === navKey);
    });
    clear(view());
}

defineRoutes({
    '/':                 async ()       => { before('home', '', false);                 await renderHome(view()); },
    '/plans':            async ()       => { before('plans', 'plans', false);           await renderPlans(view()); },
    '/exercises':        async ()       => { before('plans', 'exercises', true);        await renderExercises(view()); },
    '/history':          async ()       => { before('home', 'history', true);           await renderHistory(view()); },
    '/progress':         async ()       => { before('progress', 'progress', false);     await renderProgress(view()); },
    '/measurements':     async ()       => { before('measurements', 'measurements', false); await renderMeasurements(view()); },
    '/workout/:id':      async (params) => { before('home', 'workout', true);           await renderWorkout(view(), Number(params.id)); },
    '/sessions/:id':     async (params) => { before('home', 'session', true);           await renderHistory(view(), Number(params.id)); },
}, async () => {
    before('home', '', false);
    view().innerHTML = '<div class="empty"><div class="empty-mark">…</div><p>Page not found.</p></div>';
});

startRouter();

// Re-dispatch after first hash navigation when app loads at non-root anchor
window.addEventListener('load', () => {
    if (!window.location.hash) navigate('/');
});
