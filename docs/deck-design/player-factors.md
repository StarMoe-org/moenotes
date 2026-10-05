# Player growth and deck inputs

The Box stores player observations together with card cultivation. The shared player panel has editable and read-only modes, so a profile page can use the same display projection. It shows published character, item and band artwork, draws its frames and value plates with CSS, and uses the site's fonts.

## Which facts belong where

| Factor | Input or derivation | Effect |
| --- | --- | --- |
| Member identity, character, band, attribute, rarity and growth groups | Selected server's card Master | Legal card identity, growth, skill and target resolution |
| Member level, awakening and card Rank | Independent card observations | Base power and legal level limits; card Rank also derives leader skill level |
| Character level (Rank) | Player observation, independent of card level | Flat power for that character's cards |
| Total character Rank | Separate observation while incomplete; derived sum when the complete character domain is known | Its own flat power bonus |
| Character/band items and furniture | One item inventory with ownership and legal level | Character, band and attribute target registration; matching rates are combined before channel rounding |
| VIP Rank | Independent player observation | Rank bonus of the applicable power bonus type |
| Memory progress | Music progress and unlocked owned Member/Snap facts | Included in member base power; do not add it a second time |
| Snap identity, level and Rank | Independent card observations | Snap contribution; support skill levels derive from Rank rows |
| Member/Snap attribute link | Derived from the paired cards | Same-slot link bonus |
| Song attribute and favoured tags | Song and card Master | Song power terms; a tag intersection activates once |
| Physical leader slot, targets, conditions and cumulative count | Formation and referenced leader effects | Derived leader bonus; no manual same-band multiplier |
| Event identity, time snapshot and game scenario | Scenario inputs | Event parameter bonuses and PT/reward rules where applicable |
| Member Live and Gekisou skill levels | Two independent observations | Different score/skill paths; equality is an explicit user choice |
| Snap ordinary/Gekisou skills | Derived from Snap Rank rows | Support effects and trigger behaviour |
| Chart, difficulty, judgements, combo, life, luck and play assumptions | Chart/play/scenario inputs | Score and skill execution; power alone is insufficient |
| Owned versus eligible cards, positions, restrictions and objective | Box facts plus search conditions | Formation legality and the meaning of a recommendation |
| Player level | Optional profile observation | Progression/unlock requirements; no power multiplier |
| Band Rank and band attribute Rank | Optional observed profile ratings; deriving them requires the relevant owned cards, skills and items | Rating outputs, not another power multiplier |
| Character friendship | Independent pair progression | Profile/unlock progress, not Character Rank |
| Degrees, cosmetics and profile decoration | Profile ownership/display | No power term |

Player degrees use `MasterDegree`; `MasterTitle` configures the launch title screen.

## Domains and saved facts

Each server has its own catalogue and identity, built from that server's Master rows: playable characters and their Rank rows, furniture level rows (not the larger effect table, whose extra levels are not legal cultivation), VIP ranks, player level and band ratings. The total character Rank interval is the character count times the lowest and highest Rank; with 25 characters of Rank 1–50 it is 25–1250. The reward-threshold table does not bound it. Member Live/Gekisou skill levels and Rank-derived leader/Snap skill levels use the 1–5 values present in the Master.

Unknown, held with unknown level, explicitly not held and conflicting observations remain distinct. A read-only total can display a complete sum without creating a manual total observation. Optional profile ratings do not enter the strict power fragment. Decorative metadata does not invalidate unchanged power facts.

When a server's memory tables are empty, the player can explicitly record empty progress; an unanswered field remains unknown. Event selection is saved as a scenario preference and joined with the computation's event/time snapshot.

## Calculation

Percentage terms use the appropriate shared basis, are rounded separately and are added; they are not successive multipliers. Matching furniture rates are accumulated before channel rounding, so five items with the same target are rounded once rather than five times.
