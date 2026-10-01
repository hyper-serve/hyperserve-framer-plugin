import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./screens/LibraryScreen", () => ({
	LibraryScreen: ({ onDisconnected }: { onDisconnected: (notice?: string) => void }) => (
		<button type="button" onClick={() => onDisconnected("Your connection was removed. Connect again.")}>
			library
		</button>
	),
}));

const { App } = await import("./App");

describe("App", () => {
	afterEach(() => localStorage.clear());

	it("shows Connect when no key is stored", () => {
		render(<App />);
		expect(screen.getByRole("button", { name: "Connect Hyperserve" })).toBeInTheDocument();
	});

	it("shows the Library when a key is stored, and returns to Connect with the reason when disconnected", async () => {
		localStorage.setItem("hyperserve.apiKey", "k");
		render(<App />);

		fireEvent.click(screen.getByRole("button", { name: "library" }));

		expect(await screen.findByText("Your connection was removed. Connect again.")).toBeInTheDocument();
		expect(localStorage.getItem("hyperserve.apiKey")).toBeNull();
	});
});
