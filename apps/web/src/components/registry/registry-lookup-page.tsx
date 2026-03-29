import { useEffect, useState } from "react";
import { fetchRegistryLookup } from "../../lib/platform";

type RegistryLookupPageProps = {
  itemName: string;
};

export function RegistryLookupPage({ itemName }: RegistryLookupPageProps) {
  const [status, setStatus] = useState<"loading" | "not-found" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();

    fetchRegistryLookup(itemName, controller.signal)
      .then((item) => {
        if (!item) {
          setStatus("not-found");
          return;
        }

        window.location.replace(`/registry/${item.owner}/${item.name}`);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to resolve registry lookup", error);
        setStatus("error");
      });

    return () => controller.abort();
  }, [itemName]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <div className="rounded-[28px] border border-zinc-200/80 bg-white/90 p-8 dark:border-zinc-800 dark:bg-zinc-900/90">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          {status === "loading"
            ? "Resolving registry item…"
            : status === "not-found"
              ? "Item not found"
              : "Unable to resolve item"}
        </h1>
      </div>
    </div>
  );
}
