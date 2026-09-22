"use client";

import { useEffect, useRef } from "react";
import { prototypeMarkup } from "@/lib/prototype-markup";
import { runPrototype } from "@/lib/run-prototype";

export default function NodApp() {
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against React Strict Mode's dev-only double-invoke, which would
    // otherwise bind every event listener in runPrototype() twice.
    if (initialized.current) return;
    initialized.current = true;
    return runPrototype();
  }, []);

  return (
    <div dangerouslySetInnerHTML={{ __html: prototypeMarkup }} />
  );
}