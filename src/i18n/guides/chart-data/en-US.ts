import type { ChartDataGuide } from "./index";

// ournotes-player examples/songs/text.js GUIDE, as it is.
export const enUS: ChartDataGuide = {
  title: "Definitions, derivations and conditions",
  lead: "The figures on this page are sourced from the game client's decompiled code: ournotes-deck simulates every chart's whole live (once with Gekisou on, once off) after the score logic read from it, and the results are music-data.json's deck statistics. "
    + "We aim for them to be correct but cannot guarantee it: our reading of the decompiled code, the model's simplifications and the data version can all be wrong. Where this page disagrees with other sites, tools or real plays, the mistake is most likely ours; trust them. "
    + "Below: each quantity's definition, derivation and conditions; the mechanisms the model leaves out have their own section.",
  sections: [
    {
      title: "Score model",
      body: [
        "The page's score figures follow the play scenario chosen (section 2). The default is the best case of Gekisou Live (撃奏ライブ, the multiplayer mode of up to 5 players): Gekisou on, the fevers with the song's Gekisou missions make the Gekisou ranges, and all three ranges take the rank-1 bonus. The other scenario is Free Live: by the decompiled code, Free Live and Challenge Live play without Gekisou (solo Gekisou is a debug switch with no way in in the release), and by this model solo scores are much lower. "
          + "Both are simulated in theoretical best play: every judged note hit at its exact time, a full combo, life never at zero; in Gekisou Live Just inside the Gekisou Just mission ranges and Perfect elsewhere. Section 6 has the accuracy approximations. "
          + "The live is simulated frame by frame after the decompiled code (ournotes-deck live::full): frames, score frames (40 ms), combo and Gekisou combo factors, the skills' execute and finish frames. The page's deck model is the plain score-up skill: effect 2000, 5 s, the whole deck, no condition. A deck scores",
      ],
      math: [
        "S = P · ( base + Σ_k x_{π(k)} · w_k )",
        "base = score / P₀,   w_k = (score with a factor-1 skill at position k − score) / P₀,   P₀ = 300000",
      ],
      after: [
        "score is the model's no-skill score (in Gekisou Live with the range rank bonuses), w_k the score a factor-1 plain skill (value 10000, +100 %) on the member at position k adds over the whole live; both per point of the measurement power P₀. "
          + "The value becomes a factor with a floor (⌊value/10000 × 10⁵⌋/10⁵) and every note score is floored, so the formula holds up to the floors: for every seed deck plays a random deck of real skill values at another power (1000003) through the whole live, and a chart whose deviation exceeds the bound fails. All 340 current charts pass. "
          + "This check only shows that the formula agrees with the simulation, not that the simulation agrees with the game.",
        "Every song has three Gekisou missions (combo, luck or Just, set per song and shared by every difficulty), one for each of the chart's three fevers in order. Just judgements are only on inside Just mission ranges, so the songs without a Just mission (41 of 85: 21 all combo, 20 all luck) have no Just all live; "
          + "27 songs have three Just missions, and 17 have one each of combo, luck and Just.",
        "By this model Gekisou weighs a lot: against Gekisou off, an Expert chart's no-skill score is 1.6–4.7 times higher (median 2.4). Most of it is the range rank bonus (MasterLiveGekisouRankingScoreBonus): every completed range adds a percentage of its own score, looked up by rank, rank 1 by default; "
          + "that is 250 % on the songs whose three missions are the same (68 of 85) and 370 % on those whose three missions all differ (17), and in multiplayer even rank 5 gets 100 %. At rank 1 it makes 36–69 % (median 53 %) of an Expert chart's base. "
          + "Next come the Just judgements inside Just mission ranges (230 %, against 100 % for a Perfect): charts with long ranges and many Just notes gain the most, and the 4.7 times chart has three Just ranges of about 52 s in all with 233 Just notes; the Gekisou combo factor of combo mission ranges matters little without Gekisou skills (about 1 %). "
          + "A skill inside a Gekisou range raises the rank bonus too, so the positions inside ranges weigh much more.",
        "Luck mission ranges draw their lottery and luck rushes from the live's random seed. Charts with a luck range (148 of 340) come with the first 8 published seeds; the page takes the mean over the seeds and shows the seeds' base range in the details (1.3 % apart at the median, 4.2 % at most). "
          + "The game's seed law is unknown, so the seed mean need not equal the game's own expectation.",
      ],
    },
    {
      title: "Play scenarios and ranks",
      body: [
        "In Gekisou Live every Gekisou range ranks the players of the room by that range's mission measure (combo, luck points or Just count), equal values sharing a rank; a completed range adds a percentage of its own score as the rank bonus (MasterLiveGekisouRankingScoreBonus, looked up by mission mode and rank, smaller for lower ranks). "
          + "The page takes a rank 1–5 for each of the three ranges, rank 1 everywhere by default, the best case. The ranks are not simulated again but follow from the rank-1 simulation linearly:",
      ],
      math: [
        "base_r = ( score − Σ_i B_i + Σ_i trunc( RS_i · p_i(r_i) / 100 ) ) / P₀",
        "w_r[k] = w[k] + Σ_i ( p_i(r_i) − p_i(1) ) / 100 · u_i[k]",
      ],
      after: [
        "RS_i is range i's score, p_i(r) range i's bonus percent at rank r, B_i = trunc(RS_i · p_i(1) / 100) the rank-1 bonus (every range of every seed of the current data meets this), and u_i[k] the score the skill at position k adds to range i, per P₀. "
          + "Why: by the decompiled code the bonus is added once at the range's end and leaves the score factors of the notes after it alone, and the rank reaches one skill condition only (7012), which no skill of the current master data uses. So by this model a rank changes the bonus term only; w_r is off by the skill floors, less than 3/P₀. deck also runs whole lives at random ranks against these formulas, and the current data stays within the error bound. "
          + "By this model the no-skill score at rank 1 in all three ranges is 1.25–1.65 times that at rank 5 (340 charts, median 1.46).",
        "The Free Live figures come from a separate whole-live simulation with Gekisou off, not from Gekisou Live minus the bonuses: without Gekisou there are no Just judgements, Gekisou combo factor or luck rushes either. Without Gekisou there is no luck lottery, and the page's skill has no probability condition, so every chart has one seed; "
          + "charts with more than 3 fevers, unplayable in Gekisou Live, are computed as usual in Free Live.",
        "By the decompiled code, Gekisou Live reports two scores: one with every Gekisou effect (Just, luck, the Gekisou combo and the rank bonuses), which the page's Gekisou Live figures stand for; the other without any Gekisou effect, kept as the song's best score, by this model about the Free Live score. The chart details show both. "
          + "How the server uses the two (for event points, say) is not in the client code.",
      ],
    },
    {
      title: "The skill order is random",
      body: [
        "From the decompiled code: at the start of every live the client builds MemberDataContainer; the skill order is set to 0…n−1 and Fisher–Yates shuffled with the MemberShuffle random stream, seeded from the client clock (a solo retry keeps the seed, and the order). "
          + "Skill event e fires the member at position e of the shuffled order, and the snap skill lists follow the same order. So the page takes π as uniform over the 5! = 120 orders; the deck's slot order is not a choice.",
      ],
      math: [
        "E[S] / P = base + x̄ · W,   x̄ = (1/n) Σ_i x_i,   W = Σ_k W_k",
        "Var[S / P] = (1/(n−1)) · Σ_i (x_i − x̄)² · Σ_k (W_k − W̄)²",
      ],
      after: [
        "First: the expectation depends on the mean skill value only, not on how the values are spread over members or who stands where. The strongest skill on the heaviest position is the best of the 120 orders, an upper bound, not the expectation.",
        "Second: the spread is the product of the skills' spread and the position weights' spread; five equal skills score the same every live. By this model, with skills [140, 100, 60, 30, 0] % over every Expert chart, the best and the worst order differ by 15.4 % at the median and 29.2 % at most, and the best order is 7.6 % (median) above the expectation; the Gekisou ranges pull the position weights apart, so the order matters far more than without Gekisou. "
          + "The page shows the expectation, the range over the 120 orders and P10.",
      ],
    },
    {
      title: "Efficiency and dominance",
      body: ["A play takes T = L + c: L is the BGM length (the ACB cue length, audio not decoded) or the chart length (last note + 1 s, the music length of the score code), c the time outside the song. "
        + "When a live hands over to the results on a device is not measured yet, so both L are offered and every result holds for each."],
      math: [
        "efficiency = E[S] / (P · T) = (base + x̄ W) / (L + c)",
        "a ≻ b  ⇔  ∀ x̄ ∈ [0, x_max], ∀ c ≥ 0:  S_a(x̄)/(L_a + c) ≥ S_b(x̄)/(L_b + c), strictly somewhere",
      ],
      after: [
        "For a fixed x̄ the difference times (L_a + c)(L_b + c) is linear in c, and for a fixed c it is linear in x̄, so four corners decide: S_a ≥ S_b and S_a/L_a ≥ S_b/L_b at x̄ = 0 and at x̄ = x_max. "
          + "x_max = 150 %, the largest single skill value in the master data (MasterLiveSkillEffect, level 5). Without a bound, some Easy charts stay on the frontier only for skill values above 500 %, which do not exist.",
        "Within this model the frontier (the charts nothing beats) does not depend on x̄ and c: for any of them the best chart is on it; a ranking for given parameters is one ordering of it. "
          + "Another play scenario, rank or Just rate changes every chart's figures, and the frontier may change with them; the Great share is one factor for every chart and leaves it alone. On the current data, Gekisou Live at rank 1, the frontier holds 2 of the 340 charts for either L.",
        "The comparison assumes the deck has the same power on both songs. Card song-type (musicType) and tag bonuses make P depend on the song; then compare P_a S_a with P_b S_b.",
      ],
    },
    {
      title: "Score ranks and events",
      body: [
        "Rank thresholds are per song: MasterLiveMusic._liveScoreRankGroup selects rows of MasterLiveScoreRank, shared by every difficulty; the rank is the highest threshold the score reaches. "
          + "Free Live uses the solo threshold R (_requiredScore). Gekisou Live has thresholds of its own, R_battle (_battleLiveRequiredScore), and rates the sum of every player's score in the room against trunc(√(5/n) · R_battle · n) for n connected players, E counting as D. "
          + "In Gekisou Live the page takes a room of n players (5 by default, 1–5) who all score the same as you, so you need about √(5/n) · R_battle; teammates scoring above or below you lower or raise what you actually need.",
        "In the decompiled code event points are computed as below; v comes from the (event, rank) table, the bonus from the deck, and the rate is 5k for k boosts spent, 1 for none:",
      ],
      math: [
        "points = trunc( (10000 + bonus) · rate · v(event, rank) / 10000 )",
        "by time:  max_s  Σ_r v(r) · Pr_s(rank = r) / (L_s + c)",
        "a ≻_event b  ⇔  L_a ≤ L_b  and  ∀ r, ∀ x̄ ∈ [0, x_max]:  S_a(x̄)/R_a(r) ≥ S_b(x̄)/R_b(r)",
      ],
      after: [
        "The song enters the points only through the rank, so the points a boost buys do not depend on the song; songs differ only in their rank chances and their length. "
          + "Event dominance needs no point table, only v non-decreasing in the rank: when it holds, any deck needs no more power on a than on b for any rank, and a is no longer.",
        "The table can be recovered without the master data: bonus and rate of a live are known, so v = points × 10000 / ((10000 + bonus) × rate) with a truncation error below 1/rate; one result per rank determines v.",
        "The chance is the share of the 120 skill orders with P · S_π ≥ R (S with the accuracy approximation of section 6); the power needed uses the expectation, its range the best and the worst order. "
          + "By this model, with every skill at 140 %, in Gekisou Live at rank 1 in a room of 5, SS on Expert needs 0.27 to 2.05 million power, a factor 7.5. A least-squares fit through the origin of the SS thresholds against this model's score capacity leaves a median relative residual of about 32 %: the thresholds do not seem to be set by capacity, so event choices are best computed song by song rather than read straight off the efficiency ranking. "
          + "For 20 of the 85 songs SS is easier on Hard than on Expert.",
      ],
    },
    {
      title: "Judgements and accuracy",
      body: ["Judgement factors: Perfect 100 %, Great 80 %, Good 50 %, Bad and Miss 0 and a combo break; Just 230 %, only possible inside the Just mission ranges of Gekisou Live. The page's two accuracy sliders are both approximations, and neither has combo breaks:"],
      math: [
        "g(q) = 1 − 0.2 q",
        "X(j) = X_P + j · (X_J − X_P),   X ∈ { the whole-live score without rank bonuses N,  the range scores RS_i }",
        "S ≈ g(q) · [ N(j) + Σ_i trunc( RS_i(j) · p_i(r_i) / 100 ) ]",
        "w_k ≈ g(q) · [ w_r[k] + Σ_i ( ρ_i − 1 ) · ( 1 + p_i(r_i) / 100 ) · u_i[k] ],   ρ_i = RS_i(j) / RS_i",
      ],
      after: [
        "The Great share q applies to every note: with Perfects and Greats only (no break) and a Great chance q that does not depend on the note, plain notes and rank bonuses scale by g(q), and the page applies that factor to every score figure (efficiency, the power needed, the chance and the details). "
          + "Notes inside Just ranges do not quite: a Great there falls from 230 % to 80 %, far more than 20 %, so the factor is optimistic on charts with much Just range.",
        "The Just rate j applies to the Just mission ranges of Gekisou Live only: deck runs the live once more with Perfects instead of Justs in those ranges and no skills (X_P), the page interpolates linearly by j between it and the all-Just run (X_J), recomputes the rank bonuses on the interpolated range scores (the floor formula of section 2) and applies g(q). "
          + "The skill position weights are scaled by the same ratio ρ_i inside every range, again an approximation. At j = 100 % and q = 0 the figures are those of sections 1 and 2; Free Live has no Just, only the Great share.",
        "Breaks do not meet the condition: the combo and Gekisou combo factors depend on the running combo and a break fails a combo mission range, so a break costs differently at different notes (the deck statistics do not export a chart's break-cost distribution yet). "
          + "Judgement conversion (12006, 13005) turns Greats into Perfects, lowering q; recovery and guard skills change the score only once life reaches zero (every note × 0.3 after that).",
      ],
    },
    {
      title: "Mechanisms not modelled yet",
      defs: [
        ["Other skill types", "music-data.json's deck.kinds lists every score-up kind of the master data whose score is linear in the factor (effects 2000, 2002, 2004, 2005, told apart by duration, targets and conditions), with each chart's position weights per kind; "
          + "the page uses the plain score-up kind only. Judgement score up (2004, target judgements 41/46) and conditional 2000s (condition groups 14, 15) weigh differently and need a deck's own kinds summed; cumulative score up (2001, 2003), judgement conversion, Gekisou skills and snap skills are not linear and need the simulation itself."],
        ["Gekisou Live opponents", "The ranks depend on the other players' mission measures in every range. The page does not model opponents and lets you pick the ranks instead (rank 1 is the best case); which kind of rank the bonus table takes on equal values is not fully checked, and picking the ranks directly does not depend on it. Whether the server fills a room of fewer than 5 is not in the client code. The game has no co-op mode."],
        ["Snap skills", "Shuffled with their member; mostly conditional (the member's band, life, judgement counts), so deck-specific and left out here. A score up whose condition holds all live multiplies base by (1 + y)."],
        ["Probability skills (condition 4011)", "With an activation chance p independent of the rest, the expected contribution is that of the value p · x, which can be entered as the skill value; the spread is larger than shown."],
        ["Real play time", "When the results start and how long loading takes depend on the device and the network; the overhead c stands for them, and dominance holds for every c ≥ 0."],
        ["Scope of the checks", "deck's rules are checked against the decompiled client code (the game's own functions run in an emulator and their outputs compared), not yet against real play results live by live. "
          + "Judgement window skills (4000–4003, 13001) are not in the whole-live simulation yet, and a few Gekisou conditions only have synthetic tests; the page uses the plain score-up skill only and is affected by neither. A game update or hotfix patch may also change these rules."],
      ],
    },
    {
      title: "Chart facts",
      defs: [
        ["Level", "The display level (_musicScoreDisplayLevel, with decimals); the score uses the whole level (_musicScoreLevel)."],
        ["Notes", "Judged notes, the combo of a full combo; hidden notes, guide ends and unjudged slide ticks are left out. By NoteOperateType: tap {1, 101}, flick {40, 41, 42, 102}, slide {20, 21, 22}, trace {60–63, 104, 105}, combo tick {120}."],
        ["Main BPM, density", "The main BPM holds longest from the first to the last judged note; density = judged notes ÷ that span in seconds."],
        ["Base, W, skip", "Base and W as in sections 1 and 3: in Gekisou Live base includes the range rank bonuses of the ranks chosen, in Free Live it has none; both scale with the accuracy. Skip: score per point of power of a skipped live (every note Great, combo 0, no skills), independent of the length, and the same in every scenario on this page."],
        ["Where other sources disagree", "The figures come from our reading of the decompiled code, with no official data to check them against, and may be wrong; where other sites, tools or real plays disagree, trust them first. "
          + "Different conventions (how the length is taken, the play scenario and ranks, the accuracy, the deck) also make differences; set the page's parameters to theirs before comparing."],
      ],
    },
  ],
};
