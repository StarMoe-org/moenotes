import type { ChartDataGuide } from "./index";

export const enUS: ChartDataGuide = {
  "title": "How scoring works, and how to choose your cards and songs",
  "lead": "A practical guide to note scores, Gekiso missions, member and Snap pairing, event farming and the Song Meta controls. Worked examples use a specified game-data snapshot; the model's validation scope is stated alongside them.",
  "reminder": {
    "title": "Beta model and research scope",
    "priority": "Use in-game results as the reference.",
    "text": "This guide comes from client reverse engineering and our own recalculations. Native comparisons use international client 1.0.1; these worked examples use JP 1.0.4 data. Those are different scopes. Physical touch judgements and online server settlement are outside the checks, and the examples do not certify the latest game rules."
  },
  "method": {
    "title": "Using Song Meta",
    "text": "Choose a mode and difficulty, then enter the five ordinary skill baseline percentages and time between plays. Efficiency compares score per power and per minute; Event grades compares the power needed for SS/S/A/B. Section placements 1–5 set Gekiso bonuses, separately from score grades. Adding a Snap enables replay at your entered power; reference members supply conditions without replacing the manual skills or power. Open a row for the timeline and score details."
  },
  "contentsLabel": "Contents",
  "methodsLabel": "Validation details",
  "sections": [
    {
      "title": "What was checked against the game",
      "body": [
        "For the native comparisons, the game's original machine code and our model received the same formation and judgement sequence. A recorded 7,500-frame play of Hekiten Bansou matched frame by frame and ended at 704,741 on both sides. Two initial cases matched 506,414 compared values, including score, combo, life, skill factors, Gekiso state, Luck and random-draw counts.",
        "The wider capture set covered seven charts, 35 runs, 240,347 frames and 83,538,849 comparisons. It varied difficulty, 30/60/120 fps, mixed judgements, zero life and real Gekiso and Snap skills. No differences were found in the declared comparisons. Deliberately breaking the random-stream handling or member/Snap pairing produced thousands of mismatches, showing that the checks can detect those mistakes.",
        "These are checks of specific inputs and fields in international client 1.0.1, not every possible play. The note and event examples below use a separate JP 1.0.4 data snapshot. A model example on newer data is not a new native validation. The appendix keeps the detailed historical check records."
      ]
    },
    {
      "title": "One note's score, from power to the final integer",
      "body": [
        "Start with three times total power, multiply by difficulty, note weight, judgement, the current combo and skill factors, and Luck. Divide by the converted note count. Floor that result first; then apply the mode's extra score factor, life and assist, and floor again. The engine uses float32 arithmetic and its original operation order; the formula below is a readable summary.",
        "In this 壱雫空 worked example, power is 412,557 and the scoring level is 27, so the difficulty factor is 1.11. The base term is about 1,948.67. With every other factor at 1, the first note gives 1,948. Keep the unrounded base when applying later factors: multiplying it by a 1.06 combo factor gives 2,065 after flooring. Flooring the base too early would lose a point.",
        "The denominator is a weighted count, not the unweighted full-combo count of 809. This chart has 693 full-weight notes and 116 intermediate long-note ticks at one tenth each: ceil(693 + 116 × 0.1) = 705. In this example's skill window, a full-weight note gives 4,170 while an intermediate tick gives 417. Raw note count alone therefore does not rank a chart's score efficiency.",
        "After the first floor, the 2,065-point example note becomes 619 at zero life (30%), or 1,858 with the specified assist factor (90%). The mode score factor E is 1 in this ordinary example. It is separate from the event-point bonus discussed later."
      ],
      "math": [
        "D = 1 + 0.005 × (scoring level − 5)",
        "N = ceil(sum of judged note weights)",
        "q = 3P × D × weight × judgement × combo × skill × Luck / N",
        "note score = floor(floor(q) × E × life × assist)"
      ],
      "after": [
        "The displayed chart level can differ from the integer scoring level. 壱雫空 displays 27.5 but uses 27 in this calculation. In the worked non-Gekiso example, all 809 note scores sum to 2,174,667; that total belongs to the specified formation and inputs."
      ]
    },
    {
      "title": "COMBO, skills, Fever and judgement timing",
      "body": [
        "The ordinary combo bonus rises by 1% per ten combo up to 100 combo, then by 0.5% per ten up to 500, where it caps at +30%. Use the combo before the judgement. In this example's simultaneous pair, both notes use 69 combo and give 4,131 each; the next note uses 71 and gives 4,170. Gekiso skills can also affect the total combo factor.",
        "A skill changes the score factor while its conditions and active window apply. The first +100% skill in this example starts at 11.7 seconds and doubles eligible note scores for five seconds. A PERFECT-only skill contributes its extra bonus only to qualifying judgements. The engine combines the active score-up effects into one effective skill factor for that judgement.",
        "Fever bars locate the chart's sections on the timeline. In Gekiso Live, the three sections carry the song's missions and their placement bonuses. This note-score breakdown has no separate fixed Fever multiplier: note modifiers and the end-of-section Gekiso bonus are calculated in their respective steps. The timeline helps you see which high-value notes fall inside skill and mission sections.",
        "Judgement timing depends on the note type. The following window examples come from extracted assist-off timing parameters. They explain the classified inputs; this browser model does not independently reproduce physical touch classification on a phone."
      ],
      "defs": [
        [
          "Judgement score factors",
          "PERFECT is 100%, GREAT 80%, GOOD 50%, BAD/MISS 0% and JUST 230%. BAD and MISS break combo. JUST normally exists only for eligible notes in a JUST mission."
        ],
        [
          "Ordinary tap window",
          "The extracted offsets are ±2 ms for JUST, ±50 ms for PERFECT, ±83 ms for GREAT, ±100 ms for GOOD and ±125 ms for BAD. In the example, +50 ms is still PERFECT; +60 ms is GREAT and loses 20% of the ordinary judgement score."
        ],
        [
          "Other note types",
          "The extracted flick PERFECT window is −83 to +67 ms, with no early-side GREAT window. Long-note tails have no JUST; dragged intermediate ticks distinguish PERFECT from MISS."
        ],
        [
          "Assist",
          "In the examined tap rules, assist widens GOOD and BAD windows while leaving PERFECT and GREAT unchanged. The scoring assist factor is a separate part of the final note calculation."
        ]
      ]
    },
    {
      "title": "Gekiso missions, section placements and score grades",
      "body": [
        "Gekiso runs in Gekiso Live; the examined Free and Challenge setups have it disabled. A song has three Gekiso sections, each assigned COMBO, JUST or LUCK. Member and Gekiso support skills belong to a mission type and matter when that mission matches the song.",
        "At a section's end, its placement adds a percentage of the score earned in that section. The examined bonus table spans +100% to +370%, depending on the mission pattern and placement. In the native example, 41,341 section points receive a first-place +250% bonus: floor(41,341 × 2.5) = 103,352 extra points. At that rate, points earned within the section contribute about 3.5 times in total; a +100% bonus doubles them.",
        "Section 1, 2 and 3 on this page are the three mission sections. Set each placement from 1st to 5th; all default to 1st. They determine section bonuses. The final SS/S/A/B score grade is a different result, based on score thresholds. The page accepts your section placements as inputs and does not predict opponents' mission measures or server ranking."
      ],
      "math": [
        "section bonus = floor(section score × placement bonus % / 100)"
      ],
      "defs": [
        [
          "COMBO",
          "The mission ranks by its combo measure. Ordinary combo scoring and the Gekiso mission's combo effects are distinct parts of the model; a matching card skill may change the latter."
        ],
        [
          "JUST",
          "Eligible notes judged within the extracted ±2 ms JUST window score at 230%, and the mission ranks by JUST count. In this same-team worked example, score rises from about 2.17 million without Gekiso to 4.94 million with Gekiso and all PERFECT, then 9.30 million with 261 JUSTs. These are model results for that setup."
        ],
        [
          "LUCK",
          "Judged notes fill a gauge: the example gives PERFECT 7, 8 or 9 points randomly, GREAT less, and intermediate ticks 2. Matching skills can amplify gauge growth. Filling 140 triggers a draw: miss 10%, Hit 26%, Super Hit 20%, Critical 44%. Hit grants 5 Luck points; Super Hit and Critical grant 10."
        ],
        [
          "Rush",
          "A Critical starts Rush, lowering the gauge cap to 70 and adding 10% to note scoring. In this example, the next Critical chances are 90%, 70%, 50%, then 30%. The native example reaches 190 Luck points after five consecutive Criticals; the mission ranks by Luck points. One seed is one outcome, not a measured in-game probability distribution."
        ]
      ]
    },
    {
      "title": "Choosing members, pairing Snaps and upgrading skills",
      "body": [
        "Skill times come from the chart, but the client shuffles the five members at the start of a play. Formation slot order does not choose activation order. Evaluate a member across the five times rather than assuming the strongest skill will land in one chosen window. The non-Gekiso example formation differs by only 8,385 points across all 120 orders, under 0.4%; that small spread is specific to the example, not every formation or Gekiso chart.",
        "In the examined skill family, a PERFECT-only bonus is 20 percentage points higher than the comparable ordinary score bonus. A GREAT removes that note's PERFECT-only bonus, while an ordinary bonus still scores at the GREAT factor. The break-even GREAT share for these skills is about 16–26% inside the skill window, depending on level. Use your accuracy in those windows, not the whole-song GREAT % alone, when comparing the two skill types.",
        "Ordinary live Snap effects follow their paired member through the shuffle and operate within that member's skill window. In the native example, a GREAT at 47 seconds converts to PERFECT with the correct pair; a wrong pair moves the window to 28 seconds and loses 350 points over the run. Converted PERFECTs can also receive the member's PERFECT-only bonus. Pair a conversion Snap with a suitable PERFECT-only member skill. Gekiso support effects instead follow their mission rules.",
        "For the examined skill family, levels 1–4 rise by 10 percentage points per step, while level 4→5 rises by 30. Upgrading Anon from 3→4 adds an average 9,705 points in the specified example formation; 4→5 adds 29,125. Prioritize the actual upgrade gain for your cards and charts rather than treating every level as equal.",
        "A single MISS can cost very different amounts depending on position. In the example, a break near the start or end costs little; at note 367 it loses 6.9%. The five skill windows contain only 29% of the notes but provide 45% of the score. Protecting accuracy and combo around valuable windows can matter more than the same overall judgement count elsewhere.",
        "For Gekiso, match the card's COMBO/JUST/LUCK mission to the song. Section bonuses can make those sections especially valuable. Individual skill gains cannot simply be added: conversions, combo saturation, Luck gauge growth and Rush can interact. Use a complete replay to evaluate a concrete combination."
      ],
      "after": [
        "The constant same-attribute member/Snap power bonus is separate from temporary support effects: the examined Snap Rank 1–5 bonuses are 5/10/15/20/25% to the paired member's power. Song Meta still uses the total power you enter; reference-member selection does not reconstruct owned-card growth or all formation power bonuses."
      ]
    },
    {
      "title": "Event strategy: score rankings, points and badges",
      "body": [
        "Choose the event goal before choosing the team. The following is a historical event case from JP 1.0.4 data, not a description of the currently running event. It has three separate challenge-song score rankings and no cumulative event-point ranking. Reward thresholds, bonuses and ranking types must be read from the event you are playing.",
        "Ordinary plays earn Challenge Points (CP), and Challenge plays spend them. In this case, spending 200/400/800/1,600 CP gives reward multipliers 1/2/4/8. Reward per CP is unchanged; higher spending saves repetitions. The event-point formula is the score grade's base reward times the spend multiplier and one plus the member bonus, with integer truncation.",
        "The example's matching Rank-1 bonuses add within each card: event SSR +30%, the 夢限大 group +20%, blue attribute +10%, up to +60% for one fully matching card. The matching Rank-5 example reaches +100% for one card; the initial five-card bonus team totals +225%. These percentages belong to that historical event and its card conditions. Member bonuses affect event points, while Snap bonuses affect badges.",
        "A higher grade raises the example's base reward by at least 20%, whereas another 10 bonus percentage points at a total bonus above +200% adds only about 3% to the final reward. Clear a reliable grade threshold first, then compare bonus and time. A high-bonus team can still outperform a higher-scoring team when it keeps enough reward bonus."
      ],
      "math": [
        "event pt = floor(grade base reward × spend multiplier × (1 + member bonus))",
        "historical EASY B: floor(2,550 × 3.25) = 8,287 pt per 200 CP",
        "historical Expert A: 3,250 × 2.4 = 7,800 pt per 200 CP"
      ],
      "after": [
        "In that example, the +225% team reliably reaches B on the shortest song's Easy chart and earns 8,287 points per 200 CP, compared with 7,800 for the score team's Expert A. B gives the same base reward at every difficulty, so the shortest reliably cleared Easy is the farming choice for that setup. This is not a universal claim that Easy is always best or a prediction for a different event."
      ],
      "defs": [
        [
          "Score rankings",
          "Maximize absolute score on the ranked songs. Use a score formation and compare the actual chart and skill combination."
        ],
        [
          "Event points",
          "Reach a reliable score grade, then maximize the relevant member bonus and reward per unit time. The historical rewards grant SR Ritsu copies at 100,000, 150,000, 200,000, 300,000 and 675,000 points."
        ],
        [
          "Badges",
          "Use the relevant Snap bonus for exchange rewards. In the historical case, 100,000 badges exchange for one Snap."
        ],
        [
          "Switching teams",
          "Use a score team in ordinary plays when a higher grade earns more CP. Switch to the appropriate member-bonus or Snap-bonus team for Challenge farming. Score ranking, point farming and badge farming can require three different formations."
        ]
      ]
    },
    {
      "title": "Reading and using the Song Meta controls",
      "body": [
        "Choose Gekiso Live or Free Live and a difficulty you can play consistently. The standard baseline uses full combo, positive life and ordinary, unconditional five-second score-up skills; card Gekiso skills are excluded. Gekiso defaults to first place in all three sections, JUST on eligible JUST-mission notes and PERFECT elsewhere. Free Live uses PERFECT throughout and no Gekiso effects.",
        "The five visible fields are the sole ordinary skill baseline in every mode: manual percentages for five-second, unconditional score-up skills. 100 means +100%, or a 2× note factor during that window. Selecting a reference member never replaces its slot's percentage with the card's original live skill or recalculates your entered power. Clear all only removes member and Snap selections, keeping these five values and power. Without a Snap selected, member selection alone does not activate replay or the member's Gekiso skill.",
        "In the linear summary below, divide the entered percentage by 100: 140% becomes u = 1.4. The standard ranking averages the 120 activation orders, so its expected score depends on the five bonuses' mean and the chart's activation weights. The summary has rounding limits; the full replay handles each integer note score. Equal standard skills remove order variation; Luck seeds can still vary the result. A chart's displayed level, BPM or density alone does not determine its scoring efficiency.",
        "GREAT % estimates GREAT judgements across the chart. With no GOOD, BAD, MISS or combo breaks assumed, 0% GREAT means 100% PERFECT before the separate JUST adjustment. The standard score is scaled by 1 − 0.2 × GREAT % / 100. JUST % blends the all-PERFECT and all-JUST baselines only for eligible notes in JUST mission sections, recomputing section bonuses and adjusting relevant skill weights. It is not the JUST share of the whole song. These are statistical approximations, not a replay of exact note positions.",
        "Score / power compares expected score at equal power; Score / power / min also includes play time. Duration can use BGM length or chart length (last note plus one second). Add your results/loading time as overhead. Relative compares efficiency with the best value in the current table. Hide dominated charts keeps the standard model's frontier across mean bonuses 0–150% and nonnegative overhead; Snap measurements do not offer this dominance guarantee.",
        "Event grades compares the power needed for your target SS/S/A/B grade. Grade thresholds belong to each song and are shared across difficulties. Free Live uses solo thresholds. Gekiso uses room total score; the page's selected player count assumes equal scores from every connected player. Grade chance counts the successful standard skill orders, not your personal chance of playing accurately."
      ],
      "math": [
        "u = entered skill bonus (%) / 100",
        "standard score / P = base + sum(u at activation k × weight k)",
        "expected score / P = base + mean(u) × sum of activation weights",
        "efficiency = expected score / (power × (duration + overhead))"
      ],
      "after": [
        "Open a chart row for the skill/Fever timeline, mission measures, activation weights and grade thresholds. Notes count judged notes; Main BPM is the tempo lasting longest between the first and last judged notes; density is judged notes divided by that interval. Song-specific power bonuses can change the power of the same formation between songs, so enter comparable power when interpreting the rankings."
      ]
    },
    {
      "title": "Single-play simulation, Snap profiles and remaining limits",
      "body": [
        "The single-play calculator uses the same Rust engine as the data tools, compiled to WASM in the browser. It replays explicit judgements frame by frame, including combo, life, skills, conversion and Gekiso settlement. It starts with no skills and PERFECT on judged notes; unscored nodes keep Pass. Export/import JSON for supported skill IDs and levels, member attributes, order, seed, placements and timing. Unknown notes, missing or duplicate results and invalid clocks are rejected.",
        "The Snap efficiency comparison runs a fixed profile on top of the five manual ordinary skill percentages and entered power: seed 1, 60 fps, order 1–5, the chosen judgement preset and fixed Solo Gekiso placements. While this replay is active, paired members supply condition attributes and the explicitly chosen supported Gekiso level. Their original live skills and growth power do not replace the manual baseline or power. Supported Snap effects apply when their conditions hold; they are evaluated by the complete replay. The GREAT/JUST settings generate one reproducible note input plan. Clearing members and Snaps returns to ordinary ranking with the same manual baseline and power retained.",
        "Snap efficiency divides one declared replay score by the shared entered power. Event grades and the selected grade in chart details additionally evaluate all 120 equally weighted skill orders, with physical member/Snap pairs and judgements fixed. Required power is the smallest integer from 1 to 20,000,000 whose mean score reaches the solo grade threshold. The hit fraction is qualifying orders divided by 120; target plays per hour also includes the declared cycle time. This is an order model, not an every-play guarantee. Unsupported random schedules, absent thresholds, unproved inverses and unreachable targets have separate states. Any baseline comparison uses the same order model. Dominance and owned-formation search are separate capabilities.",
        "Gekiso aptitude compares the nominal expectations with and without one skill under independent lottery and skill probabilities. In the new data, each pair is an expectation and an outward numerical interval half-width. It is not a sample standard error or the spread of individual plays. Replay seeds select individual simulations and do not change these expectations. Individual skill gains do not predict a combined formation. Missing weights, endpoints or rank-linear support remain unavailable. Legacy files keep their original sampled interpretation until replaced.",
        "A complete replay is needed for combo breaks, judgement positions and interacting conversion or cumulative effects. Raw-touch window effects need original result metadata. The default frame clock is 60 Hz, with 30/120 Hz also supported; clock timing can affect activation and settlement. Frame display score, settled score and sampled maximum combo are distinct outputs. Results do not independently classify phone touch inputs or reproduce opponents, network delays, the full results flow or server rewards."
      ]
    },
    {
      "title": "Validation against native client code",
      "body": [],
      "table": {
        "headers": [
          "Test case and inputs",
          "Checks performed",
          "Result",
          "Limits of this check"
        ],
        "rows": [
          [
            "10000201; power 300000; no skills; Gekiso off",
            "5500 frames, 13 fields, 71500 comparisons; 364 judgement events",
            "No differences; six float32 factor states match by bits",
            "Fresh run without rewinding; the simulator's sampled max combo is distinct from the protected live max-combo value"
          ],
          [
            "Five members with ordinary skill 1; all Perfect and mixed Perfect/Great/Good/Bad/Miss",
            "5500 frames per case; 253000 core comparisons per case; native SkillExecutor trigger/pool/phases and applier dispatch",
            "No differences; maximum float32 difference: 0 ULP",
            "Only the unconditional effect-2000 family; the elapsed-time mirror is excluded, and the complete game lifecycle was not tested"
          ],
          [
            "Real skills 1/4/6/7/5; high/medium/low accuracy × 30/60/120 fps",
            "Nine cases: 57750 frames; 35 effect-pool instances; 18826500 core comparisons; chart events and converted judgements in order",
            "No differences; maximum float32 difference: 0 ULP",
            "Selected target and life-condition effects; not all skills or input windows"
          ],
          [
            "Nonzero per-note timing offsets",
            "Native judgements: 274 Perfect / 58 Great / 32 Good; 5500 frames and 1793000 core comparisons",
            "No differences; maximum float32 difference: 0 ULP",
            "The native client classifies the automatic input; Rust consumes those judgements rather than independently replaying touch input"
          ],
          [
            "Life condition boundary 700→600",
            "5500 frames; 45 effect-pool instances; 2288000 core comparisons",
            "No differences; maximum float32 difference: 0 ULP",
            "The high-life effect is selected at 700 and continues at 600; the active effect does not switch to the low-life branch"
          ],
          [
            "Real skills 3/5/1/2/7 at level 5",
            "5500 frames; 1545500 core comparisons, including actual float32 skill factors",
            "No differences; compared maximum float32 difference: 0 ULP",
            "This skill combination only; value 13000 converts to 1.29999…, not a hand-entered 1.3"
          ],
          [
            "Real card Gekiso and support skills; eight high/medium/low accuracy and 30/60/120 fps cases",
            "48750 frames, 35777250 checks: pools, converted results, combo protection, cumulative Just, luck gauge and rush",
            "Zero differences in declared fields; bit-for-bit float32 match",
            "Specified card and support configurations only; power-dependent effects and complete failure/result transitions need separate checks"
          ],
          [
            "Dynamic Just windows through the published model’s public API",
            "1600-frame native capture; 9 window types, 39 units; 388800 window and 62400 core checks",
            "451200 checks, zero differences; enable state and window widths match",
            "Window states and widths, scoring, life and current combo; consumes classified judgements"
          ],
          [
            "Probability condition 4011; member card 43 / support 66; high life and life 600 with 4 Misses",
            "Two cases: 15000 frames, 10680000 core checks; 72 random-value, threshold and boolean checks",
            "Zero differences; final scores 2835163 / 2760861",
            "Seed 14 was selected to cover 5% success; fixed-input checks do not measure the probability distribution"
          ],
          [
            "Solo Gekiso combo / Just / luck; no card skills",
            "10000103 / 10000201 / 10000303; 19000 frames; 646000 integer comparisons",
            "No differences in the listed score channels, life, combo, random count and range states",
            "Some section counters and float32 fields still lack equivalent comparison fields; the observed frame score is separate from score()"
          ],
          [
            "Offline multiplayer combo / Just / luck; actual mixed judgements and life zero",
            "19000 frames; 646000 core comparisons; 76000 ranking-derived comparisons listed separately",
            "No differences; 431 native random draws in the luck case",
            "Excludes card skills, independent touch-window classification, full failure transitions and server rewards; derived ranking values are not direct production observations"
          ],
          [
            "Native multiplayer ranking",
            "572 invocation cases, including ties, secondary measures, missing inputs and error boundaries",
            "15259 exact comparisons, No differences",
            "A subsystem test, not 572 complete plays; the Rust API does not promise the original member order within tied groups"
          ],
          [
            "Challenge: None / FullCombo / AllPerfect assists; actual mixed grades",
            "Three cases, 5858 frames and 1382503 core checks; native Enter/Update/Exit",
            "Declared fields match; native Bad/Good retry branches also observed",
            "Retry decisions were observed on the native side; animations completed immediately, and the full result screen and server were not checked"
          ],
          [
            "Mission / Solo Gekiso; mixed judgements, combo breaks and zero life",
            "5502 frames, 1469049 core checks; 22008 derived ranking checks listed separately",
            "Zero differences; final score 439015; frame display and calculator scores checked separately",
            "The full result screen and server were not checked; derived ranks are not independent production observations"
          ],
          [
            "Free / Solo Gekiso / challenge / mission / battle / arena / tutorial",
            "Seven native setup entries and chart/bootstrap branches executed",
            "Entry evidence only; full mode coverage pending",
            "Entering a mode does not validate a full play; live event/Arena data and the server lifecycle need separate checks"
          ]
        ],
        "caption": "Client 1.0.1-25 · Checked 2026-09-30"
      },
      "after": [
        "These records concern client 1.0.1-25 and the checks dated 2026-09-30. All compared integers matched, and the compared float32 values matched bit for bit. The model also passed 272 regression tests, and per-note Rust and WASM results matched across the documented 340 charts. Matching two builds of the model is a consistency check; it is not additional proof against the game.",
        "The table describes specific inputs and fields, not blanket certification of every skill, touch pattern, mode or game update. It does not certify the latest JP client or online patches, physical touch replay, the complete results flow or server rewards. The page is a tool for comparing scenarios and investigating score differences within those limits."
      ]
    }
  ]
};
