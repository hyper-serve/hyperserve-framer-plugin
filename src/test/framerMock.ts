import { vi } from "vitest";

export type FakeNode = {
	__type: "ComponentInstanceNode";
	id: string;
	insertURL: string | null;
	controls: Record<string, unknown>;
	pluginData: Record<string, string>;
	getPluginData: (key: string) => Promise<string | null>;
	setPluginData: (key: string, value: string | null) => Promise<void>;
	setAttributes: ReturnType<typeof vi.fn>;
};

export const makeNode = (overrides: Partial<FakeNode> = {}): FakeNode => {
	const node: FakeNode = {
		__type: "ComponentInstanceNode",
		id: "node-1",
		insertURL: "https://framer.com/m/framer/Video.js",
		controls: {},
		pluginData: {},
		getPluginData: async (key) => node.pluginData[key] ?? null,
		setPluginData: async (key, value) => {
			if (value === null) delete node.pluginData[key];
			else node.pluginData[key] = value;
		},
		setAttributes: vi.fn(async (update: { controls?: Record<string, unknown> }) => {
			node.controls = { ...node.controls, ...update.controls };
			return node;
		}),
		...overrides,
	};
	return node;
};

export const createFramerMock = () => {
	let selectionListener: ((nodes: unknown[]) => void) | undefined;
	const inserted: FakeNode[] = [];
	return {
		inserted,
		showUI: vi.fn(async () => {}),
		notify: vi.fn(async () => "timeoutReached"),
		addComponentInstance: vi.fn(
			async ({ attributes }: { url: string; attributes?: { controls?: Record<string, unknown> } }) => {
				const node = makeNode({ id: `node-${inserted.length + 1}`, controls: attributes?.controls ?? {} });
				inserted.push(node);
				return node;
			},
		),
		getNode: vi.fn(async (id: string) => inserted.find((n) => n.id === id) ?? null),
		makeDraggable: vi.fn(() => () => {}),
		subscribeToSelection: vi.fn((listener: (nodes: unknown[]) => void) => {
			selectionListener = listener;
			return () => {
				selectionListener = undefined;
			};
		}),
		select(nodes: unknown[]) {
			selectionListener?.(nodes);
		},
	};
};
