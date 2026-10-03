const { globSync } = require("tinyglobby");

// Next's lint plugin only uses globSync. Keep fast-glob's exact-directory behavior.
exports.globSync = (patterns, options = {}) => globSync(patterns, {
  ...options,
  expandDirectories: false,
});
