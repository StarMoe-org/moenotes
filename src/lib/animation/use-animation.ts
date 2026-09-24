import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/** Shared Sirius motion: subtle lift, soft arrival, and reduced-motion support. */
export function useSpringAnimation() {
  const reducedMotion = useReducedMotion();
  return useMemo(() => {
    const springTransition: Transition = { type: "spring", stiffness: 320, damping: 28 };
    const modalTransition: Transition = { type: "spring", stiffness: 300, damping: 28 };

    const floatHoverProps = { whileHover: { y: -2 } };
    const floatTapProps = { whileTap: { scale: 0.98 } };

    const stampHoverProps = { whileHover: { y: -1, scale: 1.01 } };
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
      isDisabled: Boolean(reducedMotion),
      springTransition: reducedMotion ? { duration: 0 } : springTransition,
      modalTransition: reducedMotion ? { duration: 0 } : modalTransition,
      floatHoverProps: reducedMotion ? {} : floatHoverProps,
      floatTapProps: reducedMotion ? {} : floatTapProps,
      stampHoverProps: reducedMotion ? {} : stampHoverProps,
      stampTapProps: reducedMotion ? {} : stampTapProps,
      staggerContainer: reducedMotion ? {} : staggerContainer,
      staggerItem: reducedMotion ? {} : staggerItem,
    };
  }, [reducedMotion]);
}
