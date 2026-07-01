"use client";

import { useEffect } from "react";
import { sendHeartbeat } from "@/lib/api";

/**
 * Sends a heartbeat to the server every 30 seconds.
 * When the browser tab closes, heartbeats stop, and the server
 * auto-shuts down after 3 minutes of silence.
 *
 * 30s interval + 3min timeout accounts for browser tab throttling
 * (Chrome throttles background tabs to ~1/min).
 */
export function Heartbeat() {
  useEffect(() => {
    // Send initial heartbeat
    sendHeartbeat();

    const interval = setInterval(() => {
      sendHeartbeat();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return null;
}