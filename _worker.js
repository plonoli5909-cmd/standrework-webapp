// Cloudflare Pages Advanced Mode worker для Hunter Faceit WebApp.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Проксируем /api/* на API бота Hunter Faceit
    if (url.pathname.startsWith("/api/")) {
      const origin = String(env.BOT_API_ORIGIN || "").replace(/\/$/, "");
      if (!origin) {
        return new Response("BOT_API_ORIGIN is not configured", {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      const target = origin + url.pathname + url.search;
      const headers = new Headers(request.headers);
      headers.delete("host");

      const init = {
        method: request.method,
        headers,
        redirect: "manual",
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }

      try {
        return await fetch(target, init);
      } catch (error) {
        return new Response("Hunter Faceit API is unreachable", {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    }

    // Сброс кэша HTML при смене билда — сохраняем параметры Telegram
    const BUILD = "1";
    const isHtml = url.pathname === "/" || url.pathname.endsWith("/index.html");
    if (isHtml && url.searchParams.get("v") !== BUILD) {
      url.searchParams.set("v", BUILD);
      return Response.redirect(url.toString(), 302);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    const path = url.pathname.toLowerCase();
    if (
      path === "/" ||
      path.endsWith("/index.html") ||
      path.endsWith(".js") ||
      path.endsWith(".css") ||
      path.endsWith(".json")
    ) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    }
    headers.set("X-HunterFaceit-WebApp-Version", "1");
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  },
};