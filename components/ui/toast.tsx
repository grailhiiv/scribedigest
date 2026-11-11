"use client";

import { Toast } from '@base-ui/react/toast';
import { X } from 'lucide-react';

export const toast = Toast.createToastManager();

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map(item => <Toast.Root key={item.id} toast={item} swipeDirection={['up', 'left', 'right']} className="pointer-events-auto w-full rounded-lg border border-slate-200 bg-white text-slate-950 shadow-lg outline-none transition-all duration-200 data-[starting-style]:-translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-2 data-[ending-style]:opacity-0 data-[limited]:hidden">
    <Toast.Content className="flex items-center gap-3 p-4">
      <Toast.Title className="min-w-0 flex-1 text-sm font-medium" />
      <Toast.Close aria-label="Close notification" className="rounded-sm p-1 text-slate-500 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-slate-500"><X className="size-4" aria-hidden="true" /></Toast.Close>
    </Toast.Content>
  </Toast.Root>);
}

export function Toaster() {
  return <Toast.Provider toastManager={toast} limit={1}><Toast.Portal><Toast.Viewport className="pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm flex-col gap-2 outline-none"><ToastList /></Toast.Viewport></Toast.Portal></Toast.Provider>;
}
