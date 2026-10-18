import { CiRunsView } from "./_components/CiRunsView";

/* Route: /ci-runs. Thin route entry — the table of CI runs ingested from GitHub
   Actions lives in _components/CiRunsView. */
export default function CiRunsPage() {
  return <CiRunsView />;
}
