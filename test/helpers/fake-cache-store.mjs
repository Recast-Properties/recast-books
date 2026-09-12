// test/helpers/fake-cache-store.mjs — an in-memory stand-in for the Netlify Blobs
// "books-cache" store (phase2.5-spec.md section 1), used by every test that exercises
// readTab/refreshTab, directly or through getPostingCtx/getUsersByEmail/getJournalAll.
//
// Passed straight to _shared.mjs's resetCacheStoreForTests(), which swaps out what
// getCacheStore() returns entirely - same shortcut resetDocsStoreForTests() uses for
// the "books-docs" store (see test/helpers/fake-docs-store.mjs's header comment for
// the harder case, a real @netlify/blobs wire-protocol fake; this store never needs
// that because readTab/refreshTab only ever call get/setJSON on it).

export function makeFakeCacheStore() {
  const items = new Map();
  return {
    items, // exposed so a test can inspect/seed a snapshot directly
    async get(key, { type } = {}) {
      const value = items.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async setJSON(key, value) {
      items.set(key, JSON.stringify(value));
    },
    async delete(key) {
      items.delete(key);
    },
  };
}
