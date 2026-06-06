import { useMemo } from "react";
import { useSettings } from "@/lib/settings/use-settings";
import type { Transition, Variants } from "framer-motion";

/**
 * Animation-aware hook that respects the user's animation level setting.
 * Returns framer-motion props adapted to the current animation preference.
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

    const hoverProps = isDisabled ? {} : { whileHover: { y: -6, rotate: 2 } };
    const tapProps = isDisabled ? {} : { whileTap: { scale: 0.92 } };

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
      staggerContainer,
      staggerItem,
    };
  }, [level]);
}
