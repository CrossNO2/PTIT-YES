import { VehicleType } from "@/types/database";

export type VehicleRecommendationInput = {
  totalDistanceKm: number;
  totalWeightKg: number;
};

export type VehicleRecommendation = {
  recommendedType: VehicleType;
  reason: string;
};

export function recommendVehicleType(input: VehicleRecommendationInput): VehicleRecommendation {
  const { totalDistanceKm, totalWeightKg } = input;

  if (totalDistanceKm <= 10 && totalWeightKg <= 60) {
    return {
      recommendedType: "electric_motorbike",
      reason: "Khoảng cách < 10km và tải trọng nhẹ (<= 60kg). Khuyến nghị dùng Xe Máy Điện để tối ưu 100% CO2.",
    };
  }

  if (totalDistanceKm <= 25 && totalWeightKg <= 80) {
    return {
      recommendedType: "motorbike",
      reason: "Khoảng cách 10-25km và tải trọng <= 80kg. Khuyến nghị dùng Xe Máy Xăng truyền thống.",
    };
  }

  if (totalDistanceKm <= 40 && totalWeightKg <= 350) {
    return {
      recommendedType: "small_van",
      reason: "Khoảng cách 25-40km hoặc tải trọng lớn (> 80kg). Khuyến nghị dùng Xe Van nhỏ.",
    };
  }

  return {
    recommendedType: "light_truck",
    reason: "Khoảng cách > 40km hoặc tải trọng nặng (> 350kg). Khuyến nghị dùng Xe Tải Nhẹ.",
  };
}
