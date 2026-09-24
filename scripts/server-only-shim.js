// Preload shim for server-only package when executing administrative or test scripts
try {
  const resolved = require.resolve("server-only");
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: {},
  };
} catch (e) {
  // Ignore if server-only cannot be resolved
}
