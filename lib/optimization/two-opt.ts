import { OptimizedStop, DistanceMatrixMap } from "./types";

export function calculateRouteDistanceKm(stops: OptimizedStop[]): number {
  let totalKm = 0;
  for (let i = 1; i < stops.length; i++) {
    totalKm += stops[i].distanceFromPreviousKm;
  }
  return Number(totalKm.toFixed(2));
}

export function runTwoOptOptimization(
  stops: OptimizedStop[],
  matrixMap: DistanceMatrixMap,
  pointIndexMap: Map<string, number>
): OptimizedStop[] {
  // Need at least 4 stops (warehouse -> stop1 -> stop2 -> warehouse) to perform 2-opt swap
  if (stops.length < 4) return stops;

  let bestStops = [...stops];
  let improved = true;
  let maxIterations = 50;

  while (improved && maxIterations > 0) {
    improved = false;
    maxIterations--;

    for (let i = 1; i < bestStops.length - 2; i++) {
      for (let j = i + 1; j < bestStops.length - 1; j++) {
        // Perform 2-opt swap of subsegment i...j
        const candidateStops = twoOptSwap(bestStops, i, j);
        recalculateStopsMetrics(candidateStops, matrixMap, pointIndexMap);

        const currentDist = calculateRouteDistanceKm(bestStops);
        const candidateDist = calculateRouteDistanceKm(candidateStops);

        if (candidateDist < currentDist) {
          bestStops = candidateStops;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return bestStops;
}

function twoOptSwap(stops: OptimizedStop[], i: number, j: number): OptimizedStop[] {
  const newStops: OptimizedStop[] = [];

  // 1. Take 0 to i-1 in original order
  for (let c = 0; c < i; c++) {
    newStops.push({ ...stops[c] });
  }

  // 2. Take i to j in reverse order
  for (let c = j; c >= i; c--) {
    newStops.push({ ...stops[c] });
  }

  // 3. Take j+1 to end in original order
  for (let c = j + 1; c < stops.length; c++) {
    newStops.push({ ...stops[c] });
  }

  return newStops;
}

export function recalculateStopsMetrics(
  stops: OptimizedStop[],
  matrixMap: DistanceMatrixMap,
  pointIndexMap: Map<string, number>
): void {
  let currentTimeMins = 8 * 60; // Start shift at 08:00 AM (480 mins)

  for (let k = 0; k < stops.length; k++) {
    stops[k].sequenceIndex = k;

    if (k === 0) {
      stops[k].distanceFromPreviousKm = 0;
      stops[k].durationFromPreviousMins = 0;
      stops[k].estimatedArrivalMins = currentTimeMins;
      continue;
    }

    const prevId = stops[k - 1].orderId || stops[k - 1].pickupId || "wh";
    const currId = stops[k].orderId || stops[k].pickupId || "wh";

    const fromIdx = pointIndexMap.get(prevId) ?? 0;
    const toIdx = pointIndexMap.get(currId) ?? 0;

    const cell = matrixMap.get(`${fromIdx}-${toIdx}`) || { distanceMeters: 5000, durationSeconds: 600 };
    const distKm = Number((cell.distanceMeters / 1000).toFixed(2));
    const durMins = Math.round(cell.durationSeconds / 60);

    stops[k].distanceFromPreviousKm = distKm;
    stops[k].durationFromPreviousMins = durMins;

    currentTimeMins += durMins + 10; // Service time 10 mins
    stops[k].estimatedArrivalMins = currentTimeMins;
  }
}
