import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { md3CardClass, md3Cx, type Md3CardVariant } from "@/lib/md3/classes";

interface MdCardBase {
  variant?: Md3CardVariant;
  className?: string;
  children?: ReactNode;
}

type MdCardProps = MdCardBase &
  (
    | ({ href?: undefined } & HTMLAttributes<HTMLDivElement>)
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
  );

/** M3 card (elevated / filled / outlined). Interactive cards use href. */
export function MdCard({ variant = "elevated", className, children, ...rest }: MdCardProps) {
  const cls = md3Cx(md3CardClass(variant), className);
  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    return (
      <a href={href} className={cls} {...anchorRest}>
        {children}
      </a>
    );
  }
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
