import { useId, type ReactNode } from "react";
import "@/styles/deck-composer.css";

export interface DeckComposerGoal {
  id: string;
  title: string;
  description: string;
  icon?: ReactNode;
  disabled?: boolean | undefined;
}

export interface DeckComposerProps {
  goals: readonly DeckComposerGoal[];
  selectedGoal: string;
  onGoalChange: (id: string) => void;
  labels: { goal: string; conditions: string; collection: string; team: string; cards: string; questions: string };
  collection: ReactNode;
  conditions: ReactNode;
  team: ReactNode;
  primaryAction: ReactNode;
  teamActions?: ReactNode;
  questions?: ReactNode;
  cards?: ReactNode;
  notice?: ReactNode;
}

/** A persistent workbench. The caller owns every fact, constraint, modal, and action. */
export default function DeckComposer({ goals, selectedGoal, onGoalChange, labels, collection, conditions, team,
  primaryAction, teamActions, questions, cards, notice }: DeckComposerProps) {
  const id = useId();
  const activeGoal = goals.find(goal => goal.id === selectedGoal);

  return <div className="dc-composer">
    <section className="dc-collection" aria-labelledby={`${id}-collection`}>
      <h2 id={`${id}-collection`}>{labels.collection}</h2>
      <div className="dc-collection-content">{collection}</div>
    </section>

    <div className="dc-layout">
      <aside className="dc-controls">
        <section className="dc-panel dc-goal-section" aria-labelledby={`${id}-goal`}>
          <div className="dc-section-heading"><h2 id={`${id}-goal`}>{labels.goal}</h2></div>
          <div className="dc-goals" role="group" aria-labelledby={`${id}-goal`}>
            {goals.map(goal => <button className="dc-goal" type="button" key={goal.id} aria-pressed={selectedGoal === goal.id}
              disabled={goal.disabled} title={goal.disabled ? goal.description : undefined} onClick={() => onGoalChange(goal.id)} aria-describedby={selectedGoal === goal.id ? `${id}-goal-description` : undefined}>
              {goal.icon && <span className="dc-goal-icon" aria-hidden="true">{goal.icon}</span>}
              <span className="dc-goal-title">{goal.title}</span>
              <span className="dc-goal-check" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            </button>)}
          </div>
          {activeGoal && <p className="dc-goal-description" id={`${id}-goal-description`}>{activeGoal.description}</p>}
        </section>

        <section className="dc-panel dc-settings" aria-labelledby={`${id}-conditions`}>
          <div className="dc-section-heading"><h2 id={`${id}-conditions`}>{labels.conditions}</h2></div>
          <div className="dc-conditions">{conditions}</div>
        </section>
      </aside>

      <div className="dc-main">
        <section className="dc-panel dc-team" aria-labelledby={`${id}-team`}>
          <div className="dc-section-heading"><h2 id={`${id}-team`}>{labels.team}</h2>
            {teamActions && <div className="dc-team-actions">{teamActions}</div>}
          </div>
          <div className="dc-team-content">{team}</div>
          {notice && <div className="dc-notice" role="status">{notice}</div>}
          <div className="dc-primary-action">{primaryAction}</div>
        </section>

        {questions && <section className="dc-panel dc-questions" aria-labelledby={`${id}-questions`}>
          <div className="dc-section-heading"><h2 id={`${id}-questions`}>{labels.questions}</h2></div>
          <div className="dc-question-content">{questions}</div>
        </section>}

        {cards && <section className="dc-panel dc-card-pool" aria-labelledby={`${id}-cards`}>
          <div className="dc-section-heading"><h2 id={`${id}-cards`}>{labels.cards}</h2></div>
          <div className="dc-card-content">{cards}</div>
        </section>}
      </div>
    </div>
  </div>;
}
