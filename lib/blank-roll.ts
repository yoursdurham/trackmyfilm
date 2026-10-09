import type { FilmOrder, RollDetail } from "./types";

/**
 * A roll is blank only when staff set `blank: true` on that roll.
 * A missing field (the column-or-key not existing yet) is a normal roll.
 */
export function isBlankRoll(roll: { blank?: unknown } | null | undefined): boolean {
  return !!roll && roll.blank === true;
}

/** Store `blank: true`, or omit the key when the roll is not blank. */
export function setRollBlank<T extends { blank?: boolean }>(roll: T, blank: boolean): T {
  if (blank) return { ...roll, blank: true };
  if (!Object.prototype.hasOwnProperty.call(roll, "blank")) return roll;
  const next = { ...roll };
  delete next.blank;
  return next;
}

export function rollDetailsWithBlankToggled(
  rolls: readonly RollDetail[],
  index: number,
): RollDetail[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= rolls.length) return null;
  return rolls.map((roll, rollIndex) =>
    rollIndex === index ? setRollBlank(roll, !isBlankRoll(roll)) : roll,
  );
}

/**
 * Order-level turnaround has one duration for the whole order.
 * Leave that order out only when every stored roll is blank.
 * Legacy orders with no roll_details stay in the average.
 */
export function orderHasOnlyBlankRolls(order: Pick<FilmOrder, "roll_details">): boolean {
  const rolls = order.roll_details;
  if (!rolls?.length) return false;
  return rolls.every((roll) => isBlankRoll(roll));
}

export function normalizeStoredRollDetails(rollDetails: RollDetail[]): RollDetail[] {
  return rollDetails.map((roll) => {
    if (!roll || typeof roll !== "object") return roll;
    return setRollBlank(roll, isBlankRoll(roll));
  });
}
