import { useEffect, useState } from "react";
import type { Countdown } from "@/utils/format";
import { countdownTo } from "@/utils/format";

/** Live countdown to an ISO timestamp. Never fabricates a running state. */
export function useCountdown(target?: string | null): Countdown {
  const [state, setState] = useState<Countdown>(() => countdownTo(target));

  useEffect(() => {
    setState(countdownTo(target));
    if (!target) return;
    const id = window.setInterval(() => setState(countdownTo(target)), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return state;
}
