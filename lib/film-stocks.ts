/**
 * Film stocks offered on the drop-off form.
 * Squarespace free-text answers are matched against this list.
 */
export const FILM_STOCKS: readonly string[] = [
  "Kodak Portra 400", "Kodak Portra 800", "Kodak Portra 160",
  "Kodak Gold 200", "Kodak UltraMax 400", "Kodak ColorPlus 200", "Kodak Kodacolor 200",
  "Kodak Ektar 100", "Kodak T-Max 400", "Kodak T-Max 100", "Kodak T-Max P3200", "Kodak Tri-X 400",
  "Fujifilm Superia 400", "Fujifilm Superia 200", "Fujifilm Pro 400H",
  "Fujifilm Velvia 50", "Fujifilm Provia 100F",
  "Ilford HP5 Plus 400", "Ilford Delta 400", "Ilford XP2 Super 400",
  "Cinestill 800T", "Cinestill 400D",
  "Lomography Color 400", "Lomography Color '92", "Lomography LomoChrome Metropolis",
  "Candido 400", "Candido 800",
  "Phoenix 125", "Phoenix 200 - Blue", "Harman Azure 125",
];

/** Stored rows spelled Harman Phoenix as "Pheonix". Labels and matching use Phoenix. */
export function correctFilmStockSpelling(stock: string): string {
  return stock.replace(/pheonix/gi, "Phoenix");
}
