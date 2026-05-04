"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Direction = 1 | -1;

type MobileNavContextValue = {
  direction: Direction;
  setForward: () => void;
  setBackward: () => void;
};

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [direction, setDirection] = useState<Direction>(1);

  useEffect(() => {
    const handlePopState = () => setDirection(-1);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const value = useMemo(
    () => ({
      direction,
      setForward: () => setDirection(1),
      setBackward: () => setDirection(-1)
    }),
    [direction]
  );

  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNavDirection() {
  const context = useContext(MobileNavContext);
  if (!context) {
    throw new Error("useMobileNavDirection must be used within MobileNavProvider");
  }
  return context;
}
