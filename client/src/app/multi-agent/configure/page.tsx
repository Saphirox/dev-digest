/* Route: /multi-agent/configure[?pr=<prId>]. Thin entry over ConfigureRun; the
   Suspense boundary is required because ConfigureRun reads `?pr=`. */
import { Suspense } from "react";
import { ConfigureRun } from "./_components/ConfigureRun";

export default function ConfigureRunPage() {
  return (
    <Suspense>
      <ConfigureRun />
    </Suspense>
  );
}
