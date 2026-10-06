const { setTimeout: sleep } = require("node:timers/promises");
const VALID_ID = /^OL\d{1,12}W$/;
const sourceUrl = (id) => `https://openlibrary.org/works/${id}`;
const catalogError = (status, message) => Object.assign(new Error(message), { status });

function createCatalogService({ fetchImpl = global.fetch, intervalMs = 1000, now = Date.now, wait = sleep } = {}) {
  const cache = new Map();
  const inflight = new Map();
  let tail = Promise.resolve();
  let pending = 0;
  let lastStarted = 0;

  const request = (url) => {
    if (pending >= 4) return Promise.reject(catalogError(503, "Book lookup is busy. Please try again shortly."));
    pending++;
    const queuedAt = now();
    const result = tail.then(async () => {
      if (now() - queuedAt > 8000) throw catalogError(503, "Book lookup is busy. Please try again shortly.");
      await wait(Math.max(0, lastStarted + intervalMs - now()));
      lastStarted = now();
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json", "User-Agent": "BookShelf/1.0 (+https://github.com/Saima-Devops/Book-Review-App)" },
        signal: AbortSignal.timeout(6000), redirect: "error",
      });
      if (response.status === 404) throw catalogError(404, "This catalog book is no longer available.");
      if (!response.ok) throw catalogError(503, "Book lookup is unavailable. You can still enter the book manually.");
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 500000) throw catalogError(503, "Book lookup returned too much data.");
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }).finally(() => { pending--; });
    tail = result.catch(() => {});
    return result;
  };

  const cached = async (key, load) => {
    const found = cache.get(key);
    if (found && found.expires > now()) return found.value;
    if (inflight.has(key)) return inflight.get(key);
    const task = load().then((value) => {
      cache.delete(key);
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: now() + 10 * 60 * 1000 });
      return value;
    }).finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
  };

  return {
    search: async (query) => {
      if (typeof query !== "string" || query.trim().length < 3 || query.trim().length > 120) {
        throw catalogError(400, "Search with a title between 3 and 120 characters.");
      }
      const title = query.trim();
      return cached(`search:${title.toLowerCase()}`, async () => {
        const url = new URL("https://openlibrary.org/search.json");
        url.searchParams.set("title", title);
        url.searchParams.set("limit", "8");
        url.searchParams.set("fields", "key,title,author_name,first_publish_year");
        const data = await request(url.href);
        if (!Array.isArray(data.docs)) throw catalogError(503, "Book lookup returned an invalid response.");
        const seen = new Set();
        return data.docs.flatMap((doc) => {
          const id = typeof doc.key === "string" ? doc.key.replace(/^\/works\//, "") : "";
          const authors = Array.isArray(doc.author_name) ? doc.author_name.filter((name) => typeof name === "string" && name.trim()).join(", ") : "";
          if (!VALID_ID.test(id) || seen.has(id) || typeof doc.title !== "string" || !doc.title.trim() || doc.title.length > 255 || !authors || authors.length > 255) return [];
          seen.add(id);
          return [{ catalogId: id, title: doc.title.trim(), author: authors, year: Number.isInteger(doc.first_publish_year) ? doc.first_publish_year : null, sourceUrl: sourceUrl(id) }];
        }).slice(0, 8);
      });
    },

    details: async (id) => {
      if (typeof id !== "string" || !VALID_ID.test(id)) throw catalogError(400, "Invalid catalog identifier.");
      return cached(`work:${id}`, async () => {
        const data = await request(`${sourceUrl(id)}.json`);
        if (data.key !== `/works/${id}`) throw catalogError(503, "Book lookup returned an invalid response.");
        const description = typeof data.description === "string" ? data.description : data.description?.value;
        let synopsis = typeof description === "string" ? description.trim() : "";
        if (synopsis.length > 2000) {
          const excerpt = synopsis.slice(0, 1997);
          const boundary = excerpt.lastIndexOf(" ");
          synopsis = `${excerpt.slice(0, boundary > 1700 ? boundary : excerpt.length)}...`;
        }
        return { catalogId: id, sourceUrl: sourceUrl(id), synopsis };
      });
    },
  };
}

module.exports = { ...createCatalogService(), createCatalogService, VALID_ID, sourceUrl };
