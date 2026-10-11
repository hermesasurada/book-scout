"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type ToastItem = { id: number; message: string; tone: "default" | "error" };

const TOAST_EVENT = "bookscout:toast";
const BOOKS_CHANGED_EVENT = "bookscout:books-changed";

export function toast(message: string, tone: ToastItem["tone"] = "default") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

// Lets the global add-book search tell whichever list is on screen to reload.
export function notifyBooksChanged() {
  window.dispatchEvent(new Event(BOOKS_CHANGED_EVENT));
}

export function onBooksChanged(handler: () => void) {
  window.addEventListener(BOOKS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(BOOKS_CHANGED_EVENT, handler);
}

let nextId = 1;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const { message, tone } = (event as CustomEvent<{ message: string; tone: ToastItem["tone"] }>).detail;
      const id = nextId++;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4500);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] shadow-lg ${
            item.tone === "error" ? "bg-bad text-white" : "bg-ink text-surface"
          }`}
        >
          <span className="min-w-0">{item.message}</span>
          <button
            className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md opacity-70 hover:opacity-100"
            onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            aria-label="알림 닫기"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
