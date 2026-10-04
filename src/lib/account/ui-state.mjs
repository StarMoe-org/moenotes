/** A synchronous gate shared by click handlers before React commits state. */
export function createOperationGate() {
  let locked = false;
  return {
    enter() { if (locked) return false; locked = true; return true; },
    leave() { locked = false; },
  };
}

export function canIssueKey(app) {
  return app.enabled && !app.keyError && (app.keys ?? []).filter((key) => key.revokedAt == null).length < 2;
}

export function toggleSelection(values, value, checked) {
  return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}
