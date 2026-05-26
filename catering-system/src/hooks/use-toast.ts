import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'destructive';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export interface Toast extends ToastOptions {
  id: string;
}

// Module-level store shared between useToast and Toaster
const listeners: Array<(toasts: Toast[]) => void> = [];
let store: Toast[] = [];

function emit() {
  listeners.forEach(fn => fn([...store]));
}

export function toast(options: ToastOptions) {
  const id = Math.random().toString(36).slice(2);
  store = [...store, { ...options, id }];
  emit();
  setTimeout(() => {
    store = store.filter(t => t.id !== id);
    emit();
  }, 4500);
}

export function useToast() {
  return { toast };
}

export function useToasts(): Toast[] {
  const [state, setState] = useState<Toast[]>(store);
  useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);
  return state;
}
