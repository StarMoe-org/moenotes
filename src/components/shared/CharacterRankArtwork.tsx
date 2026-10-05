import "@/styles/character-rank-artwork.css";

/** A character avatar with its Rank on a plate rotated 45 degrees across the top-left corner. */
export default function CharacterRankArtwork({ src, name, value, label }: {
  src: string; name: string; value: string | number; label: string;
}) {
  return <div className="mn-character-rank" role="img" aria-label={`${name} ${label} ${value}`}>
    <img src={src} alt="" width={76} height={76} crossOrigin="anonymous" loading="lazy" decoding="async" />
    <div className="mn-character-rank-badge" aria-hidden="true"><span>{label}</span><strong>{value}</strong></div>
  </div>;
}
