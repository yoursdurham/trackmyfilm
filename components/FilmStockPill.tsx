import { filmProductUrl } from "@/lib/film-product-links";
import { correctFilmStockSpelling } from "@/lib/film-stocks";

const FILM_STOCK_PILL_CLASS =
  "rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-900 ring-1 ring-neutral-900";

/** Format-matched shop link. Unlinked stocks stay plain text. */
export default function FilmStockPill({ stock, format }: { stock: string; format?: string | null }) {
  const label = correctFilmStockSpelling(stock);
  const href = filmProductUrl(stock, format);
  if (!href) {
    return <span className={FILM_STOCK_PILL_CLASS}>{label}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${FILM_STOCK_PILL_CLASS} underline-offset-2 transition-colors duration-150 ease-out hover:bg-[#C5AED7]/40 hover:underline focus-visible:bg-[#C5AED7]/40 focus-visible:underline focus-visible:outline-none`}
    >
      {label}
    </a>
  );
}
