/** Link the model name in translated prose without accepting HTML from a message pack. */
export default function ModelSourceText({ text }: { text: string }) {
  const name = text.includes("ournotes-deck") ? "ournotes-deck" : "Rust";
  const index = text.indexOf(name);
  if (index < 0) return text;
  return <>{text.slice(0, index)}<a className="mn-cd-model-link" href="https://github.com/empty-sekai/ournotes-deck" target="_blank" rel="noopener noreferrer" title="ournotes-deck (GitHub)">{name}</a>{text.slice(index + name.length)}</>;
}
