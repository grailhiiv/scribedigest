"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Code2, ExternalLink, GripVertical, LogOut, MoreHorizontal, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';
import { toast, Toaster } from '@/components/ui/toast';
import type { Book } from '@/lib/books';
import { BookCover } from './book-cover';

type Mode = 'upload' | 'rename' | 'embed' | 'replace' | 'delete' | null;

function Modal({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!busy) close(); }} aria-labelledby="dialog-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 text-slate-950 shadow-xl backdrop:bg-black/50">
    <div className="p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="dialog-title" className="text-xl font-semibold">{title}</h2></div><Button variant="ghost" size="icon-sm" type="button" aria-label="Close" onClick={close} disabled={busy}><X /></Button></div>{children}</div>
  </dialog>;
}
function formatFileSize(bytes?: number) {
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function escaped(value: string) { return value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!)); }

function uploadChunk(id: string, offset: number, chunk: Blob, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', `/api/uploads/${id}`);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.setRequestHeader('X-Upload-Offset', String(offset));
    request.upload.onprogress = event => onProgress(Math.min(event.loaded, chunk.size));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { resolve(); return; }
      let message = 'Upload failed.';
      try { message = JSON.parse(request.responseText).error || message; } catch { /* Keep the fallback message. */ }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    request.onabort = () => reject(new Error('Upload was interrupted.'));
    request.send(chunk);
  });
}

function UploadProgress({ progress, processing }: { progress: number; processing: boolean }) {
  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-4 text-sm font-medium"><span id="upload-progress-label">{processing ? 'Processing PDF…' : 'Uploading PDF'}</span><span aria-hidden="true">{progress}%</span></div>
    <Progress aria-labelledby="upload-progress-label" value={progress} />
  </div>;
}

export default function Dashboard({ books: initialBooks }: { books: Book[] }) {
  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<Book | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderMessage, setOrderMessage] = useState('');
  const [orderError, setOrderError] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const dragPreview = useRef<{ element: HTMLTableElement; x: number; y: number } | null>(null);
  useEffect(() => () => { dragPreview.current?.element.remove(); }, []);
  const filtered = books.filter(book => book.title.toLowerCase().includes(query.trim().toLowerCase()));
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const readerUrl = selected ? `${origin}/${selected.id}` : '';
  const embedCode = selected ? `<iframe src="${readerUrl}" title="${escaped(selected.title)}" width="100%" height="700" style="border:0;" allow="fullscreen" allowfullscreen loading="lazy"></iframe>` : '';
  async function moveBook(id: string, target: number) {
    if (orderSaving || query.trim()) return;
    const from = books.findIndex(book => book.id === id);
    if (from < 0 || target < 0 || target >= books.length || from === target) return;
    const before = books;
    const ordered = [...books];
    const [item] = ordered.splice(from, 1);
    ordered.splice(target, 0, item);
    setBooks(ordered); setOrderSaving(true); setOrderError(''); setOrderMessage('Saving order…');
    try {
      const response = await fetch('/api/books/order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ordered.map(book => book.id) }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Could not save the order.'); }
      setOrderMessage(`${item.title} moved to position ${target + 1} of ${ordered.length}.`);
    } catch (error) {
      setBooks(before);
      const message = error instanceof Error ? error.message : 'Could not save the order.';
      setOrderError(message); setOrderMessage(message);
    } finally { setOrderSaving(false); }
  }
  function startDragging(event: React.DragEvent<HTMLButtonElement>, id: string) {
    draggedId.current = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    const row = event.currentTarget.closest('tr');
    if (row) {
      // Keep a real, opaque row above the list while the native drag is active.
      const bounds = row.getBoundingClientRect();
      const preview = document.createElement('table');
      preview.className = 'text-left text-base';
      const copy = row.cloneNode(true) as HTMLTableRowElement;
      Array.from(copy.cells).forEach((cell, index) => {
        cell.style.width = `${row.cells[index].getBoundingClientRect().width}px`;
      });
      const originalCanvas = row.querySelector('canvas');
      const copiedCanvas = copy.querySelector('canvas');
      if (originalCanvas && copiedCanvas) copiedCanvas.getContext('2d')?.drawImage(originalCanvas, 0, 0);
      preview.append(document.createElement('tbody'));
      preview.tBodies[0].append(copy);
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;
      Object.assign(preview.style, { position: 'fixed', top: `${bounds.top}px`, left: `${bounds.left}px`, width: `${bounds.width}px`, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: '0', background: '#fff', boxShadow: '0 16px 36px rgba(15,23,42,.24), 0 3px 8px rgba(15,23,42,.12)', border: '1px solid #cbd5e1', borderRadius: '10px', transform: 'scale(1.01)', zIndex: '9999', pointerEvents: 'none' });
      document.body.append(preview);
      dragPreview.current = { element: preview, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      // The browser's translucent drag image would otherwise duplicate the row.
      const transparent = document.createElement('canvas');
      transparent.width = transparent.height = 1;
      event.dataTransfer.setDragImage(transparent, 0, 0);
    }
    setDragging(id);
  }
  function moveDragPreview(event: React.DragEvent) {
    if (!dragPreview.current || (!event.clientX && !event.clientY)) return;
    dragPreview.current.element.style.left = `${event.clientX - dragPreview.current.x}px`;
    dragPreview.current.element.style.top = `${event.clientY - dragPreview.current.y}px`;
  }
  function endDragging() { dragPreview.current?.element.remove(); dragPreview.current = null; draggedId.current = null; setDragging(null); setDropTarget(null); }
  function openUpload() { setTitle(''); setFile(null); setError(''); setFeedback(''); setMode('upload'); }
  function openBook(nextMode: 'rename' | 'embed' | 'replace' | 'delete', book: Book) { setSelected(book); setTitle(book.title); setFile(null); setError(''); setFeedback(''); setMode(nextMode); }
  function close() { if (!busy) { setMode(null); setError(''); setFeedback(''); } }
  async function copy(text: string, message: string) {
    try { await navigator.clipboard.writeText(text); setFeedback(message); }
    catch { setFeedback('Could not copy automatically. Select the code and copy it manually.'); }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!file) return;
    if (file.size > 300 * 1024 * 1024) { setError('PDF must be 300 MB or smaller.'); return; }
    setBusy(true); setError(''); setUploadProgress(0); setProcessing(false);
    let uploadId: string | undefined;
    try {
      const start = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'replace' && selected ? { replaceId: selected.id, size: file.size, filename: file.name } : { title, size: file.size, filename: file.name }) });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error || 'Upload failed.');
      if (typeof started.id !== 'string') throw new Error('Upload could not be started.');
      const activeUploadId: string = started.id;
      uploadId = activeUploadId;
      const chunkSize = 8 * 1024 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const chunk = file.slice(offset, offset + chunkSize);
        await uploadChunk(activeUploadId, offset, chunk, loaded => setUploadProgress(Math.min(99, Math.floor((offset + loaded) / file.size * 100))));
        setUploadProgress(Math.min(99, Math.floor((offset + chunk.size) / file.size * 100)));
      }
      setUploadProgress(100); setProcessing(true);
      const response = await fetch(`/api/uploads/${uploadId}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Upload failed.'); return; }
      uploadId = undefined;
      setBooks(current => mode === 'replace' ? current.map(book => book.id === result.book.id ? result.book : book) : [result.book, ...current]); setMode(null); setFile(null); toast.add({ title: mode === 'replace' ? 'PDF replaced successfully.' : 'Flipbook added successfully.' });
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed. Check your connection and try again.'); }
    finally { if (uploadId) await fetch(`/api/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {}); setBusy(false); setProcessing(false); }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/books/${selected.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not delete the flipbook.'); return; }
      setBooks(current => current.filter(book => book.id !== selected.id)); setMode(null); toast.add({ title: 'Flipbook deleted.' });
    } catch { setError('Could not delete the flipbook. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/books/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not save the title.'); return; }
      setBooks(current => current.map(book => book.id === selected.id ? { ...book, ...result.book } : book)); setMode(null); toast.add({ title: 'Title updated successfully.' });
    } catch { setError('Could not save the title. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-white text-slate-950">
    <Toaster />
    <header className="border-b border-slate-200"><div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 md:px-8"><span className="workspace-title font-semibold">Scribe Digest</span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-3 rounded-lg p-2 text-left outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400 data-[state=open]:bg-slate-100" aria-label="Account menu for scribedigest">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-800">SD</span>
            <span className="min-w-0 leading-tight"><span className="block text-sm font-semibold">scribedigest</span><span className="block text-xs text-slate-600">admin@scribedigest.com</span></span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-lg border-slate-200 bg-white p-1 text-sm shadow-md">
          <form action="/api/logout" method="post"><DropdownMenuItem asChild onSelect={event => event.preventDefault()} className="cursor-pointer px-3 py-2 text-red-700 focus:bg-red-50 focus:text-red-700"><button type="submit" className="w-full text-left"><LogOut aria-hidden="true" className="size-4" />Sign out</button></DropdownMenuItem></form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div></header>
    <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-10 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-[1.75rem] font-semibold tracking-tight">Flipbooks</h1><Button onClick={openUpload} disabled={orderSaving} className="bg-slate-950 text-white hover:bg-slate-800">Add PDF</Button></div>
      <Label className="block w-full sm:max-w-xs"><span className="sr-only">Search Flipbooks</span><Input placeholder="Search Flipbooks" value={query} onChange={e => setQuery(e.target.value)} /></Label>
      <p role="status" aria-live="polite" className="sr-only">{orderMessage}</p>
      {orderError && <p role="alert" className="text-sm text-red-700">{orderError}</p>}
      {query.trim() && books.length > 1 && <p className="text-sm text-slate-500">Clear the search to rearrange flipbooks.</p>}
      {filtered.length ? <div className="rounded-xl border border-slate-200" onDragEnter={e => { if (draggedId.current && !orderSaving && !query.trim()) e.preventDefault(); }} onDragOver={e => { if (draggedId.current && !orderSaving && !query.trim()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; moveDragPreview(e); } }} onDrop={e => { if (draggedId.current) { e.preventDefault(); endDragging(); } }}><Table className="block w-full text-left text-base sm:table"><TableHeader className="hidden text-sm uppercase tracking-wide text-slate-500 sm:table-header-group"><TableRow className="border-b border-slate-200"><TableHead className="px-5 py-3 font-medium">Title</TableHead><TableHead className="px-4 py-3 font-medium">File size</TableHead><TableHead className="px-4 py-3 font-medium">Pages</TableHead><TableHead className="px-4 py-3 font-medium">Added</TableHead><TableHead className="px-5 py-3 text-right font-medium">Actions</TableHead></TableRow></TableHeader><TableBody className="block sm:table-row-group">{filtered.map(book => <TableRow key={book.id} onDragOver={e => { if (draggedId.current && !orderSaving && !query.trim()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(draggedId.current === book.id ? null : book.id); } }} onDrop={e => { e.preventDefault(); e.stopPropagation(); const id = draggedId.current; endDragging(); if (id) void moveBook(id, books.findIndex(item => item.id === book.id)); }} style={dropTarget === book.id && dragging ? { boxShadow: books.findIndex(item => item.id === dragging) < books.findIndex(item => item.id === book.id) ? "inset 0 -3px #64748b" : "inset 0 3px #64748b" } : undefined} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-100 px-5 py-4 last:border-0 sm:table-row sm:p-0 transition-[opacity,background-color,box-shadow] duration-150 ${dragging === book.id ? "opacity-50 bg-slate-50" : dropTarget === book.id ? "bg-slate-50" : ""}`}><TableCell className="min-w-0 whitespace-normal break-words font-medium sm:px-5 sm:py-4"><div className="flex min-w-0 items-center gap-3">{books.length > 1 && <div className="flex shrink-0 items-center gap-1">
        <button type="button" draggable={!orderSaving && !query.trim()} disabled={orderSaving || !!query.trim()} onDragStart={e => startDragging(e, book.id)} onDrag={moveDragPreview} onDragEnd={endDragging} aria-label={`Drag to rearrange ${book.title}`} title="Drag to rearrange" className="hidden cursor-grab touch-none rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-40 sm:block"><GripVertical className="size-5" /></button>
        <div className="flex flex-col"><button type="button" aria-label={`Move ${book.title} up`} title="Move up" disabled={orderSaving || !!query.trim() || books[0].id === book.id} onClick={() => void moveBook(book.id, books.findIndex(item => item.id === book.id) - 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25"><ArrowUp className="size-4" /></button><button type="button" aria-label={`Move ${book.title} down`} title="Move down" disabled={orderSaving || !!query.trim() || books[books.length - 1].id === book.id} onClick={() => void moveBook(book.id, books.findIndex(item => item.id === book.id) + 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25"><ArrowDown className="size-4" /></button></div>
      </div>}<BookCover id={book.id} version={book.pdfVersion || book.r2File || book.pdfFile} /><span className="min-w-0">{book.title}</span></div></TableCell><TableCell className="col-start-1 mt-2 text-slate-600 sm:table-cell sm:mt-0 sm:px-4 sm:py-4"><span className="sm:hidden">File size: </span>{formatFileSize(book.fileSize)}</TableCell><TableCell className="col-start-1 mt-1 text-slate-600 sm:table-cell sm:mt-0 sm:px-4 sm:py-4"><span className="sm:hidden">Pages: </span>{book.pages}</TableCell><TableCell className="col-start-1 mt-1 text-slate-600 sm:table-cell sm:mt-0 sm:px-4 sm:py-4"><span className="sm:hidden">Added: </span>{new Date(book.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</TableCell><TableCell className="col-start-2 row-span-4 row-start-1 self-start sm:px-5 sm:py-4"><div className="flex justify-end"><DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" disabled={orderSaving} aria-label={`Actions for ${book.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" sideOffset={4} className="min-w-40 overflow-hidden border-slate-200 bg-white p-1 text-base text-slate-700 shadow-md"><DropdownMenuItem onSelect={() => openBook('rename', book)} className="cursor-pointer justify-between gap-6 px-3 py-2 text-base focus:bg-slate-100">Edit<Pencil className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenuItem><DropdownMenuItem onSelect={() => openBook('embed', book)} className="cursor-pointer justify-between gap-6 px-3 py-2 text-base focus:bg-slate-100">Embed<Code2 className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenuItem><DropdownMenuItem asChild className="cursor-pointer justify-between gap-6 px-3 py-2 text-base focus:bg-slate-100"><a href={`/${book.id}`} target="_blank" rel="noreferrer">View<ExternalLink className="size-4 text-slate-500" aria-hidden="true" /></a></DropdownMenuItem><DropdownMenuItem onSelect={() => openBook('replace', book)} className="cursor-pointer justify-between gap-6 px-3 py-2 text-base focus:bg-slate-100">Replace<RefreshCw className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openBook('delete', book)} className="cursor-pointer justify-between gap-6 px-3 py-2 text-base text-red-600 focus:bg-red-50 focus:text-red-600">Delete<Trash2 className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell></TableRow>)}</TableBody></Table></div> : <Empty className="border"><EmptyHeader><EmptyDescription>{query ? 'No matching flipbooks.' : 'No flipbooks yet.'}</EmptyDescription></EmptyHeader></Empty>}
    </main>
    {mode === 'upload' && <Modal title="Add a Flipbook" close={close} busy={busy}><form onSubmit={upload} className="mt-6 space-y-5"><Label className="grid gap-2 text-base font-medium">Title<Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required disabled={busy} placeholder="Publication Title" /></Label><Label className="block"><span className="sr-only">Choose a PDF File</span><input type="file" accept="application/pdf,.pdf" required disabled={busy} className="block w-full rounded-md border border-slate-200 p-3 text-base text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[0.9375rem] file:font-medium file:text-slate-950" onChange={e => { const chosen = e.target.files?.[0] || null; setFile(chosen); if (chosen && !title) setTitle(chosen.name.replace(/\.pdf$/i, '')); }} /></Label>{busy && <UploadProgress progress={uploadProgress} processing={processing} />}{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? (processing ? 'Processing…' : 'Uploading…') : 'Create Flipbook'}</Button></div></form></Modal>}
    {mode === 'replace' && selected && <Modal title="Replace File" close={close} busy={busy}><form onSubmit={upload} className="mt-6 space-y-5"><Label className="block"><span className="sr-only">Choose a PDF File</span><input type="file" accept="application/pdf,.pdf" required disabled={busy} className="block w-full rounded-md border border-slate-200 p-3 text-base text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[0.9375rem] file:font-medium file:text-slate-950" onChange={e => setFile(e.target.files?.[0] || null)} /></Label>{busy && <UploadProgress progress={uploadProgress} processing={processing} />}{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? (processing ? 'Processing…' : 'Uploading…') : 'Replace File'}</Button></div></form></Modal>}
    {mode === 'delete' && selected && <Modal title="Delete Flipbook" close={close} busy={busy}><div className="mt-6 space-y-5"><p className="text-base">Delete <strong>{selected.title}</strong> and its PDF? This cannot be undone.</p>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="button" disabled={busy} onClick={remove} className="bg-red-700 text-white hover:bg-red-800">{busy ? 'Deleting…' : 'Delete'}</Button></div></div></Modal>}
    {mode === 'rename' && <Modal title="Edit Title" close={close} busy={busy}><form onSubmit={rename} className="mt-6 space-y-5"><Label className="grid gap-2 text-base font-medium">Title<Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={160} autoFocus /></Label>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? 'Saving…' : 'Save Changes'}</Button></div></form></Modal>}
    {mode === 'embed' && selected && <Modal title="Embed Flipbook" close={close} busy={false}><div className="mt-6 space-y-4"><Label className="grid gap-2 text-base font-medium">Embed Code<Textarea readOnly value={embedCode} onFocus={e => e.currentTarget.select()} rows={5} className="resize-y font-mono" /></Label><p className="text-sm text-slate-500">The flipbook and its PDF are public to anyone with the link. You can adjust the height in the code.</p><div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="outline" onClick={() => copy(readerUrl, 'Link copied.')}>Copy Link</Button><Button type="button" className="bg-slate-950 text-white hover:bg-slate-800" onClick={() => copy(embedCode, 'Embed Code copied.')}>Copy Embed Code</Button></div>{feedback && <p role="status" className="flex items-center gap-1 text-base text-slate-600">{feedback}</p>}</div></Modal>}
  </div>;
}
