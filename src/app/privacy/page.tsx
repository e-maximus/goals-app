import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Keep Going",
  description: "What Keep Going stores, why, and what it never does with your data.",
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

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy Policy">
      <div className="space-y-2 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: {UPDATED}</p>
      </div>

      <Section title="The short version">
        <p>
          Keep Going stores your goals so you can come back to them. It does not track you, does
          not show ads, and does not sell or share your data. That&apos;s the whole policy — the
          rest is detail.
        </p>
      </Section>

      <Section title="What we store">
        <p>
          <span className="font-medium text-foreground">Your goals.</span> The goals, groups,
          steps, and notes you create are stored in our database so they&apos;re there when you
          return. They are private to your account and never visible to other users.
        </p>
        <p>
          <span className="font-medium text-foreground">A session cookie.</span> On your first
          visit we create an anonymous account for you and set an httpOnly cookie so the app
          recognizes you next time. No email, name, or password is required.
        </p>
        <p>
          <span className="font-medium text-foreground">Account details, if you sign up.</span>{" "}
          If you choose to create an account (to keep your goals across devices), sign-in is
          handled by <a className="underline hover:text-foreground" href="https://clerk.com/legal/privacy">Clerk</a>, our
          authentication provider, which stores the email address and profile details you give
          it.
        </p>
        <p>
          <span className="font-medium text-foreground">An access token for AI agents.</span>{" "}
          Your account has a personal access token that lets an AI assistant you configure read
          and edit your goals over MCP. It stays private to you, and you can rotate it on the
          Settings page at any time.
        </p>
      </Section>

      <Section title="What we don't do">
        <ul className="list-disc space-y-1 pl-5">
          <li>No analytics or tracking scripts.</li>
          <li>No advertising, and no advertising cookies.</li>
          <li>No selling, renting, or sharing your data with third parties.</li>
          <li>No reading your goals — they are yours.</li>
        </ul>
      </Section>

      <Section title="Where your data lives">
        <p>
          The app and its database are hosted on{" "}
          <a className="underline hover:text-foreground" href="https://railway.com/legal/privacy">Railway</a>. Data is
          stored there for as long as your account exists.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Delete your goals in the app at any time — deleted goals are gone from the database.
          To remove your account entirely, contact us and we&apos;ll erase it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes, the date at the top will be updated. Meaningful changes will
          be called out in the app.
        </p>
      </Section>
    </StaticPage>
  );
}
