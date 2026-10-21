import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type WindowFrameProps = {
  title: ReactNode;
  /** Heading level for the title bar. Use "p" when the page already has the heading. */
  titleAs?: "p" | "h1" | "h2" | "h3";
  titleId?: string;
  /** Optional control, such as a status pill, kept inside the title bar. */
  trailing?: ReactNode;
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
  trailing,
  className,
  bodyClassName,
  children,
}: WindowFrameProps) {
  const TitleTag = titleAs;
  return (
    <div className={cn("w-full min-w-0 max-w-full overflow-hidden rounded-[1.7rem] border-2 border-neutral-900 bg-white", className)}>
      <div
        className={cn(
          "relative flex min-h-11 items-center bg-[#DDB1B1] py-2.5",
          trailing ? "flex-wrap gap-x-3 gap-y-1.5 pl-12 pr-3 sm:pr-4" : "justify-center px-12",
        )}
      >
        <span className="absolute left-3.5 flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#C9B7C6]" />
          <span className="size-2.5 rounded-full bg-[#E4D48A]" />
          <span className="size-2.5 rounded-full bg-[#A9C99A]" />
        </span>
        <TitleTag
          id={titleId}
          className={cn(
            "min-w-0 text-center font-jetbrains text-[0.82rem] font-bold leading-snug tracking-wide text-neutral-900 sm:text-sm",
            trailing ? "flex-1" : "px-2",
          )}
        >
          {title}
        </TitleTag>
        {trailing ? <div className="max-w-full shrink-0">{trailing}</div> : null}
      </div>
      <div className={cn("bg-white", bodyClassName)}>{children}</div>
    </div>
  );
}
