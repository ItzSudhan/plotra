export const ease = [0.16, 1, 0.3, 1] as const;

/** How the pointer in the product tour travels; anything it drags moves with it. */
export const pointerSpring = { type: "spring", stiffness: 120, damping: 20 } as const;
