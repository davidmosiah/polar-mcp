export type DateParamStyle = "from_to" | "fromDate_toDate" | "none";
export type DateValueFormat = "date" | "datetime";

export interface CollectionEndpointContract {
  dateParamStyle: DateParamStyle;
  dateValueFormat: DateValueFormat;
  supportedFeatures?: readonly string[];
  defaultFeatures?: readonly string[];
  featuresRequireSingleDay?: boolean;
}

// Keep this matrix aligned with https://www.polar.com/polar-api-v4/swagger.yaml.
// The live v4 training-sessions endpoint requires local date-time values (without a UTC suffix)
// even though its generated parameter description currently says "Date". The exact wire format
// is covered by an HTTP-boundary test.

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
    ...DATE_RANGE,
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
    dateParamStyle: "fromDate_toDate",
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
