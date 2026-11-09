// Optional local render cache. PDF fingerprint + resolution invalidate changed files.
// A failed/quota-blocked cache never prevents a page from being displayed.
const LIMIT = 32 * 1024 * 1024;
let database;
function open() {
    if (!database) database = new Promise(resolve => {
        if (!globalThis.indexedDB) { resolve(null); return; }
        const timer = setTimeout(() => resolve(null), 1000);
        const request = indexedDB.open('scribe-render-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('pages', { keyPath: 'key' });
        request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
        request.onerror = request.onblocked = () => { clearTimeout(timer); resolve(null); };
    });
    return database;
}

export async function cachedPage(key) {
    try {
        const db = await open();
        if (!db) return null;
        return await new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 1000);
            const request = db.transaction('pages').objectStore('pages').get(key);
            request.onsuccess = () => { clearTimeout(timer); resolve(request.result?.blob || null); };
            request.onerror = () => { clearTimeout(timer); resolve(null); };
        });
    } catch { return null; }
}

export async function storePage(key, blob) {
    try {
        const db = await open();
        if (!db || blob.size > LIMIT) return;
        await new Promise(resolve => {
            const transaction = db.transaction('pages', 'readwrite');
            const store = transaction.objectStore('pages');
            store.put({ key, blob, size: blob.size, time: Date.now() });
            const request = store.getAll();
            request.onsuccess = () => {
                const entries = request.result.sort((a, b) => a.time - b.time);
                let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
                for (const entry of entries) {
                    if (bytes <= LIMIT) break;
                    store.delete(entry.key); bytes -= entry.size;
                }
            };
            transaction.oncomplete = transaction.onerror = transaction.onabort = resolve;
        });
    } catch { /* Storage is optional, including private browsing/quota failures. */ }
}
