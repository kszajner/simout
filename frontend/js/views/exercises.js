import { api } from '../api.js';
import { el, clear, toast, reportError, confirmDialog, emptyState } from '../ui.js';

export async function renderExercises(root) {
    clear(root);

    const newName = el('input', { class: 'input', placeholder: 'Nowe ćwiczenie (np. Wyciskanie sztangi)' });
    root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [newName]),
            el('button', { class: 'btn btn-primary', onClick: async () => {
                const n = newName.value.trim();
                if (!n) return;
                try { await api.createExercise(n); newName.value = ''; toast('Dodano', 'success'); renderExercises(root); }
                catch (err) { reportError(err); }
            } }, ['Dodaj']),
        ]),
    ]));

    let exs = [];
    try { exs = await api.listExercises(); } catch (err) { reportError(err); return; }
    if (!exs.length) {
        root.appendChild(emptyState({ title: 'Twoja biblioteka', hint: 'Dodaj pierwsze ćwiczenie powyżej (np. Wyciskanie, Przysiad, Wiosłowanie).' }));
        return;
    }

    const list = el('ul', { class: 'list', style: { marginTop: '16px' } });
    for (const ex of exs) {
        const nameInput = el('input', {
            class: 'inline-edit',
            value: ex.name,
            onChange: async (e) => {
                const v = e.target.value.trim();
                if (!v || v === ex.name) { e.target.value = ex.name; return; }
                try { await api.renameExercise(ex.id, v); ex.name = v; toast('Zmieniono nazwę', 'success'); }
                catch (err) { reportError(err); e.target.value = ex.name; }
            },
        });
        list.appendChild(el('li', { class: 'list-item' }, [
            el('div', { class: 'grow' }, [nameInput]),
            el('button', {
                class: 'btn-danger btn btn-sm',
                onClick: async () => {
                    if (!await confirmDialog(`Usunąć „${ex.name}”?`)) return;
                    try { await api.deleteExercise(ex.id); toast('Usunięto', 'success'); renderExercises(root); }
                    catch (err) { reportError(err); }
                },
            }, ['Usuń']),
        ]));
    }
    root.appendChild(list);
}
