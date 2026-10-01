const STORAGE_KEY = "hyperserve.apiKey";

export type KeyStore = { get(): string | null; set(key: string): void; clear(): void };

// Framer recommends localStorage for per-user tokens. Some browsers block it in
// iframes; then the key lasts for this session only.
export const createKeyStore = (): KeyStore => {
	let memory: string | null = null;
	return {
		get() {
			try {
				return localStorage.getItem(STORAGE_KEY) ?? memory;
			} catch {
				return memory;
			}
		},
		set(key) {
			memory = key;
			try {
				localStorage.setItem(STORAGE_KEY, key);
			} catch {
				// memory only
			}
		},
		clear() {
			memory = null;
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch {
				// nothing stored
			}
		},
	};
};

export const keyStore = createKeyStore();
