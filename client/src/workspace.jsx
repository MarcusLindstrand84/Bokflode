import { createContext, useContext, useMemo, useState } from "react";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [year] = useState(2026);
  const [month, setMonth] = useState(8);
  const [tab, setTab] = useState("oversikt");
  const [prefill, setPrefill] = useState(null);
  const [tick, setTick] = useState(0);
  const [serverLabel, setServerLabel] = useState("");

  const value = useMemo(() => ({
    year,
    month,
    setMonth,
    tab,
    go: (next) => setTab(next),
    prefill,
    setPrefill,
    book: (p) => {
      setPrefill(p);
      setTab("ny");
    },
    tick,
    refresh: () => setTick((t) => t + 1),
    serverLabel,
    setServerLabel
  }), [year, month, tab, prefill, tick, serverLabel]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace måste användas inuti WorkspaceProvider");
  return ctx;
}
