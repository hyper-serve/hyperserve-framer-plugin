import {
	HyperserveApiError,
	HyperserveNotFoundError,
	HyperserveTimeoutError,
	HyperserveValidationError,
} from "@hyperserve/hyperserve-js";
import { describe, expect, it } from "vitest";
import { toPluginError } from "./errors";

describe("toPluginError", () => {
	it.each(["FREE_TIER_EXCEEDED", "NO_SUBSCRIPTION", "INACTIVE_SUBSCRIPTION"])(
		"treats a 403 with %s as a plan limit and keeps the server's message",
		(code) => {
			const error = new HyperserveValidationError("You have exceeded your free tier limits.", 403, {
				code,
				message: "You have exceeded your free tier limits.",
			});
			expect(toPluginError(error)).toEqual({ kind: "limit", message: "You have exceeded your free tier limits." });
		},
	);

	it("treats any other 403 as a revoked key (the auth guard answers 403 for a bad key)", () => {
		expect(toPluginError(new HyperserveValidationError("Forbidden resource", 403, {}))).toEqual({ kind: "revoked" });
	});

	it("maps 404, timeouts, network failures and 5xx", () => {
		expect(toPluginError(new HyperserveNotFoundError())).toEqual({ kind: "not_found" });
		expect(toPluginError(new HyperserveTimeoutError())).toEqual({ kind: "network" });
		expect(toPluginError(new TypeError("Failed to fetch"))).toEqual({ kind: "network" });
		expect(toPluginError(new HyperserveApiError("boom", 502))).toEqual({ kind: "unknown", message: "boom" });
	});
});
