import { useCallback, useEffect, useRef, useState } from 'react';

/** Longer messages stay up longer (~60 ms per character), between minMs and 9 s. */
export function useToast(minMs = 4000) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(timer.current);
    setToast(msg);
    const duration = Math.min(9000, Math.max(minMs, msg.length * 60));
    timer.current = window.setTimeout(() => setToast(null), duration);
  }, [minMs]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, showToast };
}
