import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyStore } from "./keyStore";

describe("keyStore", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("remembers the key across instances via localStorage", () => {
		createKeyStore().set("abc");
		expect(createKeyStore().get()).toBe("abc");
	});

	it("clears the key", () => {
		const store = createKeyStore();
		store.set("abc");
		store.clear();
		expect(store.get()).toBeNull();
	});

	it("keeps working in memory when localStorage throws", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});

		const store = createKeyStore();
		expect(() => store.set("abc")).not.toThrow();
		expect(store.get()).toBe("abc");
	});
});
