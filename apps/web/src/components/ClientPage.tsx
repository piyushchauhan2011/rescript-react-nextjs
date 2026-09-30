"use client";
import { make as App } from "@repo/ui/App";
import { make as Inspector } from "@repo/ui/Inspector";
import type { page, decisionSnapshot } from "@repo/core/DecisionTypes";
import type { homeCatalog } from "@repo/core/Catalog";
import type { pageSearch } from "@repo/core/Search";
export default function ClientPage(props: {
  page: page;
  catalog: homeCatalog;
  snapshot: decisionSnapshot;
  search: pageSearch;
  production: boolean;
}) {
  return (
    <App {...props}>
      {process.env.NODE_ENV !== "production" ? (
        <Inspector result={props.snapshot} search={props.search} />
      ) : null}
    </App>
  );
}
