"use client";

// Applies the stored theme before paint to avoid a flash. Light is the default;
// "system" follows the OS only when the user picked it explicitly.
const themeScript = `try{var t=localStorage.getItem('mh-theme');var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

/**
 * Inline blocking theme script, emitted only in the server HTML.
 *
 * React 19 warns when it renders a <script> on the client (it never runs there).
 * The script only needs to run once, from the initial HTML, so the client render
 * returns nothing; React skips the extra server node in <head> during hydration.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  if (typeof window !== "undefined") return null;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
