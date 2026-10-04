import type { Customer, FilmProcess, FilmType } from "@/lib/types";

export const DROP_OFF_SCAN_SIZES = ["Standard", "High-Res", "TIFF", "Process Only"] as const;
export type DropoffScanSize = (typeof DROP_OFF_SCAN_SIZES)[number];

export interface DropoffRollState {
  film_type: FilmType | "";
  film_process: FilmProcess | "";
  film_stock: string;
  custom_stock: string;
  scan_size: DropoffScanSize;
  prints_4x6: boolean;
}

/** Default selections for a new blank roll on the drop-off form. */
export function createEmptyDropoffRoll(): DropoffRollState {
  return {
    film_type: "35mm",
    film_process: "Color",
    film_stock: "",
    custom_stock: "",
    scan_size: "Standard",
    prints_4x6: false,
  };
}

export function cloneDropoffRoll(roll: DropoffRollState): DropoffRollState {
  return { ...roll };
}

export function syncRollCount(
  rolls: DropoffRollState[],
  rawCount: number,
  maxRolls: number,
): DropoffRollState[] {
  const count = Math.min(Math.max(1, rawCount || 1), maxRolls);
  const next = [...rolls];
  while (next.length < count) next.push(createEmptyDropoffRoll());
  return next.slice(0, count);
}

/** Inserts a deep-independent copy immediately after `index`. Returns null at max rolls. */
export function duplicateDropoffRollAt(
  rolls: DropoffRollState[],
  index: number,
  maxRolls: number,
): DropoffRollState[] | null {
  if (index < 0 || index >= rolls.length) return null;
  if (rolls.length >= maxRolls) return null;
  const next = [...rolls];
  next.splice(index + 1, 0, cloneDropoffRoll(rolls[index]));
  return next;
}

export function applyCustomerDefaultsToRolls(
  rolls: DropoffRollState[],
  customer: Pick<Customer, "default_film_type" | "default_film_process" | "default_scan_size">,
): DropoffRollState[] {
  if (!customer.default_film_type && !customer.default_film_process && !customer.default_scan_size) {
    return rolls;
  }
  return rolls.map((roll) => ({
    ...roll,
    film_type: customer.default_film_type || roll.film_type,
    film_process: customer.default_film_process || roll.film_process,
    scan_size: (customer.default_scan_size as DropoffScanSize | undefined) || roll.scan_size,
  }));
}
