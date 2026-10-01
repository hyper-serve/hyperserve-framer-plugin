const STORAGE_KEY = "hyperserve.accounts";

type Accounts = { default: string | null; projects: Record<string, string> };

export type KeyStore = {
	keyFor(projectId: string): string | null;
	isOverridden(projectId: string): boolean;
	connect(projectId: string, key: string, scope: "default" | "project"): void;
	disconnect(projectId: string): void;
};

const empty = (): Accounts => ({ default: null, projects: {} });

// Per browser, never in Framer project storage (collaborators can read that).
// One default account for every project, with optional per-project overrides.
export const createKeyStore = (): KeyStore => {
	let memory: Accounts = empty();

	const read = (): Accounts => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw === null) return memory;
			const parsed = JSON.parse(raw) as Partial<Accounts>;
			return { default: parsed.default ?? null, projects: parsed.projects ?? {} };
		} catch {
			return memory;
		}
	};

	const write = (accounts: Accounts) => {
		memory = accounts;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
		} catch {
			// memory only
		}
	};

	return {
		keyFor: (projectId) => {
			const accounts = read();
			return accounts.projects[projectId] ?? accounts.default;
		},
		isOverridden: (projectId) => read().projects[projectId] !== undefined,
		connect: (projectId, key, scope) => {
			const accounts = read();
			if (scope === "default") write({ ...accounts, default: key });
			else write({ ...accounts, projects: { ...accounts.projects, [projectId]: key } });
		},
		disconnect: (projectId) => {
			const accounts = read();
			const { [projectId]: override, ...projects } = accounts.projects;
			if (override !== undefined) return write({ ...accounts, projects });
			write({ ...accounts, default: null });
		},
	};
};

export const keyStore = createKeyStore();
