import type { ChartDataGuide } from "./index";

export const enUS: ChartDataGuide = {
  "title": "Definitions, derivations and conditions",
  "lead": "Rankings and aptitude show statistical references for theoretical best play. Chart details can also calculate one play from per-note inputs. Both use the same ournotes-deck Rust model; the native frame checks are listed below.",
  "sections": [
    {
      "title": "Score model",
      "body": [
        "Rankings and charts use the selected scenario’s theoretical best baseline: with Gekisou on, Just inside Just missions and Perfect elsewhere, all ranges at rank 1 by default; Free Live disables Gekisou and uses Perfect throughout. The baseline has a full combo, life above zero and no card Gekisou skills. The single-play calculator runs your per-note judgements, skill order and seed again; section 6 explains its inputs. ournotes-deck live::full processes the whole live frame by frame, with 40 ms score frames. The statistics use ordinary effect 2000: 5 seconds, all members, no condition. A deck scores"
      ],
      "math": [
        "S = P · ( base + Σ_k x_{π(k)} · w_k )",
        "base = score / P₀,   w_k = (score with a factor-1 skill at position k − score) / P₀,   P₀ = 300000"
      ],
      "after": [
        "score is the model's no-skill score (in Gekisou Live with the range rank bonuses), w_k the score a factor-1 plain skill (value 10000, +100 %) on the member at position k adds over the whole live; both per point of the measurement power P₀. The value becomes a factor with a floor (⌊value/10000 × 10⁵⌋/10⁵) and every note score is floored, so the formula holds up to the floors: for every seed deck plays a random deck of real skill values at another power (1000003) through the whole live, and a chart whose deviation exceeds the bound fails. All 340 current charts pass. This check only shows that the formula agrees with the simulation, not that the simulation agrees with the game.",
        "Every song has three Gekisou missions (combo, luck or Just, set per song and shared by every difficulty), one for each of the chart's three fevers in order. Just judgements are only on inside Just mission ranges, so the songs without a Just mission (41 of 85: 21 all combo, 20 all luck) have no Just all live; 27 songs have three Just missions, and 17 have one each of combo, luck and Just.",
        "By this model Gekisou weighs a lot: against Gekisou off, an Expert chart's no-skill score is 1.6–4.7 times higher (median 2.4). Most of it is the range rank bonus (MasterLiveGekisouRankingScoreBonus): every completed range adds a percentage of its own score, looked up by rank, rank 1 by default; that is 250 % on the songs whose three missions are the same (68 of 85) and 370 % on those whose three missions all differ (17), and in multiplayer even rank 5 gets 100 %. At rank 1 it makes 36–69 % (median 53 %) of an Expert chart's base. Next come the Just judgements inside Just mission ranges (230 %, against 100 % for a Perfect): charts with long ranges and many Just notes gain the most, and the 4.7 times chart has three Just ranges of about 52 s in all with 233 Just notes; the Gekisou combo factor of combo mission ranges matters little without Gekisou skills (about 1 %). A skill inside a Gekisou range raises the rank bonus too, so the positions inside ranges weigh much more.",
        "Luck mission ranges draw their lottery and luck rushes from the live's random seed. Charts with a luck range (148 of 340) come with the first 8 published seeds; the page takes the mean over the seeds and shows the seeds' base range in the details (1.3 % apart at the median, 4.2 % at most). The game's seed law is unknown, so the seed mean need not equal the game's own expectation."
      ]
    },
    {
      "title": "Play scenarios and ranks",
      "body": [
        "Each Gekisou range awards a percentage of its score using the mission pattern and placement derived from combo, luck points or Just count. Rankings and aptitude let you select rank 1–5 for each range, rank 1 by default. These fixed-rank references use the original Solo range scoring method; the statistical adjustment is:",
        "A single-play JSON can specify fixed Solo ranks and let the complete engine settle them. External ranking instead supplies the confirmation frame, range, group rank and bonus percentage, using client frame snapshots. These are different inputs. The page does not simulate opponents, network delays or server decisions."
      ],
      "math": [
        "base_r = ( score − Σ_i B_i + Σ_i trunc( RS_i · p_i(r_i) / 100 ) ) / P₀",
        "w_r[k] = w[k] + Σ_i ( p_i(r_i) − p_i(1) ) / 100 · u_i[k]"
      ],
      "after": [
        "RS_i is range i's score, p_i(r) range i's bonus percent at rank r, B_i = trunc(RS_i · p_i(1) / 100) the rank-1 bonus (every range of every seed of the current data meets this), and u_i[k] the score the skill at position k adds to range i, per P₀. Why: by the decompiled code the bonus is added once at the range's end and leaves the score factors of the notes after it alone, and the rank reaches one skill condition only (7012), which no skill of the current master data uses. So by this model a rank changes the bonus term only; w_r is off by the skill floors, less than 3/P₀. deck also runs whole lives at random ranks against these formulas, and the current data stays within the error bound. By this model the no-skill score at rank 1 in all three ranges is 1.25–1.65 times that at rank 5 (340 charts, median 1.46).",
        "The Free Live figures come from a separate whole-live simulation with Gekisou off, not from Gekisou Live minus the bonuses: without Gekisou there are no Just judgements, Gekisou combo factor or luck rushes either. Without Gekisou there is no luck lottery, and the page's skill has no probability condition, so every chart has one seed; charts with more than 3 fevers, unplayable in Gekisou Live, are computed as usual in Free Live.",
        "By the decompiled code, Gekisou Live reports two scores: one with every Gekisou effect (Just, luck, the Gekisou combo, the rank bonuses and the Gekisou skills), which the page's Gekisou Live figures stand for (without the Gekisou skills for now, section 7); the other without any Gekisou effect (Gekisou skills included), kept as the song's best score, by this model about the Free Live score. The chart details show both. How the server uses the two (for event points, say) is not in the client code."
      ]
    },
    {
      "title": "The skill order is random",
      "body": [
        "From the decompiled code: at the start of every live the client builds MemberDataContainer; the skill order is set to 0…n−1 and Fisher–Yates shuffled with the MemberShuffle random stream, seeded from the client clock (a solo retry keeps the seed, and the order). Skill event e fires the member at position e of the shuffled order, and the snap skill lists follow the same order. So the page takes π as uniform over the 5! = 120 orders; the deck's slot order is not a choice."
      ],
      "math": [
        "E[S] / P = base + x̄ · W,   x̄ = (1/n) Σ_i x_i,   W = Σ_k W_k",
        "Var[S / P] = (1/(n−1)) · Σ_i (x_i − x̄)² · Σ_k (W_k − W̄)²"
      ],
      "after": [
        "First: the expectation depends on the mean skill value only, not on how the values are spread over members or who stands where. The strongest skill on the heaviest position is the best of the 120 orders, an upper bound, not the expectation.",
        "Second: the spread is the product of the skills' spread and the position weights' spread; five equal skills score the same every live. By this model, with skills [140, 100, 60, 30, 0] % over every Expert chart, the best and the worst order differ by 15.4 % at the median and 29.2 % at most, and the best order is 7.6 % (median) above the expectation; the Gekisou ranges pull the position weights apart, so the order matters far more than without Gekisou. The page shows the expectation, the range over the 120 orders and P10.",
        "A single play does not average the 120 orders. Its JSON specifies performers, skillOrder and seed. Chart skill events map to that order; member attributes and paired supports remain with their performer record. The same data and inputs replay the same play."
      ]
    },
    {
      "title": "Efficiency and dominance",
      "body": [
        "A play takes T = L + c: L is the BGM length (the ACB cue length, audio not decoded) or the chart length (last note + 1 s, the music length of the score code), c the time outside the song. When a live hands over to the results on a device is not measured yet, so both L are offered and every result holds for each."
      ],
      "math": [
        "efficiency = E[S] / (P · T) = (base + x̄ W) / (L + c)",
        "a ≻ b  ⇔  ∀ x̄ ∈ [0, x_max], ∀ c ≥ 0:  S_a(x̄)/(L_a + c) ≥ S_b(x̄)/(L_b + c), strictly somewhere"
      ],
      "after": [
        "For a fixed x̄ the difference times (L_a + c)(L_b + c) is linear in c, and for a fixed c it is linear in x̄, so four corners decide: S_a ≥ S_b and S_a/L_a ≥ S_b/L_b at x̄ = 0 and at x̄ = x_max. x_max = 150 %, the largest single skill value in the master data (MasterLiveSkillEffect, level 5). Without a bound, some Easy charts stay on the frontier only for skill values above 500 %, which do not exist.",
        "This frontier result applies to one theoretical-best statistical baseline. A different scenario or fixed rank needs a new comparison. Arbitrary mixed judgements, breaks and skill combinations cannot share one accuracy multiplier.",
        "The comparison assumes the deck has the same power on both songs. Card song-type (musicType) and tag bonuses make P depend on the song; then compare P_a S_a with P_b S_b."
      ]
    },
    {
      "title": "Score ranks and events",
      "body": [
        "Rank thresholds are per song: MasterLiveMusic._liveScoreRankGroup selects rows of MasterLiveScoreRank, shared by every difficulty; the rank is the highest threshold the score reaches. Free Live uses the solo threshold R (_requiredScore). Gekisou Live has thresholds of its own, R_battle (_battleLiveRequiredScore), and rates the sum of every player's score in the room against trunc(√(5/n) · R_battle · n) for n connected players, E counting as D. In Gekisou Live the page takes a room of n players (5 by default, 1–5) who all score the same as you, so you need about √(5/n) · R_battle; teammates scoring above or below you lower or raise what you actually need.",
        "In the decompiled code event points are computed as below; v comes from the (event, rank) table, the bonus from the deck, and the rate is 5k for k boosts spent, 1 for none:"
      ],
      "math": [
        "points = trunc( (10000 + bonus) · rate · v(event, rank) / 10000 )",
        "by time:  max_s  Σ_r v(r) · Pr_s(rank = r) / (L_s + c)",
        "a ≻_event b  ⇔  L_a ≤ L_b  and  ∀ r, ∀ x̄ ∈ [0, x_max]:  S_a(x̄)/R_a(r) ≥ S_b(x̄)/R_b(r)"
      ],
      "after": [
        "The song enters the points only through the rank, so the points a boost buys do not depend on the song; songs differ only in their rank chances and their length. Event dominance needs no point table, only v non-decreasing in the rank: when it holds, any deck needs no more power on a than on b for any rank, and a is no longer.",
        "The table can be recovered without the master data: bonus and rate of a live are known, so v = points × 10000 / ((10000 + bonus) × rate) with a truncation error below 1/rate; one result per rank determines v.",
        "The chance is the share of the 120 skill orders with P · S_π ≥ R (S from the selected theoretical-best baseline); the power needed uses the expectation, its range the best and the worst order. By this model, with every skill at 140 %, in Gekisou Live at rank 1 in a room of 5, SS on Expert needs 0.27 to 2.05 million power, a factor 7.5. A least-squares fit through the origin of the SS thresholds against this model's score capacity leaves a median relative residual of about 32 %: the thresholds do not seem to be set by capacity, so event choices are best computed song by song rather than read straight off the efficiency ranking. For 20 of the 85 songs SS is easier on Hard than on Expert."
      ]
    },
    {
      "title": "Judgements and one-play calculation",
      "body": [
        "Judgement factors are Perfect 100%, Great 80%, Good 50%, Bad and Miss 0%; Bad and Miss break combo. Just is 230%, normally enabled by the client inside Just missions, and conversion skills may change the result. The same grade proportions on different notes can produce different scores.",
        "Ranking accuracy sliders are estimates: Great scales the overall score and Just interpolates between two baselines. They do not model combo breaks or all judgement-conversion and cumulative effects. The detail’s one-live calculator simulates explicit per-note results in Rust; equal accuracy percentages at different notes can produce different scores."
      ],
      "math": [
        "Perfect 100% · Great 80% · Good 50% · Bad / Miss 0% · Just 230%"
      ],
      "after": [
        "The chart’s single-play calculator defaults to no skills and Perfect on judged notes, retaining Pass on unscored nodes. Edit individual judgements, or export the template JSON and import it after setting ordinary, support and Gekisou skills, order, seed, ranks or frame times. Unknown notes, duplicate or missing results and invalid clocks fail; missing notes are not silently turned into Miss.",
        "Browser WASM calls the same Rust engine as the data tools. It processes conversion, combo, life, skills and Gekisou settlement frame by frame. Audio length and score-table length are separate inputs. The default clock is 60 Hz; 30/120 Hz are also supported, and the clock can affect activation and settlement. Results include same-frame score and settled calculator score, life, current combo, maximum sampled frame combo, converted judgement counts and range mission measures.",
        "This is the result for the declared judgement stream. It does not derive judgements from touch actions or guarantee the same results as physical play on a device. Window effects require original result metadata; unsupported inputs or effects fail. Rankings and aptitude retain their theoretical-best baseline, without Great/Just share scaling or endpoint interpolation replacing that play."
      ]
    },
    {
      "title": "Gekisou skills",
      "body": [
        "What is modelled. Member cards carry Gekisou skills, and the support cards paired with them Gekisou support skills. By the decompiled code they are only set up with Gekisou on and only add to the score with Gekisou (battleLiveScore), never to the one without (soloScore), and Free Live has none of them. Every skill belongs to one Gekisou mission (combo, luck or Just) and only triggers in the ranges of that mission, independent of the performance position and the shuffle; a support skill can carry a band condition (condition 5000) on whether its paired member is in a given band. By type the effects are the Gekisou combo bonus, the luck gauge multiplier, luck points, a full gauge, the Just count bonus and cumulative Just, a score up during luck rushes, points per 10 combo or per Just, and combo protection, Great to Perfect, conversion to Just, a looser Just judgement and a few more; ournotes-deck computes them frame by frame in the whole-live simulation.",
        "Ranks and judgements. Fixed-rank statistical references use the range bonus formula in section 2; a single play runs its declared judgement stream. Conversion, per-Just scoring and cumulative Just can change later state, so an average accuracy multiplier does not calculate these effects.",
        "A theoretical-best baseline cannot show every skill’s benefit. Protection and conversion need the relevant breaks or grades, and wider windows need original result metadata. A skill that raises mission measures may improve a real placement, but a fixed-rank reference does not change its placement automatically. Single-play JSON can check a concrete input.",
        "Seeds. Luck ranges draw from the live's random seed, and so do the luck Gekisou skills' effects, so with Gekisou skills the luck ranges may spread wider between seeds. The page takes the mean over the seeds given, which is not the game's own expectation; the game's seed law is unknown. The performance positions are shuffled every live, but Gekisou skills do not depend on the position; the shuffle only reorders a seed's probability draws and leaves the expectation alone.",
        "Native coverage is now documented by case in the validation table. Ordinary-skill and no-card-Gekisou update chains have frame comparisons; this does not certify every card Gekisou skill or every combination. Unchecked effects and conditions remain unchecked.",
        "Aptitude measures one skill at a time. Member Gekisou skills use their highest level, support skills their highest limit-break level. Equal scoring parameters share a shape; band conditions have matched and unmatched variants. One performer carries a member skill alone; a support skill uses a synthetic empty Gekisou skill of its mission, not a real card. Missing data is pending, not zero. The ranking and chart baseline still carries no Gekisou skills.",
        "Aptitude subtracts complete runs with and without one skill on the same seed. The theoretical-best rank-1 value uses the mean score increment. Ordinary skill and rank adjustments use exported weights and range increments, as references limited by rounding and linear assumptions. A concrete mix of skills and judgements uses the complete engine in section 6.",
        "Gains of several skills cannot be added: the Gekisou combo factor saturates, rush supports interact with luck-gauge skills, and judgement conversion can change other effects; single-skill increments do not reconstruct a whole formation. Aptitude is a single-skill response, not a formation result. Chart factors give judged notes, Just notes, notes that can only be Perfect in Just ranges, tail notes from End to Complete, starting combo and no-skill lotteries to help explain differences.",
        "Each [mean, standard error] uses sample standard deviation divided by the square root of the seed count; SE is not model error. Random dependencies are checked before the four-seed probe, and four equal results alone do not prove determinism. Random variants double from 32 seeds up to a guard of 65536. Both theoretical-best and all-Perfect score increments must meet the larger of 1% of the absolute increment and 0.1% of the same-seed no-skill baseline. Meeting the baseline target need not mean 1% relative precision. A formal artifact requires both endpoints to pass; failure to converge within the guard rejects generation. Cross terms use at most the first 64 seeds; covariance is unavailable, so errors cannot be combined as independent.",
        "All-Perfect ordinary-skill cross weights are unavailable. Statistical adjustments without corresponding weights remain limited-precision references; arbitrary judgements and multiple skills use single-play calculation, rather than combined endpoint increments."
      ],
      "defs": [
        [
          "Probability activation (condition 4011)",
          "The model compares a float32 draw from the skill random stream with the activation threshold. In the current master, condition 4011 is used by luck Gekisou member skill 11003 and support skill 11005. Two native whole-live checks with real cards and supports passed, covering activation, rejection and a successful 5% branch; see the table below. The full model calculates one live for a given seed; seed means and standard errors describe aptitude. Ordinary skill inputs are unconditional score up: p × value cannot substitute for probability effects."
        ]
      ]
    },
    {
      "title": "Scope of the statistics",
      "defs": [
        [
          "Other skill types",
          "The statistics’ deck.kinds lists score effects linear in their factor (2000, 2002, 2004, 2005); the page’s skill sliders use ordinary score up. Cumulative scoring, conversion, support and Gekisou combinations need a complete simulation. Single-play JSON accepts supported skill IDs, levels and member attributes; unknown IDs or unsupported effects fail."
        ],
        [
          "Gekisou Live opponents",
          "The page does not predict other players’ range measures. Statistics select fixed placements; single-play external ranking requires explicit confirmations. Fixed-rank results do not determine online tie order, disconnects, room filling or server settlement."
        ],
        [
          "Snap skills",
          "Statistics omit specific Snap condition combinations. A single play can supply paired supports and member attributes; the complete engine processes life, grade counts, band and other conditions frame by frame."
        ],
        [
          "Real play time",
          "When the results start and how long loading takes depend on the device and the network; the overhead c stands for them, and dominance holds for every c ≥ 0."
        ]
      ]
    },
    {
      "title": "Chart facts",
      "defs": [
        [
          "Level",
          "The display level (_musicScoreDisplayLevel, with decimals); the score uses the whole level (_musicScoreLevel)."
        ],
        [
          "Notes",
          "Judged notes, the combo of a full combo; hidden notes, guide ends and unjudged slide ticks are left out. By NoteOperateType: tap {1, 101}, flick {40, 41, 42, 102}, slide {20, 21, 22}, trace {60–63, 104, 105}, combo tick {120}."
        ],
        [
          "Main BPM, density",
          "The main BPM holds longest from the first to the last judged note; density = judged notes ÷ that span in seconds."
        ],
        [
          "Base, W, skip",
          "Base and W are defined in sections 1 and 3 for the selected theoretical-best baseline: Gekisou includes fixed-rank range bonuses, Free Live does not. Skip is score per point of power for a skipped live (all Great, combo 0, no skills), independent of duration and unchanged by the page’s scenario."
        ]
      ]
    },
    {
      "title": "Checks against native code",
      "body": [],
      "table": {
        "headers": [
          "Case / input",
          "What was checked",
          "Result",
          "What remains unchecked"
        ],
        "rows": [
          [
            "10000201; power 300000; no skills; Gekisou off",
            "5500 frames, 13 fields, 71500 comparisons; 364 judgement events",
            "0 differences; six float32 factor states match by bits",
            "Fresh, no rewind; simulator max combo is not protected live max combo"
          ],
          [
            "Five ordinary skill-1 members; Perfect and mixed P/Great/Good/Bad/Miss",
            "5500 frames per case; 253000 core comparisons per case; native SkillExecutor trigger/pool/phases and applier dispatch",
            "0 differences; float32 max ULP 0",
            "One unconditional 2000 skill family; elapsed mirror excluded; not a complete game lifecycle"
          ],
          [
            "Real skills 1/4/6/7/5; high/medium/low accuracy × 30/60/120 fps",
            "Nine cases: 57750 frames; 35 effect-pool instances; 18826500 core comparisons; chart events and converted judgements in order",
            "0 differences; float32 max ULP 0",
            "Selected target and life-condition effects; not all skills or input windows"
          ],
          [
            "Nonzero per-note timing offsets",
            "Native actual P274 / Great58 / Good32; 5500 frames; 1793000 core comparisons",
            "0 differences; float32 max ULP 0",
            "Native auto-input window classification; Rust still consumes native judgements, not independent touch replay"
          ],
          [
            "Life condition boundary 700→600",
            "5500 frames; 45 effect-pool instances; 2288000 core comparisons",
            "0 differences; float32 max ULP 0",
            "The high-life effect is selected at 700 and continues at 600; the active effect does not switch to the low-life branch"
          ],
          [
            "Real skills 3/5/1/2/7 at level 5",
            "5500 frames; 1545500 core comparisons, including actual float32 skill factors",
            "0 differences; compared float32 max ULP 0",
            "This skill combination only; value 13000 converts to 1.29999…, not a hand-entered 1.3"
          ],
          [
            "Real card Gekisou and support skills; eight high/medium/low accuracy and 30/60/120 fps cases",
            "48750 frames, 35777250 checks: pools, converted results, combo protection, cumulative Just, luck gauge and rush",
            "Zero differences in declared fields; exact float32 bits",
            "Specified configurations; member-power effects and complete failure/result transitions need separate checks"
          ],
          [
            "Dynamic Just windows through the published model’s public API",
            "1600-frame native capture; 9 window types, 39 units; 388800 window and 62400 core checks",
            "451200 checks, zero differences; enable state and window widths match",
            "Window states and widths, scoring, life and current combo; consumes classified judgements"
          ],
          [
            "Probability 4011; real member card 43 / support 66; high life and life 600 + 4 Miss",
            "Two cases: 15000 frames, 10680000 core checks; 72 random-value, threshold and boolean checks",
            "Zero differences; final scores 2835163 / 2760861",
            "Seed 14 was selected to cover 5% success; fixed-input checks do not measure the probability distribution"
          ],
          [
            "Solo Gekisou combo / Just / luck; no card skills",
            "10000103 / 10000201 / 10000303; 19000 frames; 646000 integer comparisons",
            "0 differences in the listed score channels, life, combo, random count and range states",
            "Some range counters and float32 fields remain unpaired; frame score observation is separate from score()"
          ],
          [
            "Offline multiplayer combo / Just / luck; actual mixed judgements and life zero",
            "19000 frames; 646000 core comparisons; 76000 ranking-derived comparisons listed separately",
            "0 differences; 431 native random draws in the luck case",
            "No card skills, independent touch windows, full failure transition or server rewards; ranking-derived fields are not production observers"
          ],
          [
            "Native multiplayer ranking",
            "572 invocation cases, including ties, secondary measures, missing inputs and error boundaries",
            "15259 exact comparisons, 0 differences",
            "A subsystem test, not 572 lives; within-tie raw member order is outside the Rust API contract"
          ],
          [
            "Challenge: None / FullCombo / AllPerfect assists; actual mixed grades",
            "Three cases, 5858 frames and 1382503 core checks; native Enter/Update/Exit",
            "Declared fields match; native Bad/Good retry branches also observed",
            "Retry decisions are native-side observations; zero-latency animation substitutes, no full result screen/server check"
          ],
          [
            "Mission / SoloGekisou; mixed grades, combo breaks and zero life",
            "5502 frames, 1469049 core checks; 22008 derived ranking checks listed separately",
            "Zero differences; final score 439015; frame display and calculator scores checked separately",
            "No full result screen/server check; derived ranks are not independent production observers"
          ],
          [
            "Free / Solo Gekisou / challenge / mission / battle / arena / tutorial",
            "Seven native setup entries and chart/bootstrap branches executed",
            "Entry evidence only; full mode coverage pending",
            "Entering a mode is not a whole-live verdict; actual event/arena master and server lifecycle remain separate"
          ]
        ],
        "caption": "Client 1.0.1-25 · Checked 2026-09-30"
      },
      "after": [
        "All declared integers match and float32 bits are identical. The model passes 272 regression tests; per-note Rust and WASM results also match across all 340 charts."
      ]
    }
  ],
  "reminder": {
    "title": "When other results disagree",
    "text": "For comparisons, align version, chart, scenario, power, judgement stream, skills, order, seed and frame clock. Include the request JSON and result when reporting a difference. Statistical sampling error, limited-precision references and native check coverage are explained above.",
    "priority": "When you find a disagreement with other sources, the other sources are correct."
  },
  "contentsLabel": "Contents",
  "methodsLabel": "Method and remaining gaps",
  "method": {
    "title": "Sources and verification",
    "text": "Charts and master data come from game resources extracted by nnnotes; ournotes-deck’s Rust model calculates the figures. We run the game client’s libil2cpp binary directly in the offline ARM64 emulator Unicorn. With the chart, skills, seed and clock fixed, we compare scoring, life, combo, skills and ranking against Rust frame by frame. Files, audio, display and Unity JSON object assembly use substitutes; scoring still executes native instructions. The table’s checked integers and float32 bits match exactly, showing that the model reproduces client calculations under these conditions. Real devices and server results are outside this comparison."
  }
};
