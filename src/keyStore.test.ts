import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyStore } from "./keyStore";

describe("keyStore", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("uses the default account in every project once connected anywhere", () => {
		createKeyStore().connect("p1", "k1", "default");
		const store = createKeyStore();
		expect(store.keyFor("p1")).toBe("k1");
		expect(store.keyFor("p2")).toBe("k1");
		expect(store.isOverridden("p2")).toBe(false);
	});

	it("lets one project use a different account without changing the others", () => {
		const store = createKeyStore();
		store.connect("p1", "k1", "default");
		store.connect("client", "k2", "project");
		expect(store.keyFor("client")).toBe("k2");
		expect(store.isOverridden("client")).toBe(true);
		expect(store.keyFor("p1")).toBe("k1");
	});

	it("disconnecting an overridden project falls back to the default", () => {
		const store = createKeyStore();
		store.connect("p1", "k1", "default");
		store.connect("client", "k2", "project");
		store.disconnect("client");
		expect(store.keyFor("client")).toBe("k1");
	});

	it("disconnecting the default account clears it everywhere it was used, but keeps overrides", () => {
		const store = createKeyStore();
		store.connect("p1", "k1", "default");
		store.connect("client", "k2", "project");
		store.disconnect("p1");
		expect(store.keyFor("p2")).toBeNull();
		expect(store.keyFor("client")).toBe("k2");
	});

	it("keeps working in memory when localStorage throws", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		const store = createKeyStore();
		expect(() => store.connect("p1", "k1", "default")).not.toThrow();
		expect(store.keyFor("p1")).toBe("k1");
	});

	it("ignores a corrupted stored value instead of crashing", () => {
		localStorage.setItem("hyperserve.accounts", "{not json");
		expect(createKeyStore().keyFor("p1")).toBeNull();
	});
});
