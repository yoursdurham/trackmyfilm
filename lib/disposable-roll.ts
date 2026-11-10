/**
 * Disposable cameras stand in for a film stock.
 * A roll marked Disposable Camera does not keep a stock, and summary lines
 * leave that stock off so an empty or "unknown" name is not shown.
 */

export function isDisposableFilmType(value: string | null | undefined): boolean {
  return value === "Disposable Camera";
}

/**
 * Disposable cameras, FunSaver, and single-use cameras.
 * "not a disposable" does not match.
 */
export function isDisposableCameraText(value: string): boolean {
  if (/\b(?:not|no|non)[\s-]+disposab/i.test(value)) return false;
  return /\bdisposables?\b|\bfun\s*savers?\b|\bsingle[\s-]*use(?:\s+cameras?)?\b/i.test(value);
}

/** A short label that names the camera, not a film stock. */
export function isDisposableCameraLabel(value: string): boolean {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    "disposable",
    "disposables",
    "disposablecamera",
    "disposablecameras",
    "funsaver",
    "funsavers",
    "kodakfunsaver",
    "singleuse",
    "singleusecamera",
  ].includes(compact) || (
    value.trim().split(/\s+/).length <= 4 && isDisposableCameraText(value)
  );
}

/** Stock text worth showing beside a non-disposable roll. */
export function summaryFilmStock(roll: {
  film_type?: string | null;
  film_stock?: string | null;
}): string | null {
  if (isDisposableFilmType(roll.film_type)) return null;
  const stock = roll.film_stock?.trim() ?? "";
  if (!stock || /^unknown$/i.test(stock)) return null;
  return stock;
}

type StockRoll = {
  film_type?: string;
  film_stock?: string;
  film_stock_confidence?: number;
  film_stock_created?: boolean;
};

/** Drops stock and matcher fields from a disposable roll. Other rolls are unchanged. */
export function withoutDisposableFilmStock<T extends StockRoll>(roll: T): T {
  if (!isDisposableFilmType(roll.film_type)) return roll;
  if (
    roll.film_stock === undefined
    && roll.film_stock_confidence === undefined
    && roll.film_stock_created === undefined
  ) {
    return roll;
  }
  const next = { ...roll };
  delete next.film_stock;
  delete next.film_stock_confidence;
  delete next.film_stock_created;
  return next;
}
