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

type ServiceLink = {
	name: string;
	description: string;
	href: string;
	category: string;
};

type SourceKind = "base64" | "plain";

type ParsedNode = {
	id: number;
	protocol: string;
	name: string;
	host: string;
	link: string;
};

type ConverterResult = {
	sourceKind: SourceKind;
	nodes: ParsedNode[];
	skipped: number;
	output: string;
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

const converterPlaceholder = `粘贴 Base64 订阅内容，或多行节点链接：

vmess://...
vless://...
trojan://...
ss://...`;

const serviceLinks: ServiceLink[] = [
	{
		name: "Cloudflare Dashboard",
		description: "管理 Workers、域名、日志和 Cloudflare 资源。",
		href: "https://dash.cloudflare.com/",
		category: "平台",
	},
	{
		name: "GitHub Repository",
		description: "查看 Yanxin Toolbox 的源码和提交记录。",
		href: "https://github.com/yy244584797/vite-react-template",
		category: "代码",
	},
	{
		name: "Worker Health",
		description: "检查当前 Worker 服务是否正常响应。",
		href: "/api/health",
		category: "接口",
	},
	{
		name: "Worker IP API",
		description: "查看访问者 IP、地区和 User-Agent 信息。",
		href: "/api/ip",
		category: "接口",
	},
];

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

function isExternalUrl(href: string): boolean {
	return href.startsWith("https://") || href.startsWith("http://");
}

function normalizeBase64(value: string): string {
	const compactValue = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
	const paddingLength = (4 - (compactValue.length % 4)) % 4;

	return `${compactValue}${"=".repeat(paddingLength)}`;
}

function decodeBase64Utf8(value: string): string | null {
	try {
		const decodedValue = atob(normalizeBase64(value));
		const bytes = Uint8Array.from(decodedValue, (character) =>
			character.charCodeAt(0),
		);

		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, "%20"));
	} catch {
		return value;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNodeLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && /^[a-z0-9+.-]+:\/\//i.test(line));
}

function getReadableNodeName(link: string, protocol: string, index: number): string {
	if (protocol === "vmess") {
		const decodedPayload = decodeBase64Utf8(link.replace(/^vmess:\/\//i, ""));

		if (decodedPayload) {
			try {
				const parsedPayload: unknown = JSON.parse(decodedPayload);

				if (
					isRecord(parsedPayload) &&
					typeof parsedPayload.ps === "string" &&
					parsedPayload.ps.trim().length > 0
				) {
					return parsedPayload.ps.trim();
				}
			} catch {
				return `VMess 节点 ${index + 1}`;
			}
		}
	}

	const hashIndex = link.indexOf("#");

	if (hashIndex >= 0 && hashIndex < link.length - 1) {
		return safeDecodeURIComponent(link.slice(hashIndex + 1)).trim();
	}

	return `${protocol.toUpperCase()} 节点 ${index + 1}`;
}

function getNodeHost(link: string, protocol: string): string {
	if (protocol === "vmess") {
		const decodedPayload = decodeBase64Utf8(link.replace(/^vmess:\/\//i, ""));

		if (decodedPayload) {
			try {
				const parsedPayload: unknown = JSON.parse(decodedPayload);

				if (
					isRecord(parsedPayload) &&
					typeof parsedPayload.add === "string" &&
					parsedPayload.add.trim().length > 0
				) {
					return parsedPayload.add.trim();
				}
			} catch {
				return "未知地址";
			}
		}
	}

	try {
		return new URL(link).hostname || "未知地址";
	} catch {
		return "未知地址";
	}
}

function parseSubscription(rawInput: string): ConverterResult {
	const decodedInput = decodeBase64Utf8(rawInput);
	const decodedLines = decodedInput ? getNodeLines(decodedInput) : [];
	const plainLines = getNodeLines(rawInput);
	const shouldUseDecodedInput = decodedLines.length > plainLines.length;
	const sourceKind: SourceKind = shouldUseDecodedInput ? "base64" : "plain";
	const lines = shouldUseDecodedInput ? decodedLines : plainLines;

	const nodes = lines.map<ParsedNode>((line, index) => {
		const protocol = line.slice(0, line.indexOf("://")).toLowerCase();

		return {
			id: index + 1,
			protocol,
			name: getReadableNodeName(line, protocol, index),
			host: getNodeHost(line, protocol),
			link: line,
		};
	});
	const rawLineCount = rawInput
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean).length;

	return {
		sourceKind,
		nodes,
		skipped: Math.max(rawLineCount - nodes.length, 0),
		output: nodes.map((node) => node.link).join("\n"),
	};
}

function getProtocolSummary(nodes: ParsedNode[]): string {
	const counts = nodes.reduce<Record<string, number>>((currentCounts, node) => {
		currentCounts[node.protocol] = (currentCounts[node.protocol] ?? 0) + 1;
		return currentCounts;
	}, {});
	const summary = Object.entries(counts).map(
		([protocol, count]) => `${protocol.toUpperCase()} ${count}`,
	);

	return summary.length > 0 ? summary.join(" / ") : "暂无节点";
}

function App() {
	const [results, setResults] = useState<ApiState>(initialResults);
	const [loadingKey, setLoadingKey] = useState<EndpointKey | null>(null);
	const [subscriptionInput, setSubscriptionInput] = useState("");
	const [converterResult, setConverterResult] = useState<ConverterResult | null>(
		null,
	);
	const [copyMessage, setCopyMessage] = useState("等待转换");

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

	function convertSubscription() {
		const nextResult = parseSubscription(subscriptionInput);
		setConverterResult(nextResult);
		setCopyMessage(
			nextResult.nodes.length > 0
				? `已识别 ${nextResult.nodes.length} 个节点`
				: "没有识别到节点链接",
		);
	}

	async function copyConvertedOutput() {
		if (!converterResult || converterResult.output.length === 0) {
			setCopyMessage("没有可复制的结果");
			return;
		}

		try {
			await navigator.clipboard.writeText(converterResult.output);
			setCopyMessage("已复制清洗后的节点列表");
		} catch {
			setCopyMessage("复制失败，请手动选择输出内容");
		}
	}

	function clearConverter() {
		setSubscriptionInput("");
		setConverterResult(null);
		setCopyMessage("等待转换");
	}

	return (
		<main className="toolbox">
			<section className="hero">
				<p className="eyebrow">Cloudflare Workers + React + Vite + Hono</p>
				<h1>Yanxin Toolbox</h1>
				<p className="description">运行在 Cloudflare Workers 上的个人工具站</p>
			</section>

			<section className="converter-section" aria-labelledby="converter-title">
				<div className="converter-header">
					<div>
						<p className="eyebrow">Subscription Converter</p>
						<h2 id="converter-title">订阅转换器</h2>
						<p>
							粘贴订阅内容后在浏览器内解析，自动识别 Base64 和常见节点链接，输出清洗后的多行节点列表。
						</p>
					</div>
					<span className="privacy-pill">本地处理</span>
				</div>

				<div className="converter-layout">
					<div className="converter-input">
						<label htmlFor="subscription-input">订阅内容</label>
						<textarea
							id="subscription-input"
							value={subscriptionInput}
							onChange={(event) => setSubscriptionInput(event.target.value)}
							placeholder={converterPlaceholder}
						/>
						<div className="converter-actions">
							<button type="button" onClick={convertSubscription}>
								转换订阅
							</button>
							<button type="button" className="secondary-button" onClick={clearConverter}>
								清空
							</button>
						</div>
					</div>

					<div className="converter-output">
						<div className="stat-grid">
							<div className="stat-card">
								<span>节点数量</span>
								<strong>{converterResult?.nodes.length ?? 0}</strong>
							</div>
							<div className="stat-card">
								<span>输入类型</span>
								<strong>{converterResult?.sourceKind === "base64" ? "Base64" : "Plain"}</strong>
							</div>
							<div className="stat-card">
								<span>协议分布</span>
								<strong>{getProtocolSummary(converterResult?.nodes ?? [])}</strong>
							</div>
						</div>

						<div className="node-preview">
							<div className="preview-heading">
								<h3>节点预览</h3>
								<span>{copyMessage}</span>
							</div>
							{converterResult && converterResult.nodes.length > 0 ? (
								<ul>
									{converterResult.nodes.slice(0, 6).map((node) => (
										<li key={`${node.protocol}-${node.id}`}>
											<span>{node.protocol.toUpperCase()}</span>
											<div>
												<strong>{node.name}</strong>
												<small>{node.host}</small>
											</div>
										</li>
									))}
								</ul>
							) : (
								<p className="empty-state">转换后会在这里显示节点名称、协议和地址。</p>
							)}
						</div>

						<div className="clean-output">
							<div className="preview-heading">
								<h3>清洗结果</h3>
								<button type="button" onClick={() => void copyConvertedOutput()}>
									复制结果
								</button>
							</div>
							<pre>
								{converterResult?.output ||
									"清洗后的节点链接会显示在这里，方便复制到其他客户端继续使用。"}
							</pre>
						</div>
					</div>
				</div>
			</section>

			<section className="service-section" aria-labelledby="service-title">
				<div className="section-heading">
					<h2 id="service-title">常用服务入口</h2>
				</div>
				<div className="service-grid">
					{serviceLinks.map((service) => (
						<article className="service-card" key={service.name}>
							<div>
								<span className="service-category">{service.category}</span>
								<h3>{service.name}</h3>
								<p>{service.description}</p>
							</div>
							<a
								href={service.href}
								target={isExternalUrl(service.href) ? "_blank" : undefined}
								rel={isExternalUrl(service.href) ? "noreferrer" : undefined}
							>
								打开
							</a>
						</article>
					))}
				</div>
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
