import type { FilmOrder, RollDetail } from "./types";

export function getOrderRollDetails(order: FilmOrder): RollDetail[] {
  if (order.roll_details?.length) return order.roll_details;
  return [{
    film_type: order.film_type,
    film_process: order.film_process,
    film_stock: order.film_stock,
    prints_4x6: order.prints_4x6,
  }];
}
