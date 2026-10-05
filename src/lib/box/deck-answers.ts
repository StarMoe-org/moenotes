import { answerField, type CardBox, type CardFieldName } from "./model";

/** Linking is an explicit form choice; an unanswered peer skill is never evidence of equality. */
export function answerDeckFields(box: CardBox, keys: readonly string[], name: CardFieldName, value: number | null,
  linked: Readonly<Record<string, boolean>>, at = Date.now()): CardBox {
  const peer = name === "liveSkillLevel" ? "gekisouSkillLevel" : name === "gekisouSkillLevel" ? "liveSkillLevel" : null;
  return { ...box, cards: box.cards.map(card => {
    if (!keys.includes(card.key)) return card;
    const fields = { ...card.fields, [name]: answerField(card.fields[name], { id: crypto.randomUUID(), value, source: "deck-answer", at }) };
    if (peer && linked[card.key] === true) fields[peer] = answerField(card.fields[peer], { id: crypto.randomUUID(), value, source: "deck-answer", at });
    return { ...card, fields };
  }) };
}
