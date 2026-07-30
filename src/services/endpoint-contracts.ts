export type DateParamStyle = "from_to" | "fromDate_toDate" | "none";
export type DateValueFormat = "date" | "datetime";

export interface CollectionEndpointContract {
  dateParamStyle: DateParamStyle;
  dateValueFormat: DateValueFormat;
  supportedFeatures?: readonly string[];
  defaultFeatures?: readonly string[];
  featuresRequireSingleDay?: boolean;
}

// Keep this matrix aligned with https://www.polar.com/polar-api-v4/swagger.yaml and live curl checks.
// The live v4 training-sessions and calendar list endpoints require local date-time values
// (without a UTC suffix) even though generated parameter descriptions may say "Date".
// Training-target calendar-targets wants plain from/to dates (not fromDate/toDate).
// Wire formats are covered by scripts/date-range-test.mjs and scripts/endpoint-contract-test.mjs.

const DATE_RANGE: CollectionEndpointContract = {
  dateParamStyle: "from_to",
  dateValueFormat: "date"
};

const NO_RANGE: CollectionEndpointContract = {
  dateParamStyle: "none",
  dateValueFormat: "date"
};

const COLLECTION_ENDPOINT_CONTRACTS: Record<string, CollectionEndpointContract> = {
  "/activity/list": {
    ...DATE_RANGE,
    supportedFeatures: ["samples", "activity-target", "physical-information"],
    featuresRequireSingleDay: true
  },
  "/calendar/list": {
    // Live AccessLink rejects plain YYYY-MM-DD the same way training-sessions does;
    // confirmed via curl: date → 400 "could not be parsed as datetime", naive local datetime → 200.
    dateParamStyle: "from_to",
    dateValueFormat: "datetime",
    supportedFeatures: ["notes", "feeling", "feedback", "perceived-recovery", "weight", "physical-information"]
  },
  "/continuous-samples": {
    ...DATE_RANGE,
    supportedFeatures: ["heart-rate-samples"]
  },
  "/nightly-recharge-results": {
    ...DATE_RANGE,
    supportedFeatures: ["samples"],
    featuresRequireSingleDay: true
  },
  "/ppi-samples": {
    ...DATE_RANGE,
    supportedFeatures: ["samples"],
    featuresRequireSingleDay: true
  },
  "/skin-contacts": DATE_RANGE,
  "/sleeps": {
    ...DATE_RANGE,
    supportedFeatures: ["sleep-result", "original-sleep-result", "sleep-evaluation", "sleep-score"],
    defaultFeatures: ["sleep-result", "sleep-evaluation", "sleep-score"],
    featuresRequireSingleDay: true
  },
  "/sleep-wake-vectors": DATE_RANGE,
  "/sports/list": NO_RANGE,
  "/sports/profile-list-catalog": NO_RANGE,
  "/sports/profiles": NO_RANGE,
  "/subscriptions": NO_RANGE,
  "/temperature-measurements": DATE_RANGE,
  "/tests/list": {
    ...DATE_RANGE,
    supportedFeatures: ["samples"],
    featuresRequireSingleDay: true
  },
  "/training-sessions/list": {
    dateParamStyle: "from_to",
    dateValueFormat: "datetime",
    supportedFeatures: [
      "samples",
      "test-results",
      "training-load-report",
      "laps",
      "hill-splits",
      "routes",
      "statistics",
      "zones",
      "pause-times",
      "strength-training-results",
      "comments",
      "physical-info"
    ],
    featuresRequireSingleDay: true
  },
  "/training-target/calendar-targets": {
    // Live endpoint requires from/to (plain date), not fromDate/toDate — confirmed via curl:
    // fromDate/toDate → 400 "Query parameter 'from' is required"; from/to datetime → 400 date parse; from/to date → 200.
    dateParamStyle: "from_to",
    dateValueFormat: "date"
  },
  "/training-target/favorites": NO_RANGE,
  "/user-devices": NO_RANGE
};

export function getCollectionEndpointContract(path: string): CollectionEndpointContract {
  const contract = COLLECTION_ENDPOINT_CONTRACTS[path];
  if (!contract) {
    throw new Error(`Missing Polar v4 collection contract for endpoint: ${path}`);
  }
  return contract;
}
