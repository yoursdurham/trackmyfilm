import {
  updateCustomer,
  updateOrdersCustomerEmailByCustomerId,
} from "@/lib/db";
import { customerEmailWillChange } from "@/lib/customer-update";
import type { Customer } from "@/lib/types";

/**
 * Applies a customer patch and, when email changes, syncs film_orders.customer_email
 * for all orders with matching customer_id. Reverts the customer email if order sync fails.
 */
export async function patchCustomerWithOrderEmailSync(
  customerId: string,
  current: Customer,
  patch: Partial<Customer>,
): Promise<{ customer: Customer; ordersUpdated: number }> {
  const emailChanging = customerEmailWillChange(current, patch);
  const previousEmail = current.email;

  const customer = await updateCustomer(customerId, patch);

  if (!emailChanging) {
    return { customer, ordersUpdated: 0 };
  }

  const orderEmail = customer.email ?? "";
  try {
    const ordersUpdated = await updateOrdersCustomerEmailByCustomerId(customerId, orderEmail);
    return { customer, ordersUpdated };
  } catch (err) {
    try {
      await updateCustomer(customerId, { email: previousEmail });
    } catch (revertErr) {
      console.error("[customer-email-sync] Failed to revert customer email after order sync error:", revertErr);
    }
    throw err;
  }
}
