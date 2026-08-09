export type EsgAggregateMetrics = {
  totalKmSaved: number;
  totalCo2SavedKg: number;
  totalPackagingCollectedKg: number;
  totalCostSavedVnd: number;
  routeCount: number;
  baselineMethod: "CREATION_ORDER_V1";
  disclaimer: string;
};

export const ESG_DISCLAIMER =
  "Các chỉ số ESG được ghi nhận dựa trên phương pháp ước tính theo hệ số định mức cấu hình của từng loại phương tiện, không phải số liệu kiểm toán carbon credit được chứng nhận độc lập.";

export function calculateEsgRouteMetrics(input: {
  naiveDistanceKm: number;
  optimizedDistanceKm: number;
  co2KgPerKm: number;
  fuelCostVndPerKm: number;
  verifiedPackagingKg: number;
}) {
  const kmSaved = Math.max(0, input.naiveDistanceKm - input.optimizedDistanceKm);
  const co2SavedKg = kmSaved * input.co2KgPerKm;
  const costSavedVnd = kmSaved * input.fuelCostVndPerKm;

  return {
    kmSaved: Number(kmSaved.toFixed(2)),
    co2SavedKg: Number(co2SavedKg.toFixed(4)),
    costSavedVnd: Number(costSavedVnd.toFixed(2)),
    packagingCollectedKg: Number(input.verifiedPackagingKg.toFixed(2)),
    emissionFactorSnapshot: input.co2KgPerKm,
    fuelCostFactorSnapshot: input.fuelCostVndPerKm,
    baselineMethod: "CREATION_ORDER_V1" as const,
    calculationVersion: 1,
    disclaimer: ESG_DISCLAIMER,
  };
}
