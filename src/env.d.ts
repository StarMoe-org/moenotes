/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

/** Set in astro.config.mjs: the package.json version and the commit the site was built from ("" when unknown). */
declare const __MOENOTES_BUILD__: { version: string; revision: string };
