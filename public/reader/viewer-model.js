export function spreadStart(index, landscape) {
    return landscape && index > 0 ? index - (index + 1) % 2 : index;
}

export function spreadPages(index, count, landscape) {
    const start = spreadStart(index, landscape);
    return landscape && start > 0 && start + 1 < count ? [start, start + 1] : [start];
}

export function adjacentSpread(index, count, landscape, direction) {
    const start = spreadStart(index, landscape);
    if (direction < 0) return start === 0 ? 0 : Math.max(0, start - (landscape ? 2 : 1));
    return Math.min(count - 1, start + (landscape && start > 0 ? 2 : 1));
}

// PageFlip puts a lone back cover (including a one-page document) on the left.
export function coverOffset(index, count, landscape, width) {
    if (!landscape) return 0;
    if (index === count - 1 && (count === 1 || count % 2 === 0)) return width / 2;
    return index === 0 ? -width / 2 : 0;
}

// Ease centering at either end of the curl, including a cancelled drag.
export function interpolateOffset(from, to, progress) {
    const value = Math.min(1, Math.max(0, progress));
    return from + (to - from) * value * value * (3 - 2 * value);
}

// Quantized resolutions avoid rerendering for every small viewport change.
export function renderWidth(cssWidth, pixelRatio = 1) {
    return Math.min(2048, Math.max(512, Math.ceil(cssWidth * Math.min(2, pixelRatio) / 256) * 256));
}

export function safeLink(value, base) {
    try {
        const url = new URL(value, base);
        return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
}

// Map PDF viewport coordinates onto object-fit:contain artwork, including mixed-size pages.
export function linkBox(rect, width, height, pageRatio) {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || width <= 0 || height <= 0) return null;
    const x1 = Math.max(0, Math.min(width, Math.min(rect[0], rect[2])));
    const x2 = Math.max(0, Math.min(width, Math.max(rect[0], rect[2])));
    const y1 = Math.max(0, Math.min(height, Math.min(rect[1], rect[3])));
    const y2 = Math.max(0, Math.min(height, Math.max(rect[1], rect[3])));
    if (x2 <= x1 || y2 <= y1) return null;
    const fitWidth = Math.min(1, pageRatio / (height / width));
    const fitHeight = Math.min(1, (height / width) / pageRatio);
    return { left: ((1 - fitWidth) / 2 + x1 / width * fitWidth) * 100,
        top: ((1 - fitHeight) / 2 + y1 / height * fitHeight) * 100,
        width: (x2 - x1) / width * fitWidth * 100, height: (y2 - y1) / height * fitHeight * 100 };
}
