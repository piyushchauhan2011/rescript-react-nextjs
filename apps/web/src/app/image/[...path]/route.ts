import { createIPX, ipxFSStorage } from "ipx";
import { resolve } from "node:path";
import { repositoryRoot } from "../../../../../../scripts/db-path";

export const runtime = "nodejs";
const ipx = createIPX({
  storage: ipxFSStorage({ dir: resolve(repositoryRoot, "apps/web/public/images") }),
});

export async function GET(request: Request): Promise<Response> {
  const match = /^\/image\/(480|800|1280)\/([a-z0-9-]+\.webp)$/.exec(new URL(request.url).pathname);
  if (!match) {
    return new Response("Image not found", { status: 404 });
  }
  try {
    const { data } = await ipx(match[2], { w: match[1], f: "webp", q: "72" }).process();
    return new Response(typeof data === "string" ? data : new Uint8Array(data), {
      headers: {
        "content-type": "image/webp",
        "cache-control": "public, max-age=604800",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 404) {
      return new Response("Image not found", { status: 404 });
    }
    throw error;
  }
}
