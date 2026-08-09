export function maskCustomerName(name: string): string {
  if (!name || name.trim().length === 0) return "*";

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const single = parts[0];
    if (single.length <= 2) return single[0] + "*";
    return single.substring(0, single.length - 1) + "*";
  }

  // Replace last word/surname with asterisk
  const lastIndex = parts.length - 1;
  parts[lastIndex] = "*";
  return parts.join(" ");
}

export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.trim().length === 0) return "*******";
  const clean = phone.trim();

  if (clean.length < 7) {
    return clean.substring(0, 2) + "***" + clean.substring(clean.length - 1);
  }

  // E.g., 0912345789 -> 0912***789
  const prefix = clean.substring(0, 4);
  const suffix = clean.substring(clean.length - 3);
  return `${prefix}***${suffix}`;
}

export function maskOrderCustomerInfo<T extends { customer_name: string; customer_phone: string }>(order: T): T {
  return {
    ...order,
    customer_name: maskCustomerName(order.customer_name),
    customer_phone: maskPhoneNumber(order.customer_phone),
  };
}
