(function () {
'use strict';
const root = document.querySelector('.sfb-library');
if (!root) return;
const assets = root.dataset.assets ? new URL(root.dataset.assets, document.baseURI) : new URL('.', document.currentScript.src);
let pdfLibrary;
function loadPDFLibrary() {
    if (!pdfLibrary) pdfLibrary = import(new URL('vendor/pdf.js', assets).href).then(pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.js', assets).href;
        return pdfjs;
    });
    return pdfLibrary;
}

const message = document.querySelector('#sfb-library-message');
function notify(text) {
    message.hidden = false;
    message.querySelector('p').textContent = text;
}
async function request(command, data = {}) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(root.dataset.endpoint, { method: 'POST', signal: controller.signal, body: new URLSearchParams({ action: 'scribe_library', nonce: root.dataset.nonce, command, ...data }) });
        const result = await response.json();
        if (!result.success) throw new Error(result.data?.message || 'Unable to save. Reload and try again.');
        return result.data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('The request timed out. Reload to check whether your change was saved.');
        throw error;
    } finally { clearTimeout(deadline); }
}
function choose(command, id) {
    const frame = wp.media({ title: command === 'replace' ? 'Replace flipbook PDF' : 'Add a flipbook PDF', library: { type: 'application/pdf' }, button: { text: command === 'replace' ? 'Replace PDF' : 'Create flipbook' }, multiple: false });
    frame.on('select', async () => {
        const pdf = frame.state().get('selection').first().toJSON();
        if (pdf.mime !== 'application/pdf') return;
        notify('Saving flipbook…');
        try { await request(command, { id: id || 0, pdf: pdf.id }); location.reload(); }
        catch (error) { notify(error.message); }
    });
    frame.open();
}
document.querySelector('#sfb-add').addEventListener('click', event => {
    if (!window.wp || typeof window.wp.media !== 'function') return;
    event.preventDefault();
    choose('create');
});
root.addEventListener('click', async event => {
    const button = event.target.closest('[data-command]');
    if (!button) return;
    const card = button.closest('.sfb-row');
    const id = card.dataset.id;
    if (button.dataset.command === 'replace') {
        if (!window.wp || typeof window.wp.media !== 'function') return;
        event.preventDefault();
        choose('replace', id); return;
    }
    if (button.dataset.command === 'toggle') {
        const active = button.checked;
        button.disabled = true;
        try {
            await request('toggle', { id, active: active ? '1' : '0' });
            card.querySelector('.sfb-active-label').textContent = active ? 'Active' : 'Inactive';
            notify(active ? 'Flipbook activated.' : 'Flipbook deactivated. Its reader and embeds are unavailable.');
        } catch (error) { button.checked = !active; notify(error.message); }
        finally { button.disabled = false; }
    }
});
// Inspect only visible rows, one document at a time, with a timeout. Opening
// the library must not fetch every issue or stall forever on one failed file.
async function inspect(card) {
    if (!card.dataset.pdf) { card.querySelector('.sfb-pages').textContent = 'No PDF'; return; }
    let task;
    let timeout;
    try {
        const pdfjs = await loadPDFLibrary();
        task = pdfjs.getDocument({ url: card.dataset.pdf, isEvalSupported: false,
            standardFontDataUrl: new URL('vendor/standard_fonts/', assets).href,
            cMapUrl: new URL('vendor/cmaps/', assets).href, cMapPacked: true,
            wasmUrl: new URL('vendor/wasm/', assets).href });
        timeout = setTimeout(() => void task.destroy().catch(() => {}), 30000);
        const pdf = await task.promise;
        card.querySelector('.sfb-pages').textContent = pdf.numPages.toLocaleString();
        if (!Number(card.dataset.pages)) {
            // Saving metadata can fail independently of a readable PDF.
            try { await request('pages', { id: card.dataset.id, pdf: card.dataset.pdfId, pages: pdf.numPages }); }
            catch (error) { notify(error.message); }
        }
        const page = await pdf.getPage(1);
        const size = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 110 / size.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${card.dataset.title} cover`);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        card.querySelector('.sfb-cover').replaceChildren(canvas);
    } catch (error) {
        card.querySelector('.sfb-pages').textContent = Number(card.dataset.pages) ? Number(card.dataset.pages).toLocaleString() : 'PDF unavailable';
        console.error('Unable to inspect flipbook PDF', error);
    } finally {
        clearTimeout(timeout);
        if (task) await task.destroy().catch(() => {});
    }
}
root.querySelectorAll('.sfb-shortcode').forEach(input => input.addEventListener('focus', () => input.select()));
const inspectionQueue = [];
let inspecting = false;
async function inspectQueue() {
    if (inspecting) return;
    inspecting = true;
    try { while (inspectionQueue.length) await inspect(inspectionQueue.shift()); }
    finally { inspecting = false; }
}
const visibleRows = new IntersectionObserver(entries => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        visibleRows.unobserve(entry.target);
        inspectionQueue.push(entry.target);
    }
    void inspectQueue();
}, { rootMargin: '100px' });
for (const card of root.querySelectorAll('.sfb-row')) visibleRows.observe(card);

})();
