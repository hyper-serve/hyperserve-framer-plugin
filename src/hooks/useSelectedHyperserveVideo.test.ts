import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFramerMock, makeNode } from "../test/framerMock";

const framer = createFramerMock();
vi.mock("@framer/plugin", () => ({
	framer,
	isComponentInstanceNode: (n: { __type?: string } | null) => n?.__type === "ComponentInstanceNode",
}));

const { useSelectedHyperserveVideo } = await import("./useSelectedHyperserveVideo");

describe("useSelectedHyperserveVideo", () => {
	it("keeps the newer selection when an older, slower lookup resolves after it", async () => {
		let resolveSlowLookup: (value: string | null) => void = () => {};
		const slowNode = makeNode({ id: "slow", getPluginData: () => new Promise((resolve) => (resolveSlowLookup = resolve)) });
		const fastNode = makeNode({ id: "fast", pluginData: { hyperserveVideoId: "fast-video" } });

		const { result } = renderHook(() => useSelectedHyperserveVideo());

		act(() => {
			framer.select([slowNode]);
		});

		await act(async () => {
			framer.select([fastNode]);
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(result.current?.videoId).toBe("fast-video");

		// The stale lookup for the first selection finally resolves; it must not
		// overwrite the selection that already won.
		await act(async () => {
			resolveSlowLookup("slow-video");
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(result.current?.videoId).toBe("fast-video");
	});

	it("doesn't update state after unmount when a lookup resolves late", async () => {
		let resolveLookup: (value: string | null) => void = () => {};
		const node = makeNode({ getPluginData: () => new Promise((resolve) => (resolveLookup = resolve)) });

		const { result, unmount } = renderHook(() => useSelectedHyperserveVideo());

		act(() => {
			framer.select([node]);
		});

		unmount();

		// Resolving after unmount must not throw or warn about setting state on
		// an unmounted component.
		await act(async () => {
			resolveLookup("late-video");
			await Promise.resolve();
		});

		expect(result.current).toBeNull();
	});
});
