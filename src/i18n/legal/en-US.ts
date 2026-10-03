import { LEGAL_UPDATED, type LegalTexts } from "./types";

export const enUS: LegalTexts = {
  updated: LEGAL_UPDATED,
  updatedLabel: "Last updated: {date}",
  draftNotice: "Draft, pending review by the site owner.",
  documents: {
    license: {
      title: "License",
      sections: [
        { title: "Site code", paragraphs: ["The source code of this site is free software under the GNU Affero General Public License, version 3 (AGPL-3.0). The full text is the LICENSE file in the root of the repository: {repo}. If you run a modified version for others over a network, the AGPL requires you to offer them its source code."] },
        { title: "Game content", paragraphs: ["Game art, audio, text and other game data shown on this site are copyrighted by Bushiroad / Craft Egg / Ishimori and their other rights holders. They are shown here for reference and appreciation only and are not covered by the site's license. Assets made by the site itself for compatibility are licensed under CC BY-NC 4.0."] },
        {
          title: "Third-party components",
          paragraphs: ["The site is built with these components, each under its own license:"],
          items: [
            "Astro and @astrojs/react, @astrojs/check: MIT License",
            "React and React DOM: MIT License",
            "Tailwind CSS and @tailwindcss/vite: MIT License",
            "framer-motion (Motion): MIT License",
            "TypeScript: Apache License 2.0",
            "ournotes-player (story player and Live2D viewer): see its package for its license",
            "Live2D Cubism Core for Web: Live2D Proprietary Software License; loaded from Live2D's servers (or a copy) and not part of this site's code",
            "Live2D Cubism MotionSync Core (CRI): redistributable code of the Live2D Proprietary Software License Agreement, served unmodified",
            "The 3D chart previewer's renderer bundles Skia, rust-skia, zlib, libz-sys, Emscripten and parser libraries; their license texts ship with it (src/vendor/moenotes-chart-renderer/licenses)",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of Use",
      sections: [
        { title: "An unofficial fan site", paragraphs: ["This site is an unofficial, non-commercial fan database for BanG Dream! Our Notes. It is not affiliated with or endorsed by Bushiroad, Craft Egg or any other rights holder of the game."] },
        { title: "Content as is", paragraphs: ["The data is read from the game's published data and may be incomplete, outdated or wrong, and translations may be machine-made. Everything is provided as is, without any warranty. Check the game itself before relying on anything shown here."] },
        { title: "Fair use of the site", items: ["Do not overload the site, its APIs or its file servers (for example with aggressive scraping or automated mass downloads).", "Do not try to break into, disrupt or bypass the protections of the site or its services.", "Do not use the site's content in ways that infringe the rights of the game's rights holders."] },
        { title: "StarMoe accounts", paragraphs: ["Signing in uses StarMoe Passport, shared by the StarMoe sites. You are responsible for your account and the game accounts you bind to it. Accounts used for abuse may be suspended, and profiles made public can be seen by anyone."] },
        { title: "Changes", paragraphs: ["These terms may change; the date at the top shows the last change. Continuing to use the site means accepting the current version."] },
      ],
    },
    privacy: {
      title: "Privacy",
      sections: [
        {
          title: "Stored in your browser",
          paragraphs: ["The site keeps these in your browser's local storage. They never leave your device unless stated otherwise, and clearing the site's data removes them:"],
          items: [
            "Settings: language, theme, theme color, density, game server and whether to show Japanese song titles.",
            "Interface state: sidebar and filter drawer state, list views and sort orders, scroll positions, dismissed notices, the home page layout and the mini player's queue and position.",
            "Downloaded files: game data, images, audio, Live2D models and charts cached for speed and offline use (the Data tab of the settings shows and clears them).",
          ],
        },
        { title: "Analytics", paragraphs: ["The site uses Google Analytics to count visits and see which pages are used. Google receives your IP address, browser details and the pages you visit, and sets its own cookies. Blocking these scripts does not affect the site."] },
        { title: "When you sign in", paragraphs: ["Signing in goes through StarMoe Passport. The site then keeps a session cookie and reads your name, user name and avatar. If you bind game accounts, the server and player ID you enter are stored, and the game profile read for them (name, level, favorites and card) is kept; you decide whether that profile is public."] },
        { title: "Third-party requests", paragraphs: ["Pages load fonts from Google Fonts and game files from the site's asset servers; the Live2D viewer loads Live2D's Cubism Core. These servers see your IP address like any web request."] },
        { title: "Contact", paragraphs: ["Questions about your data: write to the contact address in the site footer."] },
      ],
    },
  },
};
