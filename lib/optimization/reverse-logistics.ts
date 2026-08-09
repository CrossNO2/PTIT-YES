import { PackagingPickup, Vehicle, ShipperShift } from "@/types/database";
import { OptimizedRouteResult, OptimizedStop } from "./types";
import { OPTIMIZATION_CONFIG } from "./config";
import { haversineDistanceMeters } from "./distance-matrix";

function parseTimeSlot(timeSlot: string): number {
  if (!timeSlot) return Infinity;
  const [hours, minutes] = timeSlot.split(":").map(Number);
  return hours * 60 + minutes;
}

export function insertPickupsIntoRoute(
  route: OptimizedRouteResult,
  pickups: PackagingPickup[],
  vehicle: Vehicle,
  shift: ShipperShift | null = null
): { updatedRoute: OptimizedRouteResult; insertedPickups: string[] } {
  const insertedPickups: string[] = [];
  let stops = [...route.stops];
  let currentTotalDuration = route.totalDurationMins;

  const { maxDeltaDistanceKm, maxDeltaDurationMins } = OPTIMIZATION_CONFIG.reverseLogistics;

  for (const pickup of pickups) {
    if (pickup.status !== "pending") continue;

    let bestInsertionIndex = -1;
    let minDeltaDist = Infinity;
    let minDeltaDur = Infinity;
    let bestNewStops: OptimizedStop[] = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const stopA = stops[i];
      const stopB = stops[i + 1];

      // Calculate Haversine insertion costs: (A -> P -> B) - (A -> B)
      const distAP = haversineDistanceMeters(stopA.lat, stopA.lng, pickup.lat, pickup.lng) / 1000;
      const distPB = haversineDistanceMeters(pickup.lat, pickup.lng, stopB.lat, stopB.lng) / 1000;
      const distAB = haversineDistanceMeters(stopA.lat, stopA.lng, stopB.lat, stopB.lng) / 1000;

      const deltaDist = distAP + distPB - distAB;
      const durAP = Math.round((distAP / 25) * 60);
      const durPB = Math.round((distPB / 25) * 60);
      const durAB = Math.round((distAB / 25) * 60);
      
      const pickupServiceTime = OPTIMIZATION_CONFIG.defaultServiceTimeMins;
      const deltaDur = durAP + durPB + pickupServiceTime - durAB;

      if (deltaDist <= maxDeltaDistanceKm && deltaDur <= maxDeltaDurationMins) {
        
        // Check Shift Constraint
        if (shift && currentTotalDuration + deltaDur > shift.max_work_minutes) {
          continue; // Shift exceeded
        }

        // Simulate Insertion
        const testStops = [...stops];
        const newStop: OptimizedStop = {
          stopType: "pickup",
          pickupId: pickup.id,
          address: pickup.address,
          lat: pickup.lat,
          lng: pickup.lng,
          sequenceIndex: i + 1,
          estimatedArrivalMins: 0,
          distanceFromPreviousKm: Number(distAP.toFixed(2)),
          durationFromPreviousMins: Math.round(durAP),
          weightKg: pickup.estimated_quantity_kg,
          timeSlotStart: pickup.available_from,
          timeSlotEnd: pickup.available_until,
        };

        testStops.splice(i + 1, 0, newStop);
        
        // Adjust the stop that now comes after the pickup
        testStops[i + 2] = {
          ...testStops[i + 2],
          distanceFromPreviousKm: Number(distPB.toFixed(2)),
          durationFromPreviousMins: Math.round(durPB),
        };

        // Revalidate Capacity and Time Windows for the rest of the route
        let isValid = true;
        let currentLoad = testStops.reduce((sum, s) => s.stopType === "delivery" ? sum + s.weightKg : sum, 0);
        let currentTime = testStops[0].estimatedArrivalMins; // Start time from warehouse

        if (currentLoad > vehicle.capacity_kg) isValid = false;

        for (let j = 1; j < testStops.length; j++) {
          if (!isValid) break;
          
          const s = testStops[j];
          currentTime += s.durationFromPreviousMins;
          s.estimatedArrivalMins = currentTime;

          // Check Time Window
          const windowEnd = parseTimeSlot(s.timeSlotEnd);
          if (currentTime > windowEnd) {
            isValid = false;
            break;
          }

          // Apply Service Time
          currentTime += OPTIMIZATION_CONFIG.defaultServiceTimeMins;

          // Adjust Load
          if (s.stopType === "delivery") {
            currentLoad -= s.weightKg;
          } else if (s.stopType === "pickup") {
            currentLoad += s.weightKg;
          }

          // Check Capacity
          if (currentLoad > vehicle.capacity_kg || currentLoad < 0) {
            isValid = false;
            break;
          }
        }

        if (isValid && deltaDist < minDeltaDist) {
          minDeltaDist = deltaDist;
          minDeltaDur = deltaDur;
          bestInsertionIndex = i + 1;
          bestNewStops = testStops;
        }
      }
    }

    if (bestInsertionIndex !== -1) {
      stops = bestNewStops;
      currentTotalDuration += minDeltaDur;
      insertedPickups.push(pickup.id);

      // Re-index sequences
      stops.forEach((s, idx) => {
        s.sequenceIndex = idx;
      });
    }
  }

  const updatedTotalKm = Number(stops.reduce((acc, s) => acc + s.distanceFromPreviousKm, 0).toFixed(2));

  return {
    updatedRoute: {
      ...route,
      stops,
      totalDistanceKm: updatedTotalKm,
      totalDurationMins: currentTotalDuration,
    },
    insertedPickups,
  };
}
