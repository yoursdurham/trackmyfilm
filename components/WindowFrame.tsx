import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WindowFrameProps = {
  title: ReactNode;
  /** Heading level for the title bar. Use "p" when the page already has the heading. */
  titleAs?: "p" | "h2" | "h3";
  titleId?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/**
 * Mac-style window used by the public homepage. The dots are decorative.
 * Title text stays dark on the pink bar so the label does not depend on color alone.
 */
export default function WindowFrame({
  title,
  titleAs = "p",
  titleId,
  className,
  bodyClassName,
  children,
}: WindowFrameProps) {
  const TitleTag = titleAs;
  return (
    <div className={cn("overflow-hidden rounded-[1.7rem] border-2 border-neutral-900 bg-white", className)}>
      <div className="relative flex min-h-11 items-center justify-center bg-[#DDB1B1] px-12 py-2.5">
        <span className="absolute left-3.5 flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#C9B7C6]" />
          <span className="size-2.5 rounded-full bg-[#E4D48A]" />
          <span className="size-2.5 rounded-full bg-[#A9C99A]" />
        </span>
        <TitleTag
          id={titleId}
          className="text-center font-jetbrains text-[0.82rem] font-bold leading-snug tracking-wide text-neutral-900 sm:text-sm"
        >
          {title}
        </TitleTag>
      </div>
      <div className={cn("bg-white", bodyClassName)}>{children}</div>
    </div>
  );
}
