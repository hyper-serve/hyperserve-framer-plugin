import "@framer/plugin/framer.css";

import { framer } from "@framer/plugin";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";

framer.showUI({ position: "top right", width: 320, height: 520, resizable: "height" });

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
