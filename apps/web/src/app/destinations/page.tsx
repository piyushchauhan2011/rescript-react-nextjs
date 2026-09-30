import ClientPage from "../../components/ClientPage";
import { pageDecisions } from "../../server/page-data";
import { listDestinations } from "../../server/db/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Destinations({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await pageDecisions("destinations", await searchParams);
  const catalog = { destinations: listDestinations(data.search.destination), hotels: [] };
  return <ClientPage page="destinations" catalog={catalog} {...data} />;
}
