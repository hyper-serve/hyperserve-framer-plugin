import {
	HyperserveError,
	HyperserveNotFoundError,
	HyperserveTimeoutError,
	HyperserveValidationError,
} from "@hyperserve/hyperserve-js";

export type PluginError =
	| { kind: "revoked" }
	| { kind: "limit"; message: string }
	| { kind: "not_found" }
	| { kind: "network" }
	| { kind: "unknown"; message: string };

const PLAN_LIMIT_CODES = new Set(["FREE_TIER_EXCEEDED", "NO_SUBSCRIPTION", "INACTIVE_SUBSCRIPTION"]);

// The server answers 403 both for a bad key and for plan limits, so the body's
// code tells them apart.
export const toPluginError = (error: unknown): PluginError => {
	if (error instanceof HyperserveValidationError && error.statusCode === 403) {
		const code = (error.detail as { code?: string } | undefined)?.code;
		return code !== undefined && PLAN_LIMIT_CODES.has(code)
			? { kind: "limit", message: error.message }
			: { kind: "revoked" };
	}
	if (error instanceof HyperserveNotFoundError) return { kind: "not_found" };
	if (error instanceof HyperserveTimeoutError) return { kind: "network" };
	if (error instanceof HyperserveError) return { kind: "unknown", message: error.message };
	if (error instanceof TypeError) return { kind: "network" };
	return { kind: "unknown", message: "Something went wrong. Try again." };
};
