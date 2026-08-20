"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { title: string; kind: string; href: string; subtitle: string };

export function SearchBox({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 1) {
      setItems([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/v1/search/autocomplete?q=${encodeURIComponent(term)}`);
      const data = (await response.json()) as { data?: Suggestion[] };
      setItems(data.data ?? []);
      setOpen(true);
      setActive(-1);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(term = value) {
    if (!term.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, -1));
            } else if (event.key === "Enter") {
              if (active >= 0 && items[active]) {
                setOpen(false);
                router.push(items[active].href);
              } else {
                submit();
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Search 水, たべる, eat, type:kanji jlpt:n5"
          aria-label="Search NihongoBridge"
          className="flex-1 rounded-2xl border-2 border-[#e5e5e5] px-4 py-3 font-bold outline-none focus:border-[#1cb0f6]"
        />
        <button type="button" className="press bg-[#1cb0f6] px-5 text-white" onClick={() => submit()}>
          Search
        </button>
      </div>

      {open && items.length > 0 ? (
        <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white shadow-xl">
          {items.map((item, index) => (
            <li key={`${item.kind}-${item.href}-${index}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                  active === index ? "bg-[#ddf4ff]" : "bg-white"
                }`}
              >
                <span className="font-black">{item.title}</span>
                <span className="truncate text-xs text-[#777]">
                  {item.kind} · {item.subtitle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
