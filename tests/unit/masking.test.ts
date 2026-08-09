import { describe, it, expect } from "vitest";
import { maskCustomerName, maskPhoneNumber } from "../../lib/masking";

describe("Data Masking Utility", () => {
  it("should mask customer names correctly", () => {
    expect(maskCustomerName("Nguyễn Văn An")).toBe("Nguyễn Văn *");
    expect(maskCustomerName("Trần Thị B")).toBe("Trần Thị *");
    expect(maskCustomerName("An")).toBe("A*");
  });

  it("should mask phone numbers correctly", () => {
    expect(maskPhoneNumber("0912345789")).toBe("0912***789");
    expect(maskPhoneNumber("0987654321")).toBe("0987***321");
  });
});
