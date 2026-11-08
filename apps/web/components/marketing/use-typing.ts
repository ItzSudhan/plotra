"use client";

import { useEffect, useState } from "react";

/** Types forward to `total`, holds, erases, and loops, like a collaborator "writing" in a mock. */
export function useTyping(total: number, { speed = 42, hold = 2600, start = 900 } = {}) {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"wait" | "type" | "hold" | "erase">("wait");

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "wait") t = setTimeout(() => setPhase("type"), start);
    else if (phase === "type") {
      if (count >= total) t = setTimeout(() => setPhase("hold"), 0);
      else t = setTimeout(() => setCount((c) => c + 1), speed + (count % 7 === 0 ? 90 : 0));
    } else if (phase === "hold") t = setTimeout(() => setPhase("erase"), hold);
    else {
      if (count <= 0) t = setTimeout(() => setPhase("wait"), 0);
      else t = setTimeout(() => setCount((c) => Math.max(0, c - 3)), 14);
    }
    return () => clearTimeout(t);
  }, [phase, count, total, speed, hold, start]);

  return { count, typing: phase === "type" };
}
