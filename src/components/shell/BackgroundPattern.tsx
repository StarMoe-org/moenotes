import type { CSSProperties } from "react";
import BackgroundPatternDrift from "@/components/shell/BackgroundPatternDrift";
import { PATTERN_LAYERS, PATTERN_TILE_H, PATTERN_TILE_W, type PatternShape } from "@/lib/shell/background-pattern";

const toneClass = (shape: PatternShape) => `mn-brand-pattern-${shape.tone}`;
const speeds = PATTERN_LAYERS.map((layer) => layer.speed).join(",");

export default function BackgroundPattern() {
  return (
    <>
      <div aria-hidden="true" className="mn-brand-wash" />
      <div aria-hidden="true" className="mn-brand-pattern" data-speeds={speeds}>
        <svg viewBox="0 0 1600 900" preserveAspectRatio="none" className="mn-brand-pattern-facets">
          <polygon points="0,0 380,0 0,820" fillOpacity="0.9" />
          <polygon points="250,0 1600,0 1600,380 1040,250" fillOpacity="0.55" />
          <polygon points="120,900 1040,250 1600,380 1600,900" fillOpacity="0.75" />
        </svg>
        {PATTERN_LAYERS.map((layer, index) => (
          <div
            key={index}
            className="mn-brand-pattern-layer"
            data-blur={layer.blur > 0 ? "" : undefined}
            style={
              layer.blur > 0
                ? ({ "--mn-brand-pattern-blur": String(layer.blur / PATTERN_TILE_H) } as CSSProperties)
                : undefined
            }
          >
            {[0, 1].map((copy) => (
              <svg
                key={copy}
                viewBox={`0 0 ${PATTERN_TILE_W} ${PATTERN_TILE_H}`}
                preserveAspectRatio="xMidYMid slice"
                className="mn-brand-pattern-tile"
              >
                {layer.blur > 0 && (
                  <filter
                    id={`mn-brand-pattern-blur-${index}-${copy}`}
                    filterUnits="userSpaceOnUse"
                    x="0"
                    y="0"
                    width={PATTERN_TILE_W}
                    height={PATTERN_TILE_H}
                  >
                    <feGaussianBlur stdDeviation={layer.blur} />
                  </filter>
                )}
                <g filter={layer.blur > 0 ? `url(#mn-brand-pattern-blur-${index}-${copy})` : undefined}>
                  {layer.shapes.map((shape, shapeIdx) => {
                    const opacity = shape.alpha.toFixed(2);
                    if (shape.kind === "ring") {
                      return (
                        <circle
                          key={shapeIdx}
                          cx={shape.x.toFixed(1)}
                          cy={shape.y.toFixed(1)}
                          r={shape.r.toFixed(1)}
                          className={`${toneClass(shape)} mn-brand-pattern-stroke`}
                          strokeOpacity={opacity}
                        />
                      );
                    }
                    if (shape.kind === "dot") {
                      return (
                        <circle
                          key={shapeIdx}
                          cx={shape.x.toFixed(1)}
                          cy={shape.y.toFixed(1)}
                          r={shape.r.toFixed(1)}
                          className={toneClass(shape)}
                          fillOpacity={opacity}
                        />
                      );
                    }
                    if (shape.kind === "triangle") {
                      return (
                        <polygon
                          key={shapeIdx}
                          points={shape.points}
                          className={toneClass(shape)}
                          fillOpacity={opacity}
                        />
                      );
                    }
                    return (
                      <polygon
                        key={shapeIdx}
                        points={shape.points}
                        className={`${toneClass(shape)} mn-brand-pattern-stroke`}
                        strokeOpacity={opacity}
                      />
                    );
                  })}
                </g>
              </svg>
            ))}
          </div>
        ))}
      </div>
      <BackgroundPatternDrift />
    </>
  );
}
