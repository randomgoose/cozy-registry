import { useEffect } from "react";

export function CompatRouteRedirect(props: {
  to: string;
  title: string;
  description: string;
}) {
  useEffect(() => {
    window.location.replace(props.to);
  }, [props.to]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          {props.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {props.description}
        </p>
      </div>
    </div>
  );
}
