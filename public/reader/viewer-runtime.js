import * as pdfjs from './vendor/pdf.js';
import { spreadStart, spreadPages, adjacentSpread, coverOffset, interpolateOffset, renderWidth, safeLink, linkBox } from './viewer-model.js?v=1.4.0';

import { cachedPage, storePage } from './viewer-cache.js?v=1.3.0';

const vendor = new URL('./vendor/', import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.js', vendor).href;

export async function mount(root) {
    if (root.dataset.mounted) return;
    root.dataset.mounted = '1';
    root.dataset.state = 'loading';
    const find = selector => root.querySelector(selector);
    const stage = find('.sfb-stage');
    const bookElement = find('.sfb-book');
    const number = find('.sfb-page-number');
    const range = find('.sfb-range');
    const thumbs = find('.sfb-thumbnails');
    const compactReader = () => matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches;
    const thumbnailButtons = [];
    const previous = find('[data-action="previous"]');
    const next = find('[data-action="next"]');
    const lifecycle = new AbortController();
    const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: lifecycle.signal });
    const pages = [], pending = new Map(), rendered = new Map();
    const pageLinks = new Map();
    let book, pdf, loading, resize, thumbnailObserver, current = 0, busy = false;
    let viewPending = false, viewRecorded = false, navigating = false;
    let motionFrame = 0, motionStart = null, pointer = null, destroyed = false;
    let navigationPages = [], zoomed = false, zoomScale = 1, activeIndex = null, chromeTimer, pan = null;
    let markedPages = [], markedRow = null, highlightedRow = null;
    let audioContext, swooshBuffer, soundArmed = false, soundTimer;
    function unlockSound() {
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            audioContext ||= new Audio();
            if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
        } catch { /* Audio is optional and must never interrupt reading. */ }
    }
    function armSound() {
        soundArmed = true;
        clearTimeout(soundTimer);
        soundTimer = setTimeout(() => { soundArmed = false; }, 3000);
    }
    function playFlipSound() {
        try {
            if (!audioContext || audioContext.state !== 'running') return;
            if (!swooshBuffer) {
                swooshBuffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.40), audioContext.sampleRate);
                const samples = swooshBuffer.getChannelData(0);
                let texture = 0;
                for (let i = 0; i < samples.length; i++) {
                    if (i % 160 === 0) texture = 0.55 + Math.random() * 0.45;
                    samples[i] = (Math.random() * 2 - 1) * texture;
                }
            }
            const source = audioContext.createBufferSource();
            const filter = audioContext.createBiquadFilter();
            const gain = audioContext.createGain();
            const now = audioContext.currentTime;
            source.buffer = swooshBuffer;
            filter.type = 'bandpass'; filter.Q.value = 0.45;
            filter.frequency.setValueAtTime(1400, now);
            filter.frequency.exponentialRampToValueAtTime(2600, now + 0.16);
            filter.frequency.exponentialRampToValueAtTime(1100, now + 0.40);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.035, now + 0.09);
            gain.gain.exponentialRampToValueAtTime(0.025, now + 0.20);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);
            source.connect(filter); filter.connect(gain); gain.connect(audioContext.destination);
            source.start(now); source.stop(now + 0.40);
        } catch { /* Sound availability varies by browser and device. */ }
    }
    listen(root, 'pointerdown', unlockSound, { capture: true });
    listen(root, 'keydown', unlockSound, { capture: true });
    const started = performance.now();
    const metrics = { rasterized: 0, cacheHits: 0, encodedBytes: 0 };
    const publishMetrics = () => { root.dataset.renderStats = JSON.stringify(metrics); };
    let pageRatio = 1.38, zoomPortrait = false, textGeneration = 0;
    const desiredWidth = () => {
        const style = getComputedStyle(stage);
        const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const immersive = document.body.classList.contains('sfb-reader') || document.fullscreenElement === root;
        const height = (immersive ? find('.sfb-body').clientHeight : stage.clientHeight) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const initialWidth = Math.min(width < 840 ? width : width / 2, height / pageRatio);
        return renderWidth(book ? book.getBoundsRect().pageWidth : initialWidth, Math.max(1.5, window.devicePixelRatio || 1));
    };
    const landscape = () => book.getOrientation() === 'landscape';
    const visible = () => spreadPages(current, pdf.numPages, landscape());
    const report = (message, quiet = false) => {
        const status = find('.sfb-status');
        status.textContent = message;
        status.classList.toggle('sfb-visually-hidden', quiet);
    };
    const fail = error => {
        root.dataset.state = 'error';
        find('.sfb-error-fallback').hidden = false;
        previous.disabled = next.disabled = number.disabled = range.disabled = true;
        console.error('Scribe Flipbook:', error);
        report(error?.name === 'PasswordException' ? 'This PDF is password protected. Please upload an unlocked PDF.' : 'Unable to display this PDF. Check the file and reload the page.');
    };

    async function recordView() {
        if (viewPending || viewRecorded || destroyed) return;
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

    function trimCache() {
        // Never evict artwork while it is being folded or used by a temporary copy.
        if (book && book.getState() !== 'read') return;
        const protectedPages = new Set([...nearby(), ...navigationPages]);
        for (const index of pending.keys()) protectedPages.add(index);
        for (const index of [...rendered.keys()].sort((a, b) => Math.abs(b - current) - Math.abs(a - current))) {
            if (rendered.size <= 10 && [...rendered.values()].reduce((sum, entry) => sum + entry.pixels * 4, 0) <= 64 * 1024 * 1024) break;
            if (protectedPages.has(index)) continue;
            const old = rendered.get(index);
            pages[index].replaceChildren();
            URL.revokeObjectURL(old.url);
            rendered.delete(index);
        }
    }

    async function drain() {
        if (busy) return;
        busy = true;
        try {
            while (pending.size && !destroyed) {
                // A requested spread overtakes speculative neighbors after the active job.
                const [index, request] = [...pending.entries()].sort((a, b) => b[1].priority - a[1].priority)[0];
                activeIndex = index;
                let page;
                try {
                    const width = desiredWidth();
                    const key = `${pdf.fingerprints.join(':')}:${index}:${width}:webp94`;
                    let blob = await Promise.race([cachedPage(key), new Promise(resolve => setTimeout(() => resolve(null), 250))]);
                    let pixels = width * width * 1.4;
                    if (blob) metrics.cacheHits++;
                    else {
                        page = await pdf.getPage(index + 1);
                        const base = page.getViewport({ scale: 1 });
                        const viewport = page.getViewport({ scale: Math.min(width / base.width, 3200 / base.height) });
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                        pixels = canvas.width * canvas.height;
                        await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
                        // Decoded images survive soft-page cloning. WebP avoids PNG encoding cost.
                        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.94));
                        canvas.width = canvas.height = 0;
                        if (!blob) throw new Error('Unable to create page image');
                        metrics.rasterized++; metrics.encodedBytes += blob.size;
                        void storePage(key, blob);
                    }
                    const url = URL.createObjectURL(blob);
                    const image = new Image();
                    image.alt = `Page ${index + 1}`;
                    image.draggable = false;
                    image.src = url;
                    try { await image.decode(); }
                    catch (error) { URL.revokeObjectURL(url); throw error; }
                    if (destroyed) { URL.revokeObjectURL(url); throw new Error('Reader closed'); }
                    // Never swap the image underneath a live folded copy.
                    while (!destroyed && book && book.getState() !== 'read') await new Promise(resolve => setTimeout(resolve, 40));
                    if (destroyed) { URL.revokeObjectURL(url); throw new Error('Reader closed'); }
                    const old = rendered.get(index);
                    pages[index].replaceChildren(image);
                    rendered.set(index, { image, url, width, pixels });
                    void addPageLinks(index);
                    if (old) URL.revokeObjectURL(old.url);
                    if (index === 0 && !metrics.firstPageMs) metrics.firstPageMs = Math.round(performance.now() - started);
                    publishMetrics();
                    request.resolve();
                } catch (error) { request.reject(error); }
                finally { page?.cleanup(); pending.delete(index); activeIndex = null; }
            }
        } finally { busy = false; trimCache(); }
    }

    function ensure(indices, priority = 1) {
        return Promise.all(indices.map(index => {
            if (rendered.has(index) && rendered.get(index).width >= desiredWidth()) return Promise.resolve();
            if (!pending.has(index)) {
                let resolve, reject;
                const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
                pending.set(index, { promise, resolve, reject, priority });
            }
            pending.get(index).priority = Math.max(pending.get(index).priority, priority);
            return pending.get(index).promise.then(() => {
                // A resize/zoom may have happened while this raster job was running.
                if (!destroyed && (priority > 0 || nearby().includes(index)) && rendered.get(index)?.width < desiredWidth()) return prepare([index], priority);
            });
        }));
    }

    function prepare(indices, priority = 1) {
        if (priority === 2) {
            for (const [index, request] of pending) {
                if (index !== activeIndex && request.priority === 0 && !indices.includes(index)) {
                    pending.delete(index); request.reject(new Error('Speculative render superseded'));
                }
            }
        }
        const promise = ensure(indices, priority);
        void drain();
        return promise;
    }

    function nearby() {
        if (!pdf) return [];
        if (zoomed && book) return visible();
        const wide = book ? landscape() : true;
        return [...new Set([
            ...spreadPages(current, pdf.numPages, wide),
            ...spreadPages(adjacentSpread(current, pdf.numPages, wide, 1), pdf.numPages, wide),
            ...spreadPages(adjacentSpread(current, pdf.numPages, wide, -1), pdf.numPages, wide),
            ...(desiredWidth() <= 1024 ? spreadPages(adjacentSpread(adjacentSpread(current, pdf.numPages, wide, 1), pdf.numPages, wide, 1), pdf.numPages, wide) : []),
        ])];
    }

    async function addPageLinks(index) {
        try {
            if (!pageLinks.has(index)) pageLinks.set(index, (async () => {
                const page = await pdf.getPage(index + 1);
                const viewport = page.getViewport({ scale: 1 });
                return (await page.getAnnotations({ intent: 'display' })).filter(item => item.subtype === 'Link' && item.rect).map(item => ({
                    url: item.url ? safeLink(item.url, root.dataset.pdf) : null, dest: item.dest,
                    box: linkBox([...viewport.convertToViewportPoint(item.rect[0], item.rect[1]), ...viewport.convertToViewportPoint(item.rect[2], item.rect[3])], viewport.width, viewport.height, pageRatio),
                })).filter(item => item.box && (item.url || item.dest));
            })());
            const links = await pageLinks.get(index);
            if (destroyed || !rendered.has(index)) return;
            pages[index].querySelector('.sfb-link-layer')?.remove();
            const layer = document.createElement('div'); layer.className = 'sfb-link-layer';
            links.forEach((item, position) => {
                const anchor = document.createElement('a'); anchor.className = 'sfb-pdf-link';
                anchor.dataset.page = String(index); anchor.dataset.link = String(position);
                for (const [key, value] of Object.entries(item.box)) anchor.style[key] = `${value}%`;
                anchor.href = item.url || '#';
                anchor.setAttribute('aria-label', item.url ? `Open ${item.url}` : 'Go to linked page');
                if (item.url) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
                layer.append(anchor);
            });
            if (links.length) pages[index].append(layer);
        } catch { pageLinks.delete(index); /* A malformed annotation must not prevent reading. */ }
    }

    function centerCover() {
        if (!book) return;
        const width = book.getBoundsRect().pageWidth;
        let offset = coverOffset(current, pdf.numPages, landscape(), width);
        const calc = book.getFlipController().getCalculation();
        if (motionStart !== null && calc && landscape()) {
            const target = adjacentSpread(motionStart, pdf.numPages, true, calc.getDirection() === 0 ? 1 : -1);
            const from = coverOffset(motionStart, pdf.numPages, true, width);
            const to = coverOffset(target, pdf.numPages, true, width);
            const progress = Math.min(1, Math.max(0, calc.getFlippingProgress() / 100));
            offset = interpolateOffset(from, to, progress);
        }
        bookElement.style.transform = `translateX(${offset}px)`;
        // The paper stack follows the actual book edges, including lone covers.
        const bounds = book.getBoundsRect();
        const start = current === 0 && pdf.numPages > 1 ? bounds.pageWidth : 0;
        const single = visible().length === 1;
        bookElement.style.setProperty('--sfb-paper-left', `${bounds.left + (landscape() ? start : bounds.pageWidth)}px`);
        bookElement.style.setProperty('--sfb-paper-width', `${single ? bounds.pageWidth : bounds.width}px`);
        bookElement.style.setProperty('--sfb-paper-top', `${bounds.top}px`);
        bookElement.style.setProperty('--sfb-paper-height', `${bounds.height}px`);
        // Position desktop navigation beside the fitted page, not the viewport.
        const readingRect = find('.sfb-reading-area').getBoundingClientRect();
        const pageLeft = bookElement.getBoundingClientRect().left - readingRect.left + bounds.left + (landscape() ? start : bounds.pageWidth);
        const pageWidth = single ? bounds.pageWidth : bounds.width;
        const leftCount = current === 0 ? 0 : current;
        const rightCount = Math.max(0, pdf.numPages - visible().at(-1) - 1);
        const edgeLeft = Math.min(24, leftCount ? 8 + leftCount / pdf.numPages * 16 : 0);
        const edgeRight = Math.min(24, rightCount ? (single ? 15 : 8 + rightCount / pdf.numPages * 16) : 0);
        root.style.setProperty('--sfb-page-left', `${pageLeft - edgeLeft}px`);
        root.style.setProperty('--sfb-page-right', `${pageLeft + pageWidth + edgeRight}px`);
        const nextLeft = Math.max(0, Math.min(readingRect.width - 44, pageLeft + pageWidth + edgeRight + 24));
        root.style.setProperty('--sfb-desktop-tools-left', `${readingRect.left - root.getBoundingClientRect().left + nextLeft}px`);
        // Compact tools follow the fitted artwork, rather than the viewport corner.
        // Portrait phones can be width-limited even when the reader fills the screen.
        if (matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches && !zoomed) {
            const readerBounds = root.getBoundingClientRect();
            const pageTop = bookElement.getBoundingClientRect().top - readerBounds.top + bounds.top;
            root.style.setProperty('--sfb-tools-top', `${Math.max(0, pageTop - 44)}px`);
            root.style.setProperty('--sfb-controls-bottom', `${Math.max(0, readerBounds.height - pageTop - bounds.height - 41)}px`);
        }
        root.dataset.spread = single ? 'single' : 'double';
        bookElement.style.setProperty('--sfb-edge-left', `${edgeLeft}px`);
        bookElement.style.setProperty('--sfb-edge-right', `${edgeRight}px`);
    }

    function animateCenter() {
        centerCover();
        if (!destroyed && book.getState() !== 'read') motionFrame = requestAnimationFrame(animateCenter);
        else motionFrame = 0;
    }

    function controls() {
        const locked = navigating || root.dataset.state !== 'ready' || (root.dataset.turn && root.dataset.turn !== 'read');
        const atFirstPage = current === 0;
        const atLastPage = visible().at(-1) === pdf.numPages - 1;
        previous.toggleAttribute('data-at-boundary', atFirstPage);
        next.toggleAttribute('data-at-boundary', atLastPage);
        previous.disabled = locked || atFirstPage;
        next.disabled = locked || atLastPage;
        number.disabled = range.disabled = locked;
    }

    function sync() {
        current = book.getCurrentPageIndex();
        centerCover();
        number.value = range.value = String(current + 1);
        for (const index of markedPages) thumbnailButtons[index]?.removeAttribute('aria-current');
        markedPages = visible();
        for (const index of markedPages) thumbnailButtons[index]?.setAttribute('aria-current', 'page');
        const activeRow = thumbnailButtons[current]?.parentElement || null;
        if (markedRow !== activeRow) {
            markedRow?.removeAttribute('aria-current');
            activeRow?.setAttribute('aria-current', 'page');
            markedRow = activeRow;
        }
        const expected = current;
        void prepare(visible()).then(() => {
            if (destroyed || expected !== current) return;
            root.dataset.state = 'ready';
            find('.sfb-error-fallback').hidden = true;
            controls();
            // View analytics are not enabled in the standalone edition.
        }).catch(error => { if (!destroyed && expected === current) fail(error); });
        void prepare(nearby(), 0).catch(() => { /* A navigation request retries failed neighboring pages. */ });
        if (zoomed) void prepare(visible(), 2).then(selectableText).catch(() => {});
        followThumbnail();
        controls();
        const shown = visible().map(index => index + 1);
        report(`${shown.length > 1 ? 'Pages' : 'Page'} ${shown.join('–')} of ${pdf.numPages}`, true);
    }

    function followThumbnail(immediate = false) {
        if (thumbs.hidden) return;
        const row = thumbnailButtons[current].parentElement;
        if (highlightedRow !== row) {
            highlightedRow?.classList.remove('sfb-thumbnail-current');
            row.classList.add('sfb-thumbnail-current');
            highlightedRow = row;
        }
        const panelBounds = thumbs.getBoundingClientRect();
        const rowBounds = row.getBoundingClientRect();
        const headerHeight = find('.sfb-thumbnail-header').getBoundingClientRect().height;
        // Scroll only this panel; scrollIntoView can move an embedded host page.
        if (immediate || rowBounds.top < panelBounds.top + headerHeight + 16 || rowBounds.bottom > panelBounds.bottom - 16) {
            thumbs.scrollTo({ top: Math.max(0, thumbs.scrollTop + rowBounds.top - panelBounds.top - headerHeight - (thumbs.clientHeight - headerHeight - rowBounds.height) / 2),
                behavior: immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
    }

    async function go(value, animate = false) {
        const target = Number(value);
        if (!Number.isFinite(target) || navigating || pointer || book.getState() !== 'read') return;
        const index = Math.min(pdf.numPages, Math.max(1, Math.trunc(target))) - 1;
        const start = spreadStart(index, landscape());
        if (start === current) { number.value = range.value = String(current + 1); return; }
        navigating = true;
        navigationPages = spreadPages(index, pdf.numPages, landscape());
        controls();
        // Keep routine navigation out of layout: showing a status row here
        // would resize the stage and interrupt the animation it just started.
        report('Loading pages…', true);
        try {
            const requested = performance.now();
            // Decoded neighboring artwork can turn immediately; resolution upgrades
            // happen after the curl, rather than delaying a usable cached page.
            if (!navigationPages.every(index => rendered.has(index))) await prepare(navigationPages, 2);
            metrics.lastTurnWaitMs = Math.round(performance.now() - requested); publishMetrics();
            if (destroyed) return;
            // Jumping through thumbnails shows the selected spread immediately.
            if (animate) { armSound(); book.flip(index, 'bottom'); }
            else { book.turnToPage(index); sync(); }
        } catch (error) {
            report(`Page ${index + 1} could not be rendered. Try again or open the original PDF.`);
            find('.sfb-error-fallback').hidden = false;
            console.error('Scribe Flipbook page:', error);
        } finally { navigating = false; navigationPages = []; if (!destroyed) { controls(); trimCache(); } }
    }

    function turn(direction) {
        if (direction < 0 ? previous.disabled : next.disabled) return;
        void go(adjacentSpread(current, pdf.numPages, landscape(), direction) + 1, true);
    }

    async function selectableText() {
        const generation = ++textGeneration;
        for (const index of visible()) {
            let page;
            try {
                page = await pdf.getPage(index + 1);
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: book.getBoundsRect().pageWidth / base.width });
                const content = await page.getTextContent();
                if (!zoomed || destroyed || generation !== textGeneration) return;
                pages[index].querySelector('.sfb-text-layer')?.remove();
                const container = document.createElement('div');
                container.className = 'sfb-text-layer';
                container.style.setProperty('--total-scale-factor', viewport.scale);
                pages[index].append(container);
                await new pdfjs.TextLayer({ textContentSource: content, container, viewport }).render();
                if (!zoomed || destroyed || generation !== textGeneration) container.remove();
            } catch { /* Image remains readable when a PDF has no extractable text. */ }
            finally { page?.cleanup(); }
        }
    }

    function destroy() {
        destroyed = true;
        clearTimeout(soundTimer);
        if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
        clearTimeout(chromeTimer);
        lifecycle.abort(); resize?.disconnect(); thumbnailObserver?.disconnect();
        cancelAnimationFrame(motionFrame);
        for (const request of pending.values()) request.reject(new Error('Reader closed'));
        pending.clear();
        book?.destroy();
        for (const value of rendered.values()) URL.revokeObjectURL(value.url);
        rendered.clear();
        if (loading) void loading.destroy().catch(() => {});
    }

    try {
        loading = pdfjs.getDocument({ url: root.dataset.pdf,
            disableAutoFetch: true, disableStream: false, rangeChunkSize: 2 * 1024 * 1024,
            cMapUrl: new URL('cmaps/', vendor).href, cMapPacked: true,
            standardFontDataUrl: new URL('standard_fonts/', vendor).href,
            wasmUrl: new URL('wasm/', vendor).href, isEvalSupported: false });
        let loadingTimeout;
        try {
            pdf = await Promise.race([loading.promise, new Promise((resolve, reject) => {
                const resetTimeout = () => {
                    clearTimeout(loadingTimeout);
                    loadingTimeout = setTimeout(() => reject(new Error('PDF loading stalled')), 120000);
                };
                loading.onProgress = resetTimeout;
                resetTimeout();
            })]);
        } finally { clearTimeout(loadingTimeout); loading.onProgress = null; }
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        const ratio = viewport.height / viewport.width;
        pageRatio = ratio;
        thumbs.style.setProperty('--sfb-page-ratio', String(1 / ratio));
        for (let index = 0; index < pdf.numPages; index++) {
            const page = document.createElement('div');
            page.className = 'sfb-paper';
            page.textContent = `Page ${index + 1}`;
            pages.push(page);
            let row = thumbs.lastElementChild;
            if (index === 0 || index % 2 === 1) {
                row = document.createElement('button'); row.className = 'sfb-thumbnail-spread';
                row.type = 'button'; row.dataset.index = String(index);
                const end = index === 0 ? 1 : Math.min(index + 2, pdf.numPages);
                row.setAttribute('aria-label', end === index + 1 ? `Go to page ${end}` : `Go to pages ${index + 1}–${end}`);
                thumbs.append(row);
            }
            const thumb = document.createElement('span');
            thumb.className = 'sfb-thumbnail-page'; thumb.dataset.index = String(index);
            const preview = document.createElement('span'); preview.className = 'sfb-thumbnail-image';
            const label = document.createElement('span'); label.textContent = String(index + 1);
            thumb.append(preview, label); row.append(thumb); thumbnailButtons.push(thumb);
        }
        // Show the cover without waiting for two unseen full-resolution pages.
        await prepare([0], 2);
        book = new window.St.PageFlip(bookElement, {
            width: 420, height: Math.round(420 * ratio), size: 'stretch',
            minWidth: Math.min(420, bookElement.clientWidth), maxWidth: 900, minHeight: 1, maxHeight: 900 * ratio,
            showCover: true, usePortrait: true, autoSize: false,
            useMouseEvents: false, showPageCorners: false,
            flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 360,
            maxShadowOpacity: 0.32, drawShadow: true,
        });
        book.on('flip', event => {
            if (soundArmed && event.data !== current) {
                soundArmed = false;
                clearTimeout(soundTimer);
                playFlipSound();
            }
            sync();
        });
        book.on('changeOrientation', () => requestAnimationFrame(() => { if (!destroyed) sync(); }));
        book.on('changeState', event => {
            root.dataset.turn = event.data;
            if (event.data === 'read') {
                motionStart = null; centerCover();
                queueMicrotask(() => { if (!destroyed) { controls(); trimCache(); } });
            } else {
                if (motionStart === null) motionStart = current;
                if (!motionFrame) motionFrame = requestAnimationFrame(animateCenter);
                controls();
            }
        });
        book.loadFromHTML(pages);
        // showCover determines spread pairing but also forces rigid covers.
        // Keep that pairing while using the magazine's soft-paper curl throughout.
        for (let index = 0; index < pdf.numPages; index++) book.getPage(index).setDensity('soft');
        number.max = range.max = String(pdf.numPages);
        find('.sfb-count').textContent = `/ ${pdf.numPages}`;
        let fittedGeometry;
        const fit = () => {
            if (destroyed) return;
            find('.sfb-reading-area').inert = !thumbs.hidden && compactReader();
            const immersive = document.body.classList.contains('sfb-reader') || document.fullscreenElement === root;
            const available = immersive ? find('.sfb-body').clientHeight : Math.min(760, Math.max(240, window.innerHeight * 0.78));
            const padding = getComputedStyle(stage).padding;
            const geometry = `${find('.sfb-reading-area').clientWidth}:${available}:${padding}:${zoomed}:${zoomScale}:${zoomPortrait}`;
            if (geometry === fittedGeometry) return;
            fittedGeometry = geometry;
            if (book.getState() !== 'read') {
                pointer = null;
                book.getFlipController().stopMove();
                book.getRender().finishAnimation();
            }
            // Stage owns padding; PageFlip measures the inner book, not the outer stage.
            stage.style.height = `${Math.max(100, available) * zoomScale}px`;
            stage.style.width = `${zoomScale * 100}%`;
            const innerWidth = stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) - parseFloat(getComputedStyle(stage).paddingRight);
            book.getSettings().maxWidth = 900 * zoomScale;
            book.getSettings().maxHeight = 900 * zoomScale * ratio;
            book.getSettings().minWidth = zoomed && zoomPortrait ? innerWidth / 2 + 1 : Math.min(420, innerWidth);
            book.update(); centerCover();
            // Resize and zoom upgrade visible artwork; small changes reuse resolution buckets.
            void prepare(visible(), 2).then(() => { if (zoomed) void selectableText(); }).catch(() => {});
            void prepare(nearby(), 0).catch(() => {});
        };
        resize = new ResizeObserver(fit);
        resize.observe(stage);
        resize.observe(find('.sfb-body'));
        listen(window, 'resize', fit);
        listen(document, 'fullscreenchange', fit);
        listen(number, 'change', () => void go(number.value));
        listen(number, 'keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); void go(number.value); }
        });
        listen(range, 'input', () => void go(range.value));
        listen(previous, 'click', () => turn(-1));
        listen(next, 'click', () => turn(1));
        const showTools = () => {
            root.classList.add('sfb-tools-visible');
            clearTimeout(chromeTimer);
            chromeTimer = setTimeout(() => root.classList.remove('sfb-tools-visible'), 2200);
        };
        listen(root, 'pointermove', showTools);
        listen(root, 'pointerdown', showTools);
        listen(root, 'keydown', showTools);
        listen(root, 'keydown', event => {
            if (find('.sfb-share-dialog').open) return;
            if (event.key === 'Escape') {
                if (!thumbs.hidden) toggleThumbnails(false);
                else if (!find('.sfb-zoom-controls').hidden) closeZoomControls();
                else if (zoomed) setZoom(100);
            }
            if (event.target.closest('input, button, a, textarea, select, [contenteditable="true"]')) return;
            if (zoomed && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                find('.sfb-reading-area').scrollBy({ left: event.key === 'ArrowLeft' ? -80 : event.key === 'ArrowRight' ? 80 : 0, top: event.key === 'ArrowUp' ? -80 : event.key === 'ArrowDown' ? 80 : 0 });
                return;
            }
            if (event.key === 'ArrowRight') { event.preventDefault(); turn(1); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); turn(-1); }
        });

        // Mouse and pen drag the zoomed viewport; touch keeps native scrolling.
        const readingArea = find('.sfb-reading-area');
        listen(readingArea, 'pointerdown', event => {
            if (!zoomed || event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary || event.shiftKey || event.target.closest('a,button,input,textarea,select,[contenteditable="true"]')) return;
            event.preventDefault();
            pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: readingArea.scrollLeft, top: readingArea.scrollTop };
            readingArea.setPointerCapture(event.pointerId);
            root.classList.add('sfb-panning');
        });
        listen(readingArea, 'pointermove', event => {
            if (!pan || pan.id !== event.pointerId) return;
            readingArea.scrollLeft = pan.left - (event.clientX - pan.x);
            readingArea.scrollTop = pan.top - (event.clientY - pan.y);
        });
        const endPan = event => {
            if (!pan || pan.id !== event.pointerId) return;
            pan = null;
            root.classList.remove('sfb-panning');
            if (readingArea.hasPointerCapture(event.pointerId)) readingArea.releasePointerCapture(event.pointerId);
        };
        listen(readingArea, 'pointerup', endPan);
        listen(readingArea, 'pointercancel', endPan);
        listen(readingArea, 'lostpointercapture', endPan);

        // Pointer capture keeps a held fold under the cursor outside the page.
        // One path handles mouse, pen and touch, including cancellation.
        const point = event => {
            const bounds = book.getUI().getDistElement().getBoundingClientRect();
            return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        };
        listen(bookElement, 'pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary || navigating || book.getState() !== 'read' || root.dataset.state !== 'ready') return;
            if (!event.target.closest('.sfb-paper')) return;
            if (event.target.closest('a,button,input')) return;
            if (zoomed) return;
            const pos = point(event), bounds = book.getBoundsRect();
            const back = landscape() ? pos.x < bounds.left + bounds.pageWidth : pos.x < bounds.left + bounds.pageWidth + bounds.width / 5;
            if (back ? previous.disabled : next.disabled) return;
            const target = adjacentSpread(current, pdf.numPages, landscape(), back ? -1 : 1);
            if (!spreadPages(target, pdf.numPages, landscape()).every(index => rendered.has(index))) {
                turn(back ? -1 : 1); return;
            }
            event.preventDefault();
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, start: pos, moved: false };
            bookElement.setPointerCapture(event.pointerId);
            book.getFlipController().fold(pos);
        });
        listen(bookElement, 'pointermove', event => {
            if (!pointer || pointer.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
            if (pointer.moved) book.getFlipController().fold(point(event));
        });
        const release = (event, cancel = false) => {
            if (!pointer || pointer.id !== event.pointerId) return;
            const held = pointer; pointer = null;
            if (bookElement.hasPointerCapture(event.pointerId)) bookElement.releasePointerCapture(event.pointerId);
            if (cancel) {
                // Move back to the grabbed edge, then let the library settle it.
                book.getFlipController().fold(held.start);
                book.getFlipController().stopMove();
            } else {
                armSound();
                if (!held.moved) book.getFlipController().flip(held.start);
                else book.getFlipController().stopMove();
            }
        };
        listen(bookElement, 'pointerup', event => release(event));
        listen(bookElement, 'pointercancel', event => release(event, true));
        listen(bookElement, 'lostpointercapture', event => release(event, true));
        listen(bookElement, 'dragstart', event => event.preventDefault());
        listen(bookElement, 'click', async event => {
            const anchor = event.target.closest('.sfb-pdf-link');
            if (!anchor || anchor.target === '_blank') return;
            event.preventDefault();
            try {
                const links = await pageLinks.get(Number(anchor.dataset.page));
                let dest = links?.[Number(anchor.dataset.link)]?.dest;
                if (typeof dest === 'string') dest = await pdf.getDestination(dest);
                if (!Array.isArray(dest)) return;
                const index = Number.isInteger(dest[0]) ? dest[0] : await pdf.getPageIndex(dest[0]);
                if (Number.isInteger(index) && index >= 0 && index < pdf.numPages) void go(index + 1);
            } catch { report('This PDF page link could not be opened.'); }
        });

        listen(thumbs, 'click', event => {
            const button = event.target.closest('.sfb-thumbnail-spread');
            if (!button) return;
            if (compactReader()) toggleThumbnails(false);
            void go(Number(button.dataset.index) + 1);
        });
        // Render only nearby thumbnails, sequentially, to avoid hundreds of concurrent jobs.
        const thumbnailQueue = [];
        let thumbnailBusy = false;
        async function renderThumbnails() {
            if (thumbnailBusy) return;
            thumbnailBusy = true;
            try {
                while (thumbnailQueue.length && !destroyed) {
                    const button = thumbnailQueue.shift();
                    let page;
                    try {
                        // Yield thumbnail work to full-page navigation and prefetch.
                        while (!destroyed && (busy || pending.size)) await new Promise(resolve => setTimeout(resolve, 60));
                        if (destroyed) break;
                        const index = Number(button.dataset.index);
                        const full = rendered.get(index)?.image;
                        page = full ? null : await pdf.getPage(index + 1);
                        const base = full ? { width: full.naturalWidth, height: full.naturalHeight } : page.getViewport({ scale: 1 });
                        const small = { width: 130, height: 130 * base.height / base.width };
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.ceil(small.width); canvas.height = Math.ceil(small.height);
                        canvas.setAttribute('aria-hidden', 'true');
                        if (full) canvas.getContext('2d').drawImage(full, 0, 0, canvas.width, canvas.height);
                        else await page.render({ canvasContext: canvas.getContext('2d'), viewport: page.getViewport({ scale: 130 / base.width }) }).promise;
                        if (!destroyed) button.firstElementChild.replaceChildren(canvas);
                    } catch { /* Labels remain usable if a thumbnail fails. */ }
                    finally { page?.cleanup(); }
                }
            } finally { thumbnailBusy = false; }
        }
        thumbnailObserver = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                thumbnailObserver.unobserve(entry.target); thumbnailQueue.push(entry.target);
            }
            void renderThumbnails();
        }, { root: thumbs, rootMargin: '100px' });
        for (const button of thumbnailButtons) thumbnailObserver.observe(button);
        function toggleThumbnails(show) {
            thumbs.hidden = !show;
            root.classList.toggle('sfb-thumbnails-open', show);
            find('[data-action="thumbnails"]').setAttribute('aria-expanded', String(show));
            find('.sfb-thumbnail-backdrop').hidden = !show;
            fit();
            if (show) followThumbnail(true);
            if (compactReader()) {
                if (show) find('[data-action="close-thumbnails"]').focus({ preventScroll: true });
                else find('[data-action="thumbnails"]').focus({ preventScroll: true });
            }
        }
        listen(find('[data-action="thumbnails"]'), 'click', () => toggleThumbnails(thumbs.hidden));
        listen(find('[data-action="close-thumbnails"]'), 'click', () => toggleThumbnails(false));
        listen(find('.sfb-thumbnail-backdrop'), 'click', () => toggleThumbnails(false));
        const shareDialog = find('.sfb-share-dialog');
        const shareButton = find('[data-action="share"]');
        const shareUrl = new URL(window.location.href);
        const destinations = {
            facebook: ['https://www.facebook.com/sharer/sharer.php', 'u'],
            x: ['https://twitter.com/intent/tweet', 'url'],
            linkedin: ['https://www.linkedin.com/sharing/share-offsite/', 'url'],
        };
        for (const [name, [base, parameter]] of Object.entries(destinations)) {
            const target = new URL(base);
            target.searchParams.set(parameter, shareUrl.href);
            find(`[data-share="${name}"]`).href = target.href;
        }
        listen(shareButton, 'click', () => {
            find('.sfb-share-message').textContent = '';
            shareDialog.showModal();
        });
        listen(find('[data-action="copy-share"]'), 'click', async () => {
            try {
                await navigator.clipboard.writeText(find('.sfb-share-url').value);
                find('.sfb-share-message').textContent = 'Link copied.';
            } catch {
                find('.sfb-share-url').select();
                find('.sfb-share-message').textContent = 'Select and copy the link above.';
            }
        });
        listen(find('[data-action="share-instagram"]'), 'click', async () => {
            if (navigator.share) {
                try {
                    find('.sfb-share-message').textContent = 'Choose Instagram if it is available in your share menu.';
                    await navigator.share({ title: root.getAttribute('aria-label') || 'Flipbook', url: shareUrl.href });
                    return;
                } catch (error) {
                    if (error.name === 'AbortError') return;
                }
            }
            try {
                await navigator.clipboard.writeText(shareUrl.href);
                find('.sfb-share-message').textContent = 'Link copied. Paste it into Instagram where links are supported.';
            } catch {
                find('.sfb-share-url').select();
                find('.sfb-share-message').textContent = 'Copy the selected link and paste it into Instagram where links are supported.';
            }
        });
        listen(find('[data-action="close-share"]'), 'click', () => shareDialog.close());
        listen(shareDialog, 'close', () => shareButton.focus({ preventScroll: true }));
        const fullscreen = find('[data-action="fullscreen"]');
        if (!root.requestFullscreen || !document.fullscreenEnabled) fullscreen.hidden = true;
        listen(fullscreen, 'click', async () => {
            try {
                if (document.fullscreenElement === root) await document.exitFullscreen();
                else await root.requestFullscreen();
            } catch { report('Fullscreen is unavailable in this browser.'); }
        });
        const zoomButton = find('[data-action="zoom"]');
        const zoomControls = find('.sfb-zoom-controls');
        const zoomRange = find('.sfb-zoom-range');
        function closeZoomControls() {
            setZoom(100);
            zoomControls.hidden = true;
            root.classList.remove('sfb-zoom-controls-open');
            zoomButton.setAttribute('aria-expanded', 'false');
            zoomButton.focus({ preventScroll: true });
        }
        function setZoom(value) {
            if (book.getState() !== 'read' || navigating) return;
            const level = Math.max(100, Math.min(300, Number(value)));
            const wasZoomed = zoomed;
            const centerX = (readingArea.scrollLeft + readingArea.clientWidth / 2) / readingArea.scrollWidth;
            const centerY = (readingArea.scrollTop + readingArea.clientHeight / 2) / readingArea.scrollHeight;
            if (!wasZoomed && level > 100) zoomPortrait = !landscape();
            zoomScale = level / 100;
            zoomed = level > 100;
            zoomRange.value = String(level);
            zoomRange.setAttribute('aria-valuetext', `${level}%`);
            find('[data-action="zoom-out"]').disabled = level === 100;
            find('[data-action="zoom-in"]').disabled = level === 300;
            textGeneration++;
            for (const layer of root.querySelectorAll('.sfb-text-layer')) layer.remove();
            root.classList.toggle('sfb-zoomed', zoomed);
            fit();
            if (zoomed) requestAnimationFrame(() => {
                if (!zoomed || destroyed) return;
                if (wasZoomed) {
                    readingArea.scrollTo({ left: centerX * readingArea.scrollWidth - readingArea.clientWidth / 2, top: centerY * readingArea.scrollHeight - readingArea.clientHeight / 2, behavior: 'instant' });
                    return;
                }
                const bounds = readingArea.getBoundingClientRect();
                const pageBounds = visible().map(index => pages[index].getBoundingClientRect()).filter(rect => rect.width && rect.height);
                if (!pageBounds.length) return;
                const left = Math.min(...pageBounds.map(rect => rect.left));
                const right = Math.max(...pageBounds.map(rect => rect.right));
                const top = Math.min(...pageBounds.map(rect => rect.top));
                const bottom = Math.max(...pageBounds.map(rect => rect.bottom));
                readingArea.scrollTo({ left: readingArea.scrollLeft + (left + right) / 2 - (bounds.left + bounds.width / 2), top: readingArea.scrollTop + (top + bottom) / 2 - (bounds.top + bounds.height / 2), behavior: 'instant' });
            });
            else { pan = null; root.classList.remove('sfb-panning'); readingArea.scrollTo(0, 0); }
        }
        listen(zoomButton, 'click', () => {
            zoomControls.hidden = false;
            root.classList.add('sfb-zoom-controls-open');
            zoomButton.setAttribute('aria-expanded', 'true');
            setZoom(matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches ? 140 : 200);
            zoomRange.focus({ preventScroll: true });
        });
        listen(zoomRange, 'input', () => setZoom(zoomRange.value));
        listen(find('[data-action="zoom-out"]'), 'click', () => setZoom(Number(zoomRange.value) - 10));
        listen(find('[data-action="zoom-in"]'), 'click', () => setZoom(Number(zoomRange.value) + 10));
        listen(find('[data-action="close-zoom"]'), 'click', closeZoomControls);
        find('[data-action="zoom-out"]').disabled = true;
        fit(); sync();
        listen(window, 'pagehide', event => { if (!event.persisted) destroy(); });
    } catch (error) { fail(error); destroy(); }
}
