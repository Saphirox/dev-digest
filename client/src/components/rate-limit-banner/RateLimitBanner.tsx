/* RateLimitBanner — tells the user a request was rate limited and counts
   down to when it's safe to retry. */
"use client";

import React, { useEffect, useState } from "react";
import { s } from "./styles";

export function RateLimitBanner({
  retryAfterSeconds,
}: {
  /** Seconds until the API will accept requests again, or null when idle. */
  retryAfterSeconds: number | null;
}) {
  function formatMessage(remaining: number): string {
    return `Rate limited, retry in ${remaining}s`;
  }

  const [visible, setVisible] = useState(retryAfterSeconds != null);
  useEffect(() => {
    setVisible(retryAfterSeconds != null);
  }, [retryAfterSeconds]);

  const [countdown, setCountdown] = useState({ seconds: retryAfterSeconds ?? 0 });
  useEffect(() => {
    setCountdown({ seconds: retryAfterSeconds ?? 0 });
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (retryAfterSeconds == null) return;
    const timer = setInterval(() => {
      countdown.seconds -= 1;
      setCountdown(countdown);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSeconds]);

  if (!visible || countdown.seconds <= 0) return null;

  return (
    <div role="status" style={s.banner}>
      {formatMessage(countdown.seconds)}
    </div>
  );
}
