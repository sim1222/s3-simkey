/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  MY_BUCKET: R2Bucket;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const url = new URL(request.url);
    let key = url.pathname.slice(1);
    if (key === "") {
      key = "index.html"
    }

    //GET Only
    if (request.method !== 'GET') {
      console.error(`Method Not Allowed [${request.method}]: ${key}`);
      return new Response("Method Not Allowed", { status: 405 });
    }

    
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;
    //Check Chache
    const cachedResult = await cache.match(cacheKey);
    if (cachedResult) {
      const etag = request.headers.get('If-None-Match');
      if (etag !== null && etag === cachedResult.headers.get('ETag')) {
        console.log(`304 Not Modified: ${key}`);
        return new Response(null, {
          status: 304,
          headers: cachedResult.headers,
        })
      }
      console.log(`Cache hit for: ${key}`);
      return cachedResult //Cached Response
    };

    //Get Object
    const object = await env.MY_BUCKET.get(key);

    //404
    if (!object) {
      console.error(`Object not found [${request.method}]: ${key}`);
      return new Response("Object Not Found", { status: 404 });
    }

    // console.log(`Cache Not Found: ${key}`);

    console.log(`Object requested [${request.method}] content-type: ${object.httpMetadata.contentType ?? "application/octet-stream"}: ${key}`);
    const Result = new Response(object.body, {
      headers: {
        'Cache-Control': 'max-age=14400',
        ETag: `W/${object.httpEtag}`,
        'content-type': `${object.httpMetadata.contentType ?? "application/octet-stream"}`
      }
    });

    //Save Cache
    console.log(`Saving Cache...: ${key}`)
    ctx.waitUntil(cache.put(cacheKey, Result.clone()));

    return Result;
  },
};
