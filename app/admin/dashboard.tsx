"use client";

import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, Code2, ExternalLink, LogOut, MoreHorizontal, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
function escaped(value: string) { return value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!)); }

export default function Dashboard({ books: initialBooks }: { books: Book[] }) {
  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState<Book | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const filtered = books.filter(book => book.title.toLowerCase().includes(query.trim().toLowerCase()));
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const readerUrl = selected ? `${origin}/${selected.id}` : '';
  const embedCode = selected ? `<iframe src="${readerUrl}" title="${escaped(selected.title)}" width="100%" height="700" style="border:0;" allow="fullscreen" allowfullscreen loading="lazy"></iframe>` : '';
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
    setBusy(true); setError('');
    let uploadId: string | undefined;
    try {
      const start = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mode === 'replace' && selected ? { replaceId: selected.id, size: file.size } : { title, size: file.size }) });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error || 'Upload failed.');
      uploadId = started.id;
      const chunkSize = 8 * 1024 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const part = await fetch(`/api/uploads/${uploadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Upload-Offset': String(offset) }, body: file.slice(offset, offset + chunkSize) });
        if (!part.ok) { const body = await part.json(); throw new Error(body.error || 'Upload failed.'); }
      }
      const response = await fetch(`/api/uploads/${uploadId}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Upload failed.'); return; }
      uploadId = undefined;
      setBooks(current => mode === 'replace' ? current.map(book => book.id === result.book.id ? result.book : book) : [result.book, ...current]); setMode(null); setFile(null); setFeedback(mode === 'replace' ? 'PDF replaced successfully.' : 'Flipbook added successfully.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed. Check your connection and try again.'); }
    finally { if (uploadId) await fetch(`/api/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => {}); setBusy(false); }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/books/${selected.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) { setError(result.error || 'Could not delete the flipbook.'); return; }
      setBooks(current => current.filter(book => book.id !== selected.id)); setMode(null); setFeedback('Flipbook deleted.');
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
      setBooks(current => current.map(book => book.id === selected.id ? result.book : book)); setMode(null); setFeedback('Title updated successfully.');
    } catch { setError('Could not save the title. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-white text-slate-950">
    <header className="border-b border-slate-200"><div className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 md:px-8"><span className="workspace-title font-semibold">Scribe Digest</span>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="flex items-center gap-3 rounded-lg p-2 text-left outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-400 data-[state=open]:bg-slate-100" aria-label="Account menu for scribedigest">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-800">SD</span>
            <span className="min-w-0 leading-tight"><span className="block text-sm font-semibold">scribedigest</span><span className="block text-xs text-slate-600">admin@scribedigest.com</span></span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-56 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-md">
          <form action="/api/logout" method="post"><DropdownMenu.Item asChild onSelect={event => event.preventDefault()}><button type="submit" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-red-700 outline-none hover:bg-red-50 focus:bg-red-50"><LogOut aria-hidden="true" className="size-4" />Sign out</button></DropdownMenu.Item></form>
        </DropdownMenu.Content></DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div></header>
    <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-10 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-[1.75rem] font-semibold tracking-tight">Flipbooks</h1><Button onClick={openUpload} className="bg-slate-950 text-white hover:bg-slate-800">Add PDF</Button></div>
      <label className="block w-full sm:max-w-xs"><span className="sr-only">Search Flipbooks</span><Input placeholder="Search Flipbooks" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {feedback && !mode && <p className="text-sm text-slate-600" role="status">{feedback}</p>}
      {filtered.length ? <div className="rounded-xl border border-slate-200"><table className="block w-full text-left text-base sm:table"><thead className="hidden text-sm uppercase tracking-wide text-slate-500 sm:table-header-group"><tr className="border-b border-slate-200"><th className="px-5 py-3 font-medium">Title</th><th className="px-4 py-3 font-medium">Pages</th><th className="px-4 py-3 font-medium">Added</th><th className="px-5 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="block sm:table-row-group">{filtered.map(book => <tr key={book.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-slate-100 px-5 py-4 last:border-0 sm:table-row sm:p-0"><td className="min-w-0 break-words font-medium sm:px-5 sm:py-4"><div className="flex min-w-0 items-center gap-3"><BookCover id={book.id} version={book.pdfFile} /><span className="min-w-0">{book.title}</span></div></td><td className="col-start-1 mt-2 text-slate-600 sm:table-cell sm:mt-0 sm:px-4 sm:py-4"><span className="sm:hidden">Pages: </span>{book.pages}</td><td className="col-start-1 mt-1 text-slate-600 sm:table-cell sm:mt-0 sm:px-4 sm:py-4"><span className="sm:hidden">Added: </span>{new Date(book.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td><td className="col-start-2 row-span-3 row-start-1 self-start sm:px-5 sm:py-4"><div className="flex justify-end"><DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${book.title}`}><MoreHorizontal /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-base text-slate-700 shadow-md"><DropdownMenu.Item onSelect={() => openBook('rename', book)} className="flex cursor-pointer items-center justify-between gap-6 rounded-sm px-3 py-2 outline-none focus:bg-slate-100">Edit<Pencil className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenu.Item><DropdownMenu.Item onSelect={() => openBook('embed', book)} className="flex cursor-pointer items-center justify-between gap-6 rounded-sm px-3 py-2 outline-none focus:bg-slate-100">Embed<Code2 className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenu.Item><DropdownMenu.Item asChild className="flex cursor-pointer items-center justify-between gap-6 rounded-sm px-3 py-2 outline-none focus:bg-slate-100"><a href={`/${book.id}`} target="_blank" rel="noreferrer">View<ExternalLink className="size-4 text-slate-500" aria-hidden="true" /></a></DropdownMenu.Item><DropdownMenu.Item onSelect={() => openBook('replace', book)} className="flex cursor-pointer items-center justify-between gap-6 rounded-sm px-3 py-2 outline-none focus:bg-slate-100">Replace<RefreshCw className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenu.Item><DropdownMenu.Separator className="-mx-1 my-1 h-px bg-slate-200" /><DropdownMenu.Item onSelect={() => openBook('delete', book)} className="flex cursor-pointer items-center justify-between gap-6 rounded-sm px-3 py-2 text-red-600 outline-none focus:bg-red-50">Delete<Trash2 className="size-4 text-slate-500" aria-hidden="true" /></DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-slate-200 px-6 py-14 text-center text-base text-slate-500">{query ? 'No matching flipbooks.' : 'No flipbooks yet.'}</div>}
    </main>
    {mode === 'upload' && <Modal title="Add a Flipbook" close={close} busy={busy}><form onSubmit={upload} className="mt-6 space-y-5"><label className="grid gap-2 text-base font-medium">Title<Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} required placeholder="Publication Title" /></label><label className="block"><span className="sr-only">Choose a PDF File</span><input type="file" accept="application/pdf,.pdf" required className="block w-full rounded-md border border-slate-200 p-3 text-base text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[0.9375rem] file:font-medium file:text-slate-950" onChange={e => { const chosen = e.target.files?.[0] || null; setFile(chosen); if (chosen && !title) setTitle(chosen.name.replace(/\.pdf$/i, '')); }} /></label>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? 'Uploading…' : 'Create Flipbook'}</Button></div></form></Modal>}
    {mode === 'replace' && selected && <Modal title="Replace File" close={close} busy={busy}><form onSubmit={upload} className="mt-6 space-y-5"><label className="block"><span className="sr-only">Choose a PDF File</span><input type="file" accept="application/pdf,.pdf" required className="block w-full rounded-md border border-slate-200 p-3 text-base text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-[0.9375rem] file:font-medium file:text-slate-950" onChange={e => setFile(e.target.files?.[0] || null)} /></label>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? 'Uploading…' : 'Replace File'}</Button></div></form></Modal>}
    {mode === 'delete' && selected && <Modal title="Delete Flipbook" close={close} busy={busy}><div className="mt-6 space-y-5"><p className="text-base">Delete <strong>{selected.title}</strong> and its PDF? This cannot be undone.</p>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="button" disabled={busy} onClick={remove} className="bg-red-700 text-white hover:bg-red-800">{busy ? 'Deleting…' : 'Delete'}</Button></div></div></Modal>}
    {mode === 'rename' && <Modal title="Edit Title" close={close} busy={busy}><form onSubmit={rename} className="mt-6 space-y-5"><label className="grid gap-2 text-base font-medium">Title<Input value={title} onChange={e => setTitle(e.target.value)} required maxLength={160} autoFocus /></label>{error && <p role="alert" className="text-base text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy} className="bg-slate-950 text-white hover:bg-slate-800">{busy ? 'Saving…' : 'Save Changes'}</Button></div></form></Modal>}
    {mode === 'embed' && selected && <Modal title="Embed Flipbook" close={close} busy={false}><div className="mt-6 space-y-4"><label className="grid gap-2 text-base font-medium">Embed Code<textarea readOnly value={embedCode} onFocus={e => e.currentTarget.select()} rows={5} className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-slate-500" /></label><p className="text-sm text-slate-500">The flipbook and its PDF are public to anyone with the link. You can adjust the height in the code.</p><div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="outline" onClick={() => copy(readerUrl, 'Link copied.')}>Copy Link</Button><Button type="button" className="bg-slate-950 text-white hover:bg-slate-800" onClick={() => copy(embedCode, 'Embed Code copied.')}>Copy Embed Code</Button></div>{feedback && <p role="status" className="flex items-center gap-1 text-base text-slate-600">{feedback}</p>}</div></Modal>}
  </div>;
}
