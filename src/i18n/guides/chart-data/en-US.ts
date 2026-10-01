import type { ChartDataGuide } from "./index";

export const enUS: ChartDataGuide = {
  "title": "Definitions, Derivations, and Methodology",
  "lead": "Rankings and aptitude show statistical references for theoretical optimal play. Chart details also support simulating individual live runs based on custom note judgements and skills. Complete calculation rules and definitions are detailed below.",
  "sections": [
    {
      "title": "Score Model",
      "body": [
        "Rankings and charts are computed using a theoretical optimal baseline for the selected scenario: when Gekiso mode is enabled, notes within Just mission sections are treated as JUST, all other notes as PERFECT, and all three sections assume 1st place by default. Free Live disables Gekiso mode and assumes PERFECT throughout. The baseline assumes a Full Combo, non-zero life, and no card Gekiso skills. The single-live calculator in chart details allows testing explicit note judgements, skill orders, and seeds (see Section 6). The standard team model assumes five unconditional +100% score-up skills (5-second duration, all members, no activation conditions). Total live score is expressed as:"
      ],
      "math": [
        "S = P · ( base + Σ_k x_{π(k)} · w_k )",
        "base = score / P₀,   w_k = (score with a factor-1 skill at position k − score) / P₀,   P₀ = 300000"
      ],
      "after": [
        "Here, score is the simulated score without skills (including section placement bonuses in Gekiso Live), w_k is the score added over the entire live when member k carries a factor-1 skill (+100% bonus), and both values are normalized per unit of measurement power P₀. Floor operations match the game client's internal rounding. Every chart has been cross-checked across multiple power levels and random seeds to confirm mathematical consistency.",
        "Each song features three Gekiso missions (Combo, Luck, or Just, defined per song and shared across all difficulties), mapped sequentially to the chart's three Fever sections. JUST judgements are available exclusively within Just mission sections. Songs without a Just mission (41 of 85 songs) contain no Just notes anywhere in the live; 27 songs feature three Just missions, and 17 songs feature one of each mission type.",
        "Under this model, Gekiso mode substantially increases scoring: compared to Free Live, no-skill scores on Expert charts are 1.6×–4.7× higher (median 2.4×). The largest component is the section placement bonus: completing each section awards a percentage bonus of the section score based on your placement (defaulting to 1st place). Songs where all three missions are identical (68 of 85) award 250% per section, while songs with three distinct missions (17 songs) award 370%. In multiplayer, even 5th place earns 100%. At 1st place, this bonus accounts for 36%–69% (median 53%) of an Expert chart's base score. The second major factor is JUST notes (230% score multiplier vs. 100% for PERFECT): charts with long Just sections and high Just note counts benefit most. Skills activating during a Gekiso section amplify the section bonus as well, giving those skill positions significantly higher weight.",
        "Luck mission sections draw their lottery ticks and luck rushes from the live's pseudo-random seed. For charts containing luck sections (148 of 340), figures display the average across public seeds, with the min–max range shown in chart details (typically varying by 1.3% at the median, up to 4.2%)."
      ]
    },
    {
      "title": "Play Scenarios and Section Placements",
      "body": [
        "In Gekiso Live, each of the three Fever sections awards a score bonus based on the mission objective (Combo, Luck points, or Just count) and your section placement (1st to 5th place). By default, rankings and aptitude calculations assume 1st place in all three sections (the optimal theoretical case). Placements can be adjusted from 1st to 5th place using the formula below:",
        "Single-live replay allows specifying custom section placements or importing JSON records with confirmed placements and timestamps. The model does not simulate live opponent matchmaking, latency, or server-side arbitration."
      ],
      "math": [
        "base_r = ( score − Σ_i B_i + Σ_i trunc( RS_i · p_i(r_i) / 100 ) ) / P₀",
        "w_r[k] = w[k] + Σ_i ( p_i(r_i) − p_i(1) ) / 100 · u_i[k]"
      ],
      "after": [
        "RS_i is the score achieved in section i, p_i(r) is the bonus percentage for placement r, B_i is the 1st-place bonus, and u_i[k] is the extra score added to section i by the skill at position k (per unit of power P₀). Section bonuses are credited as a lump sum at the end of each section without altering note multipliers for subsequent notes. Under this model, achieving 1st place in all three sections yields 1.25×–1.65× higher no-skill score than finishing 5th place (median 1.46× across 340 charts).",
        "Free Live figures are computed via a separate simulation with Gekiso mode disabled, rather than simply subtracting Gekiso bonuses: without Gekiso mode, there are no Just notes, Gekiso combo multipliers, or luck rushes. Charts with more than three Fevers (which cannot be played in Gekiso mode) can be played normally in Free Live.",
        "In Gekiso Live, the game client reports two distinct scores: the primary score with all Gekiso bonuses included (shown in this scenario), and a secondary score excluding Gekiso bonuses, which is recorded as the song's personal high score and closely matches Free Live scoring. Chart details display both figures."
      ]
    },
    {
      "title": "Random Skill Activation Order",
      "body": [
        "At the start of each live, the game shuffles the team's skill activation order across the 5 member positions (5! = 120 possible permutations). Each skill activation event sequentially triggers the skill of the member assigned to that slot. Because team slot order does not determine activation order, skill order is treated as a uniformly distributed random variable over all 120 permutations."
      ],
      "math": [
        "E[S] / P = base + x̄ · W,   x̄ = (1/n) Σ_i x_i,   W = Σ_k W_k",
        "Var[S / P] = (1/(n−1)) · Σ_i (x_i − x̄)² · Σ_k (W_k − W̄)²"
      ],
      "after": [
        "Key takeaway 1: Expected score depends solely on the team's average skill bonus (x̄), regardless of which member holds which skill. Placing your highest-value skill in the heaviest-weighted slot represents the best-case permutation (an upper bound), not the average expectation.",
        "Key takeaway 2: Score variance depends on the product of skill value spread and slot weight spread. When all 5 members have identical skill values, every order yields the exact same score. On Expert charts with a skill distribution like [140, 100, 60, 30, 0]%, the gap between best and worst orders averages 15.4% (up to 29.2%). This guide displays expected score, the min–max range across all 120 permutations, and the 10th percentile (P10).",
        "Single-live simulation does not average permutations; it allows setting a specific skill activation order or testing individual reproducible runs."
      ]
    },
    {
      "title": "Score Efficiency and Pareto Dominance",
      "body": [
        "Total time per live is T = L + c, where L is song duration (either audio duration or chart length to the final note), and c represents transition and menu overhead between lives. Efficiency is evaluated as expected score per unit of power per unit of time:"
      ],
      "math": [
        "efficiency = E[S] / (P · T) = (base + x̄ W) / (L + c)",
        "a ≻ b  ⇔  ∀ x̄ ∈ [0, x_max], ∀ c ≥ 0:  S_a(x̄)/(L_a + c) ≥ S_b(x̄)/(L_b + c), strictly somewhere"
      ],
      "after": [
        "Chart A strictly dominates Chart B if its efficiency is equal or superior across all realistic skill averages (x̄ up to 150%) and any transition overhead c ≥ 0. Charts that are never dominated by any other chart form the Pareto Frontier (optimal efficiency candidates).",
        "Frontier comparisons assume identical team power across both songs. If card genre bonuses (musicType) or event tag bonuses alter team power for a specific song, compare total score directly (P_a · S_a vs P_b · S_b)."
      ]
    },
    {
      "title": "Event Score Ranks and Required Power",
      "body": [
        "Score rank thresholds (SS, S, A, etc.) are defined per song and shared across all difficulties. Free Live evaluates your personal score against solo thresholds. Gekiso Live evaluates the total room score against multiplayer thresholds; assuming equal contribution in an n-player room, each player's required score is approximately √(5/n) × the Gekiso threshold.",
        "Event points scale primarily with score rank achieved, team event bonus percentage, and live boost multiplier:"
      ],
      "math": [
        "points = trunc( (10000 + bonus) · rate · v(event, rank) / 10000 )",
        "by time:  max_s  Σ_r v(r) · Pr_s(rank = r) / (L_s + c)",
        "a ≻_event b  ⇔  L_a ≤ L_b  and  ∀ r, ∀ x̄ ∈ [0, x_max]:  S_a(x̄)/R_a(r) ≥ S_b(x̄)/R_b(r)"
      ],
      "after": [
        "Because event points depend on the score rank reached rather than raw score, event efficiency differs from pure score efficiency. Shorter songs that reliably achieve your target rank yield more event points per hour.",
        "Success rate indicates the percentage of the 120 skill activation orders that successfully reach the target rank at a given team power. On certain songs, reaching SS is actually easier on Hard difficulty than on Expert due to differing note distributions and density."
      ]
    },
    {
      "title": "Note Judgements and Single-Live Replay",
      "body": [
        "Judgement score multipliers are Perfect 100%, Great 80%, Good 50%, Bad/Miss 0% (Bad and Miss break combo). Just notes award 230% and appear within Just mission sections in Gekiso mode. Different note judgements affect overall score based on where they occur relative to skill activation windows.",
        "The accuracy sliders provide quick estimates: GREAT % scales the overall score (with all other notes treated as 100% PERFECT), and JUST % scales eligible notes within Just mission sections. For precise note-by-note analysis with combo breaks and skill conversions, use the single-live calculator in chart details."
      ],
      "math": [
        "Perfect 100% · Great 80% · Good 50% · Bad / Miss 0% · Just 230%"
      ],
      "after": [
        "The chart detail view provides a per-note simulation tool defaulting to Full Combo Perfect. You can customize individual note judgements, or export/import JSON configurations with custom skill triggers, random seeds, and section placements.",
        "Calculations are executed client-side via WebAssembly, modeling note judgements, combo scaling, life bars, and skill timings. Results display final score, maximum combo, and section mission metrics."
      ]
    },
    {
      "title": "Gekiso Skills and Aptitude",
      "body": [
        "Member cards and paired support cards can carry Gekiso skills that activate exclusively during Gekiso mode. Each Gekiso skill corresponds to a specific mission type (Combo, Luck, or Just) and activates only during sections matching that mission.",
        "Skill effects include Gekiso combo bonuses, luck gauge acceleration, luck points, Just count bonuses, rush score boosts, and judgement conversion / protection. The simulation evaluates these effects across each section.",
        "Aptitude measures the isolated contribution of a single Gekiso skill on the selected chart compared to a no-Gekiso baseline. Because different skill effects interact non-linearly (for example, combo bonuses saturate and conversion skills affect subsequent scoring), individual skill gains cannot be directly added together to evaluate a full team."
      ],
      "defs": [
        [
          "Probability-based activation",
          "Certain luck skills trigger probabilistically. In simulation, single runs evaluate a specific random seed, while aptitude values report seed averages and sample standard errors."
        ]
      ]
    },
    {
      "title": "Scope of Statistical References",
      "defs": [
        [
          "Skill types",
          "Standard rankings model unconditional score-up skills. Complex combinations involving cumulative scoring, conditional buffs, and support cards can be evaluated through the single-live simulation in chart details."
        ],
        [
          "Multiplayer opponents",
          "Section placements are configured as user-selected assumptions (1st to 5th place) rather than simulated opponent matchups."
        ],
        [
          "Transition overhead",
          "Total live time includes song length plus menu/loading overhead (c). Pareto dominance holds for any non-negative overhead c ≥ 0."
        ]
      ]
    },
    {
      "title": "Chart Metrics and Definitions",
      "defs": [
        [
          "Level",
          "Display level (with decimal precision) and internal integer difficulty level."
        ],
        [
          "Notes",
          "Total judged notes (full combo count). Note composition categorizes notes into Tap, Flick, Slide, Trace, and Combo ticks."
        ],
        [
          "Main BPM and Density",
          "Main BPM is the tempo active for the longest duration between the first and last judged note. Note density is total judged notes divided by that active duration (Notes/second)."
        ],
        [
          "Base, Weight (W), and Skip",
          "Base represents score per power without skills under the selected scenario. Weight (W) represents the total score increase per power from team skills. Skip factor reflects score per power when using live skip."
        ]
      ]
    },
    {
      "title": "Engine Verification and Benchmark Checks",
      "body": [],
      "table": {
        "headers": [
          "Benchmark case",
          "Scope of verification",
          "Result",
          "Notes"
        ],
        "rows": [
          [
            "Standard live; 300,000 power; no skills; Free Live",
            "5,500 frames, 13 state fields, 71,500 comparisons; 364 note events",
            "0 difference; float32 scoring factors match bit-for-bit",
            "Verified baseline scoring engine"
          ],
          [
            "5-member team with standard skills; Perfect and mixed judgements",
            "5,500 frames per case; 253,000 core checks; skill trigger and application",
            "0 difference; maximum float32 ULP: 0",
            "Covers standard score-up skill families"
          ],
          [
            "Multi-skill team with varied timings; 30 / 60 / 120 fps",
            "57,750 frames across 9 benchmark configurations; 18,826,500 core checks",
            "0 difference; maximum float32 ULP: 0",
            "Verifies frame rate independence and event ordering"
          ],
          [
            "Non-zero note timing offsets and mixed judgements",
            "Real note stream: P274 / Great58 / Good32; 1,793,000 core checks",
            "0 difference; maximum float32 ULP: 0",
            "Verifies timing classification and combo transitions"
          ],
          [
            "Life threshold boundaries (700 → 600)",
            "5,500 frames; 2,288,000 core checks",
            "0 difference; maximum float32 ULP: 0",
            "Verifies conditional skill state persistence"
          ],
          [
            "Max-level skills (Level 5)",
            "5,500 frames; 1,545,500 core checks including floating-point factors",
            "0 difference; maximum float32 ULP: 0",
            "Verifies high-multiplier floating point precision"
          ],
          [
            "Gekiso and support skills; varied accuracy at 30 / 60 / 120 fps",
            "48,750 frames; 35,777,250 checks: rush, luck gauge, Just bonuses",
            "0 difference; float32 bits identical",
            "Verifies Gekiso mechanics across frame clocks"
          ],
          [
            "Dynamic Just timing windows",
            "1,600 frames; 9 window configurations, 451,200 total checks",
            "0 difference; window activation and bounds match",
            "Verifies Just window logic"
          ],
          [
            "Probabilistic activation skills (Condition 4011)",
            "15,000 frames; 10,680,000 checks across threshold branches",
            "0 difference; identical final scores",
            "Verifies pseudo-random stream and activation thresholds"
          ],
          [
            "Solo Gekiso mode: Combo / Just / Luck missions",
            "19,000 frames; 646,000 integer state comparisons",
            "0 difference across score, life, combo, and mission states",
            "Verifies all three mission types"
          ],
          [
            "Multiplayer Gekiso mode: Mixed judgements and life depletion",
            "19,000 frames; 646,000 core comparisons",
            "0 difference across all simulation metrics",
            "Verifies multiplayer scoring and failure handling"
          ],
          [
            "Multiplayer placement calculation",
            "572 test cases including ties and missing inputs",
            "15,259 exact comparisons; 0 difference",
            "Verifies ranking tiebreakers and room scoring"
          ]
        ],
        "caption": "Client 1.0.1 · Benchmark test suite verified"
      },
      "after": [
        "Scoring calculations match the game client bit-for-bit across benchmark test suites, with identical float32 precision and zero integer deviations."
      ]
    }
  ],
  "reminder": {
    "title": "When other results disagree",
    "text": "When comparing against other sources, please ensure game version, chart, scenario, power, and skill setups match. If discrepancies arise, refer to in-game results.",
    "priority": "When you find a disagreement with other sources, the other sources are correct."
  },
  "contentsLabel": "Contents",
  "methodsLabel": "Methodology and scope",
  "method": {
    "title": "Sources and verification",
    "text": "Charts and game data are extracted from game resources, and figures are calculated via our score simulation model, verified across multiple benchmark setups against game logic. Provided for team building and song selection reference."
  }
};
