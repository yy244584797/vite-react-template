import { useState } from "react";
import "./App.css";

type HealthResponse = {
	ok: boolean;
	service: string;
	time: string;
};

type IpResponse = {
	ip: string;
	country: string;
	userAgent: string;
};

type ConfigResponse = {
	appName: string;
	envName: string;
};

type ApiResponse = HealthResponse | IpResponse | ConfigResponse;
type EndpointKey = "health" | "ip" | "config";

type EndpointConfig<TResponse extends ApiResponse> = {
	key: EndpointKey;
	label: string;
	path: string;
	parse: (response: Response) => Promise<TResponse>;
};

type ApiState = Record<EndpointKey, string>;

const initialResults: ApiState = {
	health: "尚未请求",
	ip: "尚未请求",
	config: "尚未请求",
};

const endpoints: EndpointConfig<ApiResponse>[] = [
	{
		key: "health",
		label: "检查 Worker 状态",
		path: "/api/health",
		parse: (response) => response.json() as Promise<HealthResponse>,
	},
	{
		key: "ip",
		label: "查看访问 IP 信息",
		path: "/api/ip",
		parse: (response) => response.json() as Promise<IpResponse>,
	},
	{
		key: "config",
		label: "查看应用配置",
		path: "/api/config",
		parse: (response) => response.json() as Promise<ConfigResponse>,
	},
];

function formatJson(data: ApiResponse): string {
	return JSON.stringify(data, null, 2);
}

function App() {
	const [results, setResults] = useState<ApiState>(initialResults);
	const [loadingKey, setLoadingKey] = useState<EndpointKey | null>(null);

	async function requestEndpoint(endpoint: EndpointConfig<ApiResponse>) {
		setLoadingKey(endpoint.key);
		setResults((current) => ({
			...current,
			[endpoint.key]: "请求中...",
		}));

		try {
			const response = await fetch(endpoint.path);

			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}

			const data = await endpoint.parse(response);
			setResults((current) => ({
				...current,
				[endpoint.key]: formatJson(data),
			}));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown request error";
			setResults((current) => ({
				...current,
				[endpoint.key]: JSON.stringify({ error: message }, null, 2),
			}));
		} finally {
			setLoadingKey(null);
		}
	}

	return (
		<main className="toolbox">
			<section className="hero">
				<p className="eyebrow">Cloudflare Workers + React + Vite + Hono</p>
				<h1>Yanxin Toolbox</h1>
				<p className="description">运行在 Cloudflare Workers 上的个人工具站</p>
			</section>

			<section className="tools" aria-label="工具接口">
				{endpoints.map((endpoint) => (
					<div className="tool-panel" key={endpoint.key}>
						<button
							type="button"
							onClick={() => void requestEndpoint(endpoint)}
							disabled={loadingKey === endpoint.key}
						>
							{loadingKey === endpoint.key ? "请求中..." : endpoint.label}
						</button>
						<pre>{results[endpoint.key]}</pre>
					</div>
				))}
			</section>
		</main>
	);
}

export default App;
