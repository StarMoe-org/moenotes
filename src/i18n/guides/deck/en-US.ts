import type { ChartDataGuide } from "@/i18n/guides/chart-data";

export const enUS: ChartDataGuide = {
  "title": "Goals, proofs of optimality and search strategy",
  "lead": "The deck page finds the 5 teams in your collection with the highest goal value. This guide explains what it optimizes, what “proven optimal” means exactly, and how the search proves it without trying every team.",
  "reminder": {
    "title": "Disclaimer",
    "text": "The scoring model comes from analyzing the game client. We reproduce it as closely as we can but do not guarantee it matches the game exactly. Where it differs from the game or other sources, trust those. “Proven optimal” is an algorithmic proof relative to this model and to the collection, progress and conditions you entered, not a guarantee about results in the game. The scoring model and the search are public in ournotes-deck."
  },
  "contentsLabel": "Contents",
  "sections": [
    {
      "id": "goal",
      "title": "What is optimized",
      "body": [
        "Each goal is a number the search makes as large as possible: for Gekisou Live and Free Live, the score on the chosen song and difficulty; for event points, the event points per live; for highest power, the team's power. For played lives, choose Average performance or Theoretical maximum under Search objective. Power and skipped lives have a single value, so this choice is not shown.",
        "Average performance (default): at the start of each live the members' skill order is shuffled. We treat the 120 orders of the five members as equally likely, simulate a whole live for each order (skills, Snap effects and, in Gekisou Live, the gekisou sections and rank bonuses) and average them. Where a skill or mission draws a lottery, the draw is averaged with the game's probabilities.",
        "Theoretical maximum ranks teams by the highest goal value reachable across skill orders and LUCK or other random outcomes with nonzero probability. Switching keeps your collection, song, difficulty and declared play, including Great, Just and Miss conditions. Reaching the value requires the corresponding random outcomes and is not guaranteed every live. The option is enabled only when the engine supports the current conditions.",
        "Play: by default the play is the theoretical best, all Perfect, with every Just-eligible note in Gekisou Live hit Just. When you change the Great or Just rate under “Play assumptions”, that share of Greats and non-Just judgements is spread evenly over the whole chart and the live is computed again. It describes a declared play, not a prediction of how you will play.",
        "A team is a leader, 4 other members and the Snap paired with each. Swapping the positions of the 4 members does not change the score, so the positions in a result are only for display."
      ]
    },
    {
      "id": "domain",
      "title": "Candidates",
      "body": [
        "The candidates D are every legal team in your collection: those allowed by the game's formation rules and by the required and excluded cards under “Card restrictions”. Each choice of leader, members and Snap pairing is a separate candidate.",
        "The computation uses the card progress you entered (level, training, rank, skill levels) and your player bonuses. Missing values are listed for you to fill in first; when a result does not cover every card you own, the page says so."
      ]
    },
    {
      "id": "proven",
      "title": "Definition of “proven optimal”",
      "body": [
        "“Proven optimal” means: among the complete set D of legal candidates, the results listed are exactly the first min(K, |D|) teams ordered by goal value (descending), then power (descending), then canonical ID order, where K is the number of teams the page returns (5). Team choice, ranks and the order of ties are all settled.",
        "The proof applies to the selected objective under the declared play conditions: the probability-weighted average for Average performance, or the highest reachable value for Theoretical maximum. It does not turn a possible maximum into a guaranteed outcome.",
        "The proof does not evaluate every team. Each candidate has either been compared exactly with the results or been ruled out by a sound upper bound: the best value it can reach is already below the exact value of the K-th team. This is neither sampling nor an approximation.",
        "If D is empty, “proven” means no team is feasible under these conditions.",
        "This is an algorithmic proof relative to the declared scoring model and relies on the model, the bounds and the program being correct. Cards you have not entered, wrong progress values and mistakes in an actual play are outside the computation."
      ],
      "defs": [
        ["Goal value", "The exact value of the chosen goal and objective: its probability-weighted average or its highest reachable value."],
        ["Upper bound", "An estimate guaranteed not to be below the true value. A candidate whose upper bound is already below the cutoff has a lower true value and can be ruled out."],
        ["Canonical ID order", "When goal value and power are equal, teams are ordered by a fixed order of card IDs, so the same input always gives the same result."]
      ]
    },
    {
      "id": "unproven",
      "title": "“Not proven” and the best so far",
      "body": [
        "“Not proven” means the exact search has not finished proving optimality; the results so far may or may not be optimal.",
        "This happens when the search reaches the time limit you chose or you stop it. The page lists the best teams found so far, each computed exactly, together with two numbers: the best so far and the value the optimum is at most. No team exceeds the second, so the true optimum lies between the two; the smaller the gap, the closer the result is to the optimum.",
        "To get a proof, choose a longer time limit or “No limit” and run again."
      ]
    },
    {
      "id": "search",
      "title": "Search strategy",
      "body": [
        "The number of teams grows very fast with the collection, so simulating each one is not feasible. The search is a branch and bound: it builds candidates step by step (the leader first, then members and Snaps) and bounds the best value each partial team can still reach. Once that bound is below the exact value of the current K-th team, no team in that branch can enter the results and the whole branch is pruned.",
        "The bounds come in two layers. Partial teams are bounded from precomputed tables, which is fast and only ever overestimates; only complete five-member teams are simulated over a whole live. In Average performance, the 120 orders and lottery draws are first enclosed in intervals and refined to exact values only when the intervals cannot separate the ranks.",
        "The higher the cutoff, the more is pruned. The search finds strong teams early and computes them exactly to set the cutoff, then raises it each time it finds a better team.",
        "Candidates are split by leader into disjoint groups that are searched separately and merged. The split does not change the result: the same input always gives the same teams and ranks.",
        "At the time limit the search stops and reports the best teams so far and an upper bound over the remaining candidates, the two numbers shown with “not proven”."
      ]
    },
    {
      "id": "result",
      "title": "Reading a result",
      "body": [
        "Each result shows the goal value, the power, the formation in the game's own style, and for each position the member card, its progress and the paired Snap.",
        "A goal value is sometimes shown as an interval that contains the exact value, for example while a skill with a lottery has not been refined yet.",
        "When an Average performance calculation finishes, each team lists the orders with the lowest, median and highest score among the 120. A Theoretical maximum result shows a skill order for the highest selected goal value; the corresponding LUCK and other random outcomes are still required. The objective label belongs to that calculation. Changing the objective marks it as a previous result until you recalculate."
      ]
    },
    {
      "id": "sources",
      "title": "Source code",
      "body": [
        "The scoring model (crates/ournotes-sim) and the search (crates/ournotes-search) are public in the empty-sekai/ournotes-deck repository on GitHub; the deck page links to both at the top."
      ]
    }
  ]
};
