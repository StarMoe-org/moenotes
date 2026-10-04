// Commit messages follow Conventional Commits (https://www.conventionalcommits.org). git-cliff groups them into
// CHANGELOG.md and the release notes; see cliff.toml for the type groups.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
