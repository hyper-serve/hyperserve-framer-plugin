import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFramerMock } from "./test/framerMock";

const framer = createFramerMock();
vi.mock("@framer/plugin", () => ({ framer }));

vi.mock("./screens/LibraryScreen", () => ({
	LibraryScreen: ({
		apiKey,
		overridden,
		onDisconnected,
		onUseDifferentAccount,
	}: {
		apiKey: string;
		overridden: boolean;
		onDisconnected: (notice?: string) => void;
		onUseDifferentAccount: () => void;
	}) => (
		<div>
			<p>{`apiKey:${apiKey}`}</p>
			<p>{`overridden:${overridden}`}</p>
			<button type="button" onClick={() => onDisconnected("Your connection was removed. Connect again.")}>
				revoked
			</button>
			<button type="button" onClick={() => onDisconnected()}>
				disconnect
			</button>
			<button type="button" onClick={onUseDifferentAccount}>
				use a different account
			</button>
		</div>
	),
}));

const { App } = await import("./App");
const { keyStore } = await import("./keyStore");

describe("App", () => {
	beforeEach(() => {
		// The keyStore singleton keeps an in-memory fallback alongside
		// localStorage (Task 3's guarantee), so clearing localStorage alone
		// would leak a previous test's connect() into this one; writing the
		// empty shape resets what read() sees instead.
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: null, projects: {} }));
		framer.getProjectInfo.mockReset().mockResolvedValue({ id: "p1", name: "Site" });
		framer.getCurrentUser.mockReset().mockResolvedValue({ id: "fu1", name: "Ana" });
	});

	it("shows Connect when nothing is stored", async () => {
		render(<App />);
		expect(await screen.findByRole("button", { name: "Connect Hyperserve" })).toBeInTheDocument();
	});

	it("shows the Library for the current project once the default account is stored", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: {} }));
		render(<App />);
		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
		expect(screen.getByText("overridden:false")).toBeInTheDocument();
	});

	it("returns to Connect with the disconnect reason, and clears the key for this project", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: {} }));
		render(<App />);
		await screen.findByText("apiKey:k1");

		await userEvent.click(screen.getByRole("button", { name: "revoked" }));

		expect(await screen.findByText("Your connection was removed. Connect again.")).toBeInTheDocument();
		expect(keyStore.keyFor("p1")).toBeNull();
	});

	it("drops straight back to the Library on the default account when only this project's override is revoked", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: { p1: "k2" } }));
		render(<App />);
		expect(await screen.findByText("apiKey:k2")).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "revoked" }));

		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
		expect(screen.queryByText("Your connection was removed. Connect again.")).toBeNull();
		expect(keyStore.keyFor("p2")).toBe("k1");
	});

	it("drops straight back to the Library on the default account when disconnecting this project's override", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: { p1: "k2" } }));
		render(<App />);
		expect(await screen.findByText("apiKey:k2")).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "disconnect" }));

		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
		expect(keyStore.keyFor("p2")).toBe("k1");
	});

	it("backs out of connecting a different account to the Library on the previous key", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: {} }));
		render(<App />);
		await screen.findByText("apiKey:k1");

		await userEvent.click(screen.getByRole("button", { name: "use a different account" }));
		await screen.findByText("Connect a different account for this project");

		await userEvent.click(screen.getByRole("button", { name: "Back" }));

		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
		expect(keyStore.keyFor("p1")).toBe("k1");
	});

	it("lets this project use a different account without changing the others", async () => {
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: {} }));
		render(<App />);
		await screen.findByText("apiKey:k1");

		await userEvent.click(screen.getByRole("button", { name: "use a different account" }));
		expect(await screen.findByText("Connect a different account for this project")).toBeInTheDocument();

		await userEvent.click(screen.getByRole("button", { name: "Use an API key instead" }));
		await userEvent.type(screen.getByLabelText("API key"), "k2");
		await userEvent.click(screen.getByRole("button", { name: "Save key" }));

		expect(await screen.findByText("apiKey:k2")).toBeInTheDocument();
		expect(keyStore.keyFor("p1")).toBe("k2");
		expect(keyStore.keyFor("p2")).toBe("k1");
	});

	it("completes a first connect and stores it as the default account for every project", async () => {
		render(<App />);
		await screen.findByRole("button", { name: "Connect Hyperserve" });

		await userEvent.click(screen.getByRole("button", { name: "Use an API key instead" }));
		await userEvent.type(screen.getByLabelText("API key"), "k1");
		await userEvent.click(screen.getByRole("button", { name: "Save key" }));

		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
		expect(keyStore.keyFor("p1")).toBe("k1");
		expect(keyStore.keyFor("p2")).toBe("k1");
	});

	it("still works when the Framer user id can't be read", async () => {
		framer.getCurrentUser.mockRejectedValue(new Error("no permission"));
		render(<App />);
		expect(await screen.findByRole("button", { name: "Connect Hyperserve" })).toBeInTheDocument();
	});

	it("falls back to a fixed project id when the project info can't be read", async () => {
		framer.getProjectInfo.mockRejectedValue(new Error("no permission"));
		localStorage.setItem("hyperserve.accounts", JSON.stringify({ default: "k1", projects: {} }));
		render(<App />);
		expect(await screen.findByText("apiKey:k1")).toBeInTheDocument();
	});
});
