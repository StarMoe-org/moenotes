import { useMemo } from "react";
import type { Transition, Variants } from "framer-motion";

/**
 * Animation hook — always full animations, ignores all settings and OS preferences.
 * Returns framer-motion props for the app's two button shape families.
 *
 * ┌─────────────┬──────────────────────────┬─────────────────────────────────┐
 * │ Spec        │ Shape                    │ Hover / Tap                     │
 * ├─────────────┼──────────────────────────┼─────────────────────────────────┤
 * │ Stamp       │ Circular / Square        │ rise + scale on hover           │
 * │ Float       │ Capsule / Pill           │ rise on hover                   │
 * └─────────────┴──────────────────────────┴─────────────────────────────────┘
 */
export function useSpringAnimation() {
  return useMemo(() => {
    const springTransition: Transition = { type: "spring", stiffness: 280, damping: 18 };
    const modalTransition: Transition = { type: "spring", stiffness: 300, damping: 28 };

    const floatHoverProps = { whileHover: { y: -4 } };
    const floatTapProps = { whileTap: { scale: 0.96 } };

    const stampHoverProps = { whileHover: { y: -2, scale: 1.02 } };
    const stampTapProps = { whileTap: { scale: 0.98 } };

    const staggerContainer: Variants = {
      hidden: {},
      show: {
        transition: { staggerChildren: 0.06 },
      },
    };

    const staggerItem: Variants = {
      hidden: { opacity: 0, y: 16 },
      show: { opacity: 1, y: 0, transition: springTransition },
    };

    return {
      isDisabled: false,
      springTransition,
      modalTransition,
      floatHoverProps,
      floatTapProps,
      stampHoverProps,
      stampTapProps,
      staggerContainer,
      staggerItem,
    };
  }, []);
}
