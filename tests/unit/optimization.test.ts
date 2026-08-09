import { describe, it, expect, vi } from "vitest";
import { runOptimizationEngine } from "../../lib/optimization/greedy-vrp";
import { Warehouse, Order, Vehicle } from "../../types/database";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: async () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          in: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe("Optimization Engine Unit Tests", () => {
  const mockWarehouse: Warehouse = {
    id: "wh-1",
    shop_id: "shop-1",
    name: "Kho Đống Đa",
    address: "268 Đường Láng, Hà Nội",
    lat: 21.003118,
    lng: 105.814234,
    is_default: true,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockVehicle: Vehicle = {
    id: "veh-1",
    shop_id: "shop-1",
    name: "Xe Máy Eco",
    vehicle_type: "motorbike",
    license_plate: "29-A1 12345",
    capacity_kg: 50,
    co2_kg_per_km: 0.085,
    fuel_cost_vnd_per_km: 1200,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockOrders: Order[] = [
    {
      id: "ord-1",
      shop_id: "shop-1",
      order_code: "ORD-001",
      customer_name: "Nguyễn Văn A",
      customer_phone: "0900000001",
      address: "Chùa Bộc, Hà Nội",
      lat: 21.007621,
      lng: 105.828451,
      delivery_date: "2026-08-08",
      time_slot_start: "08:00",
      time_slot_end: "12:00",
      weight_kg: 10,
      priority: 1,
      status: "ready",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it("should create optimized route for valid order within capacity", async () => {
    const result = await runOptimizationEngine(mockWarehouse, mockOrders, [mockVehicle]);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].stops.length).toBeGreaterThan(1);
    expect(result.unassignedOrders).toHaveLength(0);
  });

  it("should reject orders exceeding vehicle capacity", async () => {
    const heavyOrder: Order = { ...mockOrders[0], id: "ord-heavy", weight_kg: 150 };
    const result = await runOptimizationEngine(mockWarehouse, [heavyOrder], [mockVehicle]);
    expect(result.routes).toHaveLength(0);
    expect(result.unassignedOrders).toHaveLength(1);
    expect(result.unassignedOrders[0].reason).toBe("CAPACITY_EXCEEDED");
  });
});
