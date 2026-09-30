import ClientPage from "../components/ClientPage";
import { pageDecisions } from "../server/page-data";
import { listHomeCatalog } from "../server/db/catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await pageDecisions("home", await searchParams);
  return <ClientPage page="home" catalog={listHomeCatalog()} {...data} />;
}
