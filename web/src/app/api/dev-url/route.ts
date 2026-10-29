import { networkInterfaces } from "node:os";

function pickLanIpv4(): string | null {
  const nets = networkInterfaces();
  for (const infos of Object.values(nets)) {
    if (!infos) continue;
    for (const info of infos) {
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return null;
}

/** 開発中: 同一 Wi‑Fi のスマホから開く URL（本番では無効） */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ enabled: false as const });
  }
  const port = process.env.PORT ?? "3000";
  const ip = pickLanIpv4();
  return Response.json({
    enabled: true as const,
    url: ip ? `http://${ip}:${port}` : null,
  });
}
