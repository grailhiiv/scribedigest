'use client';

import { useEffect, useRef } from 'react';
import { BookOpen } from 'lucide-react';

// Limit PDF work to one visible cover at a time.
let queue: Promise<void> = Promise.resolve();
let library: Promise<any> | undefined;
function loadLibrary() {
  const moduleUrl = '/reader/vendor/pdf.js';
  return library ??= import(/* webpackIgnore: true */ moduleUrl).then(pdfjs => {
    pdfjs.GlobalWorkerOptions.workerSrc = '/reader/vendor/pdf.worker.js';
    return pdfjs;
  });
}

export function BookCover({ id, version }: { id: string; version?: string }) {
  const container = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let task: { promise: Promise<any>; destroy: () => Promise<void> } | undefined;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      queue = queue.catch(() => {}).then(async () => {
        if (cancelled) return;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const pdfjs = await loadLibrary();
          if (cancelled) return;
          task = pdfjs.getDocument({
            url: `/api/books/${id}/pdf?v=${encodeURIComponent(version || 'original')}`,
            isEvalSupported: false, disableAutoFetch: true, disableStream: true,
            standardFontDataUrl: '/reader/vendor/standard_fonts/',
            cMapUrl: '/reader/vendor/cmaps/', cMapPacked: true,
            wasmUrl: '/reader/vendor/wasm/',
          });
          timeout = setTimeout(() => { void task?.destroy().catch(() => {}); }, 30000);
          const pdf = await task!.promise;
          const page = await pdf.getPage(1);
          if (cancelled || !canvas.current) return;
          const viewport = page.getViewport({ scale: 160 / page.getViewport({ scale: 1 }).width });
          const target = canvas.current;
          const context = target.getContext('2d');
          if (!context) return;
          target.width = Math.ceil(viewport.width);
          target.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) target.style.opacity = '1';
        } catch {
          // Keep the placeholder if the PDF cannot be rendered.
        } finally {
          if (timeout) clearTimeout(timeout);
          await task?.destroy().catch(() => {});
        }
      });
    }, { rootMargin: '100px' });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); void task?.destroy().catch(() => {}); };
  }, [id, version]);

  return <span ref={container} aria-hidden="true" className="relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 text-slate-400"><BookOpen className="size-5" /><canvas ref={canvas} className="absolute inset-0 h-full w-full object-contain opacity-0" /></span>;
}
