import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) =>
	c.json({
		name: "Yanxin Toolbox",
		message: "Hello from Cloudflare Worker",
	}),
);

app.get("/api/health", (c) =>
	c.json({
		ok: true,
		service: "yanxin-toolbox",
		time: new Date().toISOString(),
	}),
);

app.get("/api/ip", (c) =>
	c.json({
		ip: c.req.header("cf-connecting-ip") ?? "unknown",
		country: c.req.header("cf-ipcountry") ?? "unknown",
		userAgent: c.req.header("user-agent") ?? "unknown",
	}),
);

app.get("/api/config", (c) =>
	c.json({
		appName: c.env.APP_NAME,
		envName: c.env.ENV_NAME,
	}),
);

export default app;
