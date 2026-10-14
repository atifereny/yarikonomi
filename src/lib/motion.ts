import type { Transition } from "framer-motion";

/** iOS hissi veren yay animasyonları */
export const spring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.9,
};
export const softSpring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
};
export const zoomSpring: Transition = {
  type: "spring",
  stiffness: 210,
  damping: 28,
  mass: 1,
};
export const sheetSpring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 40,
};
