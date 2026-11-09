import { Panel } from "@/components/shared/card";
import { PreferencesForm } from "@/components/layout/preferences-form";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getT("settings"))("preferences.title") };
}

export default function PreferencesPage() {
  return (
    <Panel>
      <PreferencesForm />
    </Panel>
  );
}
