import * as pdfjs from './vendor/pdf.js';

const vendor = new URL('./vendor/', import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', vendor).href;

export async function mount(root) {
    if (root.dataset.mounted) return;
    root.dataset.mounted = '1';
    root.dataset.state = 'loading';
    const find = selector => root.querySelector(selector);
    const status = find('.sfb-status');
    const stage = find('.sfb-stage');
    const number = find('.sfb-page-number');
    const range = find('.sfb-range');
    const thumbs = find('.sfb-thumbnails');
    const previous = find('[data-action="previous"]');
    const next = find('[data-action="next"]');
    let book, pdf, loading, resize, thumbnailObserver, current = 0, busy = false, viewPending = false, viewRecorded = false;
    const lifecycle = new AbortController();
    const pages = [], pending = new Set(), rendered = new Map();
    const report = message => { status.textContent = message; };
    const fail = error => {
        root.dataset.state = 'error';
        find('.sfb-error-fallback').hidden = false;
        console.error('Scribe Flipbook:', error);
        report(error?.name === 'PasswordException' ? 'This PDF is password protected. Please upload an unlocked PDF.' : 'Unable to display this PDF. Check the file and reload the page.');
    };

    async function recordView() {
        if (viewPending || viewRecorded) return;
        const key = `scribe-view-${root.dataset.id}`;
        try { if (sessionStorage.getItem(key)) { viewRecorded = true; return; } } catch { /* Optional storage. */ }
        viewPending = true;
        try {
            const response = await fetch(root.dataset.endpoint, { method: 'POST', signal: lifecycle.signal, body: new URLSearchParams({ action: 'scribe_view', id: root.dataset.id, nonce: root.dataset.nonce }) });
            const result = await response.json();
            if (result.success) {
                viewRecorded = true;
                try { sessionStorage.setItem(key, '1'); } catch { /* Optional storage. */ }
            }
        } catch { /* Analytics failures must not interrupt reading. */ }
        finally { viewPending = false; }
    }

    // Render only the visible spread and nearby pages. Limit full-size canvases
    // so a long magazine does not allocate hundreds of page-sized bitmaps.
    async function drain() {
        if (busy) return;
        busy = true;
        try {
            while (pending.size && !lifecycle.signal.aborted) {
                const index = pending.values().next().value;
                pending.delete(index);
                if (rendered.has(index)) continue;
                try {
                    const page = await pdf.getPage(index + 1);
                    const base = page.getViewport({ scale: 1 });
                    const viewport = page.getViewport({ scale: Math.min(1600 / base.width, 2000 / base.height, 2) });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    canvas.setAttribute('role', 'img');
                    canvas.setAttribute('aria-label', `Page ${index + 1}`);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                    // PageFlip clones soft pages during turns; canvas.cloneNode()
                    // loses its bitmap. Images preserve the artwork in those clones.
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    canvas.width = canvas.height = 0;
                    if (!blob) throw new Error('Unable to create page image');
                    const url = URL.createObjectURL(blob);
                    const image = new Image();
                    image.alt = `Page ${index + 1}`;
                    image.src = url;
                    try { await image.decode(); }
                    catch (error) { URL.revokeObjectURL(url); throw error; }
                    if (lifecycle.signal.aborted) { URL.revokeObjectURL(url); break; }
                    pages[index].replaceChildren(image);
                    rendered.set(index, { image, url });
                    if (index === current) {
                        root.dataset.state = 'ready';
                        find('.sfb-error-fallback').hidden = true;
                    }
                    if (index === current) void recordView();
                    if (rendered.size > 10) {
                        const victim = [...rendered.keys()].sort((a, b) => Math.abs(b - current) - Math.abs(a - current))[0];
                        if (Math.abs(victim - current) > 3) {
                            const old = rendered.get(victim);
                            old.image.remove(); URL.revokeObjectURL(old.url);
                            pages[victim].textContent = `Page ${victim + 1}`;
                            rendered.delete(victim);
                        }
                    }
                    page.cleanup();
                    } catch (error) {
                    if (!lifecycle.signal.aborted) {
                        pages[index].textContent = `Page ${index + 1} could not be rendered.`;
                        if (index === current) fail(error);
                    }
                }
            }
        } catch (error) { fail(error); }
        finally { busy = false; }
    }

    function centerCover() {
        const offset = book.getOrientation() === 'landscape' && current === 0 ? -book.getBoundsRect().pageWidth / 2 : 0;
        find('.sfb-book').style.transform = `translateX(${offset}px)`;
    }

    function sync() {
        current = book.getCurrentPageIndex();
        centerCover();
        number.value = range.value = String(current + 1);
        previous.disabled = current === 0;
        next.disabled = current >= pdf.numPages - (book.getOrientation() === 'landscape' && current > 0 ? 2 : 1);
        for (const button of thumbs.children) {
            if (Number(button.dataset.index) === current) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        pending.clear();
        for (const offset of [0, 1, -1, 2, 3, -2]) {
            const index = current + offset;
            if (index >= 0 && index < pdf.numPages) pending.add(index);
        }
        void drain();
        if (rendered.has(current)) void recordView();
        report(`Page ${current + 1} of ${pdf.numPages}`);
    }

    function go(value) {
        const target = Number(value);
        if (!Number.isFinite(target)) return;
        book.turnToPage(Math.min(pdf.numPages, Math.max(1, Math.trunc(target))) - 1);
        sync();
    }

    try {
        loading = pdfjs.getDocument({
            url: root.dataset.pdf,
            cMapUrl: new URL('cmaps/', vendor).href, cMapPacked: true,
            standardFontDataUrl: new URL('standard_fonts/', vendor).href,
            wasmUrl: new URL('wasm/', vendor).href,
            isEvalSupported: false,
        });
        let loadingTimeout;
        try {
            pdf = await Promise.race([loading.promise, new Promise((resolve, reject) => {
                loadingTimeout = setTimeout(() => reject(new Error('PDF loading timed out')), 45000);
            })]);
        } finally { clearTimeout(loadingTimeout); }
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        const ratio = viewport.height / viewport.width;
        // All pages share the first page's paper size; mixed sizes are fitted.
        for (let index = 0; index < pdf.numPages; index++) {
            const page = document.createElement('div');
            page.className = 'sfb-paper';
            page.textContent = `Page ${index + 1}`;
            pages.push(page);
            const thumb = document.createElement('button');
            thumb.type = 'button'; thumb.dataset.index = String(index);
            thumb.setAttribute('aria-label', `Go to page ${index + 1}`);
            const label = document.createElement('span');
            label.textContent = String(index + 1);
            thumb.append(label); thumbs.append(thumb);
        }
        book = new window.St.PageFlip(find('.sfb-book'), {
            width: 420, height: Math.round(420 * ratio), size: 'stretch',
            minWidth: 320, maxWidth: 900, minHeight: 160 * ratio, maxHeight: 900 * ratio,
            showCover: true, usePortrait: true, autoSize: false,
            mobileScrollSupport: false, flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 650,
            maxShadowOpacity: 0.22, drawShadow: true,
        });
        book.on('flip', sync);
        book.on('changeOrientation', () => requestAnimationFrame(sync));
        book.loadFromHTML(pages);
        number.max = range.max = String(pdf.numPages);
        number.disabled = range.disabled = false;
        find('.sfb-count').textContent = `/ ${pdf.numPages}`;
        const fit = () => {
            const standalone = document.body.classList.contains('sfb-reader');
            const height = standalone || document.fullscreenElement === root ? Math.max(180, root.querySelector('.sfb-body').clientHeight) : Math.min(640, Math.max(240, window.innerHeight * 0.7));
            stage.style.height = `${Math.min(height, stage.clientWidth / (stage.clientWidth < 640 ? 1 : 2) * ratio)}px`;
            book.update();
            centerCover();
        };
        resize = new ResizeObserver(fit);
        resize.observe(stage);
        window.addEventListener('resize', fit, { signal: lifecycle.signal });
        document.addEventListener('fullscreenchange', fit, { signal: lifecycle.signal });
        number.addEventListener('change', () => go(number.value));
        range.addEventListener('input', () => go(range.value));
        previous.addEventListener('click', () => book.flipPrev());
        next.addEventListener('click', () => book.flipNext());
        root.addEventListener('keydown', event => {
            if (/INPUT|BUTTON|A/.test(event.target.tagName)) return;
            if (event.key === 'ArrowRight') { event.preventDefault(); book.flipNext(); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); book.flipPrev(); }
        });
        thumbs.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (button) go(Number(button.dataset.index) + 1);
        });
        const observer = thumbnailObserver = new IntersectionObserver(async entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                observer.unobserve(entry.target);
                try {
                    const page = await pdf.getPage(Number(entry.target.dataset.index) + 1);
                    const base = page.getViewport({ scale: 1 });
                    const small = page.getViewport({ scale: 100 / base.width });
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(small.width); canvas.height = Math.ceil(small.height);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport: small }).promise;
                    entry.target.prepend(canvas);
                } catch { /* Page labels remain usable if a thumbnail fails. */ }
            }
        }, { root: thumbs, rootMargin: '60px' });
        for (const button of thumbs.children) observer.observe(button);
        find('[data-action="thumbnails"]').addEventListener('click', event => {
            thumbs.hidden = !thumbs.hidden;
            event.currentTarget.setAttribute('aria-expanded', String(!thumbs.hidden));
        });
        const fullscreen = find('[data-action="fullscreen"]');
        if (!root.requestFullscreen || !document.fullscreenEnabled) fullscreen.hidden = true;
        fullscreen.addEventListener('click', async () => {
            try {
                if (document.fullscreenElement === root) await document.exitFullscreen();
                else await root.requestFullscreen();
            } catch { report('Fullscreen is unavailable in this browser.'); }
        });
        sync();
        window.addEventListener('pagehide', event => {
            if (event.persisted) return; // Preserve the back/forward cache viewer.
            lifecycle.abort(); resize.disconnect(); observer.disconnect();
            pending.clear(); book.destroy();
            for (const value of rendered.values()) URL.revokeObjectURL(value.url);
            rendered.clear();
            void loading.destroy().catch(() => {});
        }, { signal: lifecycle.signal });
    } catch (error) {
        fail(error);
        lifecycle.abort(); resize?.disconnect(); thumbnailObserver?.disconnect();
        if (loading) void loading.destroy().catch(() => {});
    }
}


