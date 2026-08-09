export const OPTIMIZATION_CONFIG = {
  // Composite score weights
  weights: {
    distanceWeight: 1.0,
    latenessPenaltyWeight: 10.0, // High penalty for arriving past time_slot_end
    waitingPenaltyWeight: 1.0,   // Penalty for arriving too early before time_slot_start
    priorityPenaltyWeight: 3.0,  // Higher priority orders (1=Highest, 5=Lowest) processed earlier
  },
  // Reverse logistics insertion thresholds
  reverseLogistics: {
    maxDeltaDistanceKm: 2.0,
    maxDeltaDurationMins: 10.0,
  },
  // Default matrix caching TTL in seconds
  matrixCacheTtlSeconds: 86400, // 24 hours
  // Service time at each stop in minutes
  defaultServiceTimeMins: 10,
};
