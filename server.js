const http = require("node:http");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const { handleSubscribe } = require("./subscribe");

const root = __dirname;
const port = Number(process.env.PORT) || 3001;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

async function serveFile(res, filePath) {
  try {
    const data = await fsPromises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { "content-type": mimeTypes[ext] || "application/octet-stream" });
  } catch {
    send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
  }
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/subscribe" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const result = await handleSubscribe(body.email);
      send(res, 200, JSON.stringify(result), { "content-type": "application/json; charset=utf-8" });
    } catch (error) {
      const status = error.statusCode || 500;
      send(res, status, JSON.stringify({ ok: false, error: error.message || "Something went wrong" }), {
        "content-type": "application/json; charset=utf-8",
      });
    }
    return;
  }

  let pathname = url.pathname;
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/privacy" || pathname === "/privacy/") pathname = "/privacy_policy.html";

  const filePath = path.join(root, pathname);
  if (!filePath.startsWith(root)) {
    send(res, 400, "Bad request", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    await serveFile(res, filePath);
    return;
  }

  send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
});

server.listen(port, () => {
  console.log(`DANGIT running at http://localhost:${port}`);
});
