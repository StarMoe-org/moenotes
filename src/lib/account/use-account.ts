import { useEffect, useState } from "react";
import { type AccountState, loadAccount, subscribeAccount } from "@/lib/account/client";

/** The account state for a component: null while loading, then kept current across the page. */
export function useAccount(): AccountState | null {
  const [state, setState] = useState<AccountState | null>(null);
  useEffect(() => {
    let active = true;
    void loadAccount().then((loaded) => {
      if (active) setState(loaded);
    });
    const unsubscribe = subscribeAccount(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return state;
}
