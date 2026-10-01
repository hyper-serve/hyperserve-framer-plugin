import { useState } from "react";
import "./styles.css";
import { keyStore } from "./keyStore";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LibraryScreen } from "./screens/LibraryScreen";

export function App() {
	const [apiKey, setApiKey] = useState<string | null>(() => keyStore.get());
	const [notice, setNotice] = useState<string>();

	if (apiKey === null) {
		return (
			<ConnectScreen
				notice={notice}
				onConnected={(key) => {
					keyStore.set(key);
					setNotice(undefined);
					setApiKey(key);
				}}
			/>
		);
	}

	return (
		<LibraryScreen
			apiKey={apiKey}
			onDisconnected={(reason) => {
				keyStore.clear();
				setNotice(reason);
				setApiKey(null);
			}}
		/>
	);
}
