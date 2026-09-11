import http from "node:http";

/** 同一オリジン/別オリジンを作り分けるため、ポート違いの HTTP サーバを2つ立てる。 */
export async function startOriginServers(ports) {
  const servers = await Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve, reject) => {
          const server = http.createServer((req, res) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(
              `<!doctype html><html><head><title>probe ${port}${req.url}</title></head>` +
                `<body><h1>origin ${port}</h1><p>${req.url}</p></body></html>`
            );
          });
          server.on("error", reject);
          server.listen(port, "127.0.0.1", () => resolve(server));
        })
    )
  );
  return {
    origins: ports.map((p) => `http://127.0.0.1:${p}`),
    async close() {
      await Promise.all(
        servers.map((s) => new Promise((resolve) => s.close(resolve)))
      );
    },
  };
}
