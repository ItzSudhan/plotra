"use client";

import { useEffect, useLayoutEffect } from "react";
import { restoreMotion } from "@/lib/motion";
import { installPress } from "@/lib/press";
import { restoreUiSize } from "@/lib/ui-size";

/** The app's motion, on every page: the press under each button, the person's choice to switch it off (lib/motion.ts), and their interface size (lib/ui-size.ts). */
export function Motion() {
  useLayoutEffect(() => {
    restoreMotion();
    restoreUiSize();
  }, []);
  useEffect(installPress, []);
  return null;
}
