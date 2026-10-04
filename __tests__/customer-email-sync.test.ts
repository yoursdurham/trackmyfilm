import { describe, it, expect, vi, beforeEach } from "vitest";
import { patchCustomerWithOrderEmailSync } from "../lib/customer-email-sync";
import type { Customer } from "../lib/types";

const mockUpdateCustomer = vi.fn();
const mockUpdateOrdersCustomerEmailByCustomerId = vi.fn();

vi.mock("@/lib/db", () => ({
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
  updateOrdersCustomerEmailByCustomerId: (...args: unknown[]) =>
    mockUpdateOrdersCustomerEmailByCustomerId(...args),
}));

const baseCustomer: Customer = {
  id: "cust-1",
  first_name: "Jane",
  last_name: "Doe",
  email: "wrongemail@gmail.com",
  total_rolls: 2,
  total_dropoffs: 2,
};

describe("patchCustomerWithOrderEmailSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs customer_email on all orders when email changes", async () => {
    mockUpdateCustomer.mockResolvedValueOnce({
      ...baseCustomer,
      email: "correctemail@gmail.com",
    });
    mockUpdateOrdersCustomerEmailByCustomerId.mockResolvedValueOnce(2);

    const result = await patchCustomerWithOrderEmailSync(
      "cust-1",
      baseCustomer,
      { email: "correctemail@gmail.com" },
    );

    expect(result.ordersUpdated).toBe(2);
    expect(mockUpdateOrdersCustomerEmailByCustomerId).toHaveBeenCalledWith(
      "cust-1",
      "correctemail@gmail.com",
    );
  });

  it("does not touch orders when email is unchanged", async () => {
    mockUpdateCustomer.mockResolvedValueOnce({ ...baseCustomer, phone: "919-555-0100" });

    const result = await patchCustomerWithOrderEmailSync(
      "cust-1",
      baseCustomer,
      { phone: "919-555-0100" },
    );

    expect(result.ordersUpdated).toBe(0);
    expect(mockUpdateOrdersCustomerEmailByCustomerId).not.toHaveBeenCalled();
  });

  it("reverts customer email if order sync fails", async () => {
    mockUpdateCustomer
      .mockResolvedValueOnce({ ...baseCustomer, email: "correctemail@gmail.com" })
      .mockResolvedValueOnce(baseCustomer);
    mockUpdateOrdersCustomerEmailByCustomerId.mockRejectedValueOnce(new Error("order update failed"));

    await expect(
      patchCustomerWithOrderEmailSync("cust-1", baseCustomer, { email: "correctemail@gmail.com" }),
    ).rejects.toThrow("order update failed");

    expect(mockUpdateCustomer).toHaveBeenCalledTimes(2);
    expect(mockUpdateCustomer.mock.calls[1][1]).toEqual({ email: "wrongemail@gmail.com" });
  });
});
