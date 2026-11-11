import { getT } from "@/i18n/server";
import { GettingStartedWidget } from "./getting-started-widget";

export type GettingStartedStep = {
  key: string;
  title: string;
  description: string;
  done: boolean;
  cta: { label: string; href: string };
};

/** First-run guide, floating in the bottom-right corner. Renders nothing once every step is done. */
export async function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const t = await getT("overview");

  return (
    <GettingStartedWidget
      steps={steps}
      labels={{
        title: t("gettingStarted.title"),
        intro: t("gettingStarted.intro"),
        progress: t("gettingStarted.progress", { done: doneCount, total: steps.length }),
        open: t("gettingStarted.open"),
        minimize: t("gettingStarted.minimize"),
        stepSr: steps.map((s, i) => `${t("gettingStarted.stepSr", { n: i + 1 })}${s.done ? `, ${t("gettingStarted.doneSr")}` : ""}: `),
      }}
    />
  );
}
