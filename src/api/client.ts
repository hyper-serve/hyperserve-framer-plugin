import { HyperserveClient } from "@hyperserve/hyperserve-js";
import { API_BASE_URL } from "../config";

// The user's own key, in their own browser, talking only to Hyperserve.
export const makeClient = (apiKey: string) => new HyperserveClient({ apiKey, baseUrl: API_BASE_URL, retries: 1 });
