/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_HYPERSERVE_API_URL?: string;
	readonly VITE_HYPERSERVE_DASHBOARD_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
