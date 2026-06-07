import { useMemo } from "react";
import { useSettings } from "@/lib/settings/use-settings";
import type { Transition, Variants } from "framer-motion";

/**
 * Animation-aware hook that respects the user's animation level setting.
 * Returns framer-motion props adapted to the current animation preference.
 *
 * Two animation specs are provided, one per button shape family:
 *
 * ┌─────────────┬──────────────────────────┬─────────────────────────────────┐
 * │ Spec        │ Shape                    │ Hover / Tap                     │
 * ├─────────────┼──────────────────────────┼─────────────────────────────────┤
 * │ Stamp       │ Circular / Square        │ press-down (x+1, y+1, s0.98)   │
 * │ Float       │ Capsule / Pill           │ rise-up (y-6, rotate 2°)       │
 * └─────────────┴──────────────────────────┴─────────────────────────────────┘
 */
export function useSpringAnimation() {
  const { settings } = useSettings();
  const level = settings.animationLevel;

  return useMemo(() => {
    const isDisabled = level === "off";
    const isReduced = level === "reduced";

    const springTransition: Transition = isReduced
      ? { duration: 0.15 }
      : { type: "spring", stiffness: 280, damping: 18 };

    const modalTransition: Transition = isReduced
      ? { duration: 0.15 }
      : { type: "spring", stiffness: 300, damping: 28 };

    // ── Float Animation (capsule / pill buttons) ─────────────────────────────
    // Hover: rise up slightly — light, clean feel.
    // Tap:   scale down to 0.96.
    // Pair with: no mandatory shadow change; capsule buttons keep their own shadow style.
    const floatHoverProps = isDisabled ? {} : { whileHover: { y: -4 } };
    const floatTapProps = isDisabled ? {} : { whileTap: { scale: 0.96 } };

    // ── Stamp Animation (circular / square buttons) ─────────────────────────
    // Hover: rise up slightly + scale — modern feel.
    // Tap:   scale down to 0.98 — clean feedback.
    const stampHoverProps = isDisabled ? {} : { whileHover: { y: -2, scale: 1.02 } };
    const stampTapProps = isDisabled ? {} : { whileTap: { scale: 0.98 } };

    /** @deprecated Use floatHoverProps (capsule) or stampHoverProps (circular/square) */
    const hoverProps = floatHoverProps;
    /** @deprecated Use floatTapProps (capsule) or stampTapProps (circular/square) */
    const tapProps = floatTapProps;

    const staggerContainer: Variants = {
      hidden: {},
      show: {
        transition: isDisabled
          ? {}
          : { staggerChildren: isReduced ? 0.02 : 0.06 },
      },
    };

    const staggerItem: Variants = {
      hidden: isDisabled ? {} : { opacity: 0, y: 16 },
      show: isDisabled ? {} : { opacity: 1, y: 0, transition: springTransition },
    };

    return {
      isDisabled,
      springTransition,
      modalTransition,
      hoverProps,
      tapProps,
      floatHoverProps,
      floatTapProps,
      stampHoverProps,
      stampTapProps,
      staggerContainer,
      staggerItem,
    };
  }, [level]);
}
