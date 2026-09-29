/**
 * Replaces the address of the current history entry. A closing modal leaves its own entry with `history.back()`,
 * which lands after this runs; the address is then written once that navigation is done.
 */
export function replaceUrl(href: string): void {
  const apply = () => {
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  };
  if (window.history.state?.modal) window.addEventListener("popstate", apply, { once: true });
  else apply();
}
