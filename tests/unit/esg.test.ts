import { describe, it, expect } from "vitest";
import { calculateEsgRouteMetrics, ESG_DISCLAIMER } from "../../lib/esg";

describe("ESG Reporting Engine Calculation", () => {
  it("should calculate correct km_saved and co2_saved with vehicle snapshots", () => {
    const res = calculateEsgRouteMetrics({
      naiveDistanceKm: 50.0,
      optimizedDistanceKm: 35.0,
      co2KgPerKm: 0.15,
      fuelCostVndPerKm: 3000,
      verifiedPackagingKg: 20.0,
    });

    expect(res.kmSaved).toBe(15.0);
    expect(res.co2SavedKg).toBe(2.25);
    expect(res.costSavedVnd).toBe(45000.0);
    expect(res.packagingCollectedKg).toBe(20.0);
    expect(res.emissionFactorSnapshot).toBe(0.15);
    expect(res.baselineMethod).toBe("CREATION_ORDER_V1");
    expect(res.disclaimer).toBe(ESG_DISCLAIMER);
  });
});
