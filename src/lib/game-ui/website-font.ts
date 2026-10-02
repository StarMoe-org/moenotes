import type { UIPack } from "ournotes-player/ui";

/** Keep painted UI resources, but let Canvas text use the site's already loaded font stack. */
export function withWebsiteUiFont(pack: UIPack, fontFamily = "sans-serif"): UIPack {
  const textureRefs = new Set<string>(Object.values(pack.resources.sprites ?? {}).map(sprite => sprite.textureRef));
  for (const node of pack.document.nodes ?? []) for (const component of node.components ?? []) {
    if ((component.class ?? component.type) === "RawImage" && component.m_Texture?.textureRef) textureRefs.add(component.m_Texture.textureRef);
  }
  if (typeof pack.document.textureRef === "string") textureRefs.add(pack.document.textureRef);
  const { fonts: _fonts, fontMetrics: _metrics, fontMetricsByAsset: _byAsset, ...resources } = pack.resources;
  return { ...pack, resources: { ...resources, browserFontFamily: fontFamily,
    textures: Object.fromEntries(Object.entries(resources.textures ?? {}).filter(([ref]) => textureRefs.has(ref))) } };
}
