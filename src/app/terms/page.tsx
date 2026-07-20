import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Terms of Use — Keep Going",
  description: "The plain-language terms for using Keep Going.",
};

const UPDATED = "July 17, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <StaticPage title="Terms of Use">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Terms of Use</h1>
        <p className="text-sm text-muted-foreground">Last updated: {UPDATED}</p>
      </div>

      <Section title="What Keep Going is">
        <p>
          Keep Going (keepgoing.you) is a free tool for breaking goals into steps and tracking
          progress. By using it you agree to these terms — they&apos;re short and written to be
          read.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          The goals, steps, and notes you create are yours. We claim no ownership of them and
          only store them to provide the service. You are responsible for what you write; do
          not use the app to store content that is illegal or infringes someone else&apos;s
          rights.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          An anonymous account is created for you on first visit and lives in a browser
          cookie. Keep in mind that clearing cookies without signing up first means losing
          access to that account. Keep your personal access token secret — anyone who has it
          can read and edit your goals; rotate it on the Settings page if it leaks.
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Don&apos;t abuse the service: no attempts to break in, disrupt it for others, or
          place unreasonable load on it (including through automated access and the MCP API).
          We may suspend accounts that do.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo;, free of charge, without warranties of
          any kind. We work to keep it available and your data safe, but we cannot guarantee
          uninterrupted service and are not liable for lost data or any damages arising from
          use of the app — to the maximum extent permitted by law.
        </p>
      </Section>

      <Section title="Changes to the service or terms">
        <p>
          The app evolves, and these terms may change with it. The date at the top reflects
          the latest revision; continuing to use the app after a change means you accept the
          updated terms.
        </p>
      </Section>

      <Section title="And finally">
        <p>Set a goal, take the next small step, and keep going — it will work out.</p>
      </Section>
    </StaticPage>
  );
}
