"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("transition duration-700 ease-out motion-reduce:transition-none", shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", className)}
    >
      {children}
    </Tag>
  );
}

/** Types each word, pauses, deletes it and moves to the next one. */
export function TypeWords({ words, className }) {
  const [i, setI] = useState(0);
  const [len, setLen] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const word = words[i % words.length];

  useEffect(() => {
    const done = !deleting && len === word.length;
    const empty = deleting && len === 0;
    const t = setTimeout(
      () => {
        if (done) setDeleting(true);
        else if (empty) {
          setDeleting(false);
          setI((n) => n + 1);
        } else setLen((n) => n + (deleting ? -1 : 1));
      },
      done ? 1800 : empty ? 250 : deleting ? 35 : 70,
    );
    return () => clearTimeout(t);
  }, [len, deleting, word]);

  return (
    <span className={className}>
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden>
        {word.slice(0, len)}
        <span className="ml-0.5 inline-block w-[3px] animate-caret self-stretch bg-current align-[-0.1em]" style={{ height: "0.9em" }} />
      </span>
    </span>
  );
}
