// Commit messages follow Conventional Commits (https://www.conventionalcommits.org) and are written in English.
// git-cliff groups them into CHANGELOG.md and the release notes; see cliff.toml for the type groups.

// Han, kana, Hangul and full-width punctuation.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "english-only": ({ header, body }) => {
          const text = [header, body].filter(Boolean).join("\n");
          const match = text.match(CJK);
          return [!match, `write the commit message in English (found "${match?.[0]}")`];
        },
      },
    },
  ],
  rules: {
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    "english-only": [2, "always"],
  },
};
