// Simple hash router. Routes are { pattern: RegExp, handler: (params) => Promise<void> }

let routes = [];
let notFound = null;

export function defineRoutes(map, notFoundHandler) {
    routes = Object.entries(map).map(([pattern, handler]) => ({
        regex: patternToRegex(pattern),
        keys: extractKeys(pattern),
        handler,
    }));
    notFound = notFoundHandler;
}

function patternToRegex(pattern) {
    const re = pattern.replace(/:([a-zA-Z_]+)/g, '([^/]+)');
    return new RegExp('^' + re + '$');
}
function extractKeys(pattern) {
    return [...pattern.matchAll(/:([a-zA-Z_]+)/g)].map(m => m[1]);
}

function currentPath() {
    const h = window.location.hash || '#/';
    return h.slice(1) || '/';
}

export async function navigate(path) {
    if (!path.startsWith('/')) path = '/' + path;
    if (window.location.hash !== '#' + path) {
        window.location.hash = path;
    } else {
        await dispatch();
    }
}

async function dispatch() {
    const path = currentPath();
    for (const r of routes) {
        const m = path.match(r.regex);
        if (m) {
            const params = {};
            r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
            try {
                await r.handler(params);
            } catch (err) {
                console.error('Route handler error:', err);
            }
            return;
        }
    }
    if (notFound) await notFound();
}

export function startRouter() {
    window.addEventListener('hashchange', dispatch);
    window.addEventListener('DOMContentLoaded', dispatch, { once: true });
    if (document.readyState !== 'loading') dispatch();
}

export function getPath() { return currentPath(); }
