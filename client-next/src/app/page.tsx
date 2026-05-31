"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const lastPath = localStorage.getItem("opencode-studio-last-path");
    if (lastPath) {
      window.location.replace(lastPath);
    } else {
      window.location.replace("/profiles");
    }
  }, []);

  return null;
}
