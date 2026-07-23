import type { Metadata } from "next";
import { StaticPage } from "@/components/static-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About — Keep Going",
  description: "Why Keep Going exists: big goals become doable when you break them into steps.",
};

export default function AboutPage() {
  return (
    <StaticPage>
      <section className="space-y-3 pt-4 text-center">
        <p className="text-4xl" aria-hidden>
          🏔️
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Keep going.</h1>
        <p className="text-lg text-muted-foreground">
          Everything starts with a small step.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Why this exists</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Big goals fail for a boring reason: they stay big. &ldquo;Learn to play the
            guitar&rdquo; or &ldquo;run a marathon&rdquo; is not something you can do today —
            so you do nothing today, and nothing tomorrow.
          </p>
          <p>
            <span className="font-medium text-foreground">Keep Going</span>{" "}
            is a small tool built around one idea: break a goal into groups and steps until
            the next step is something you can actually do. Then do it, check it off, and
            watch the progress bar move. That&apos;s the whole trick — momentum beats
            motivation.
          </p>
          <p>
            It started as a personal project — built for its author&apos;s own use, not as a
            product with a business plan behind it. It turned out useful, so it stayed online
            for anyone who wants it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Write down a goal — as big and scary as it really is.</li>
            <li>Split it into groups, and groups into concrete steps.</li>
            <li>Check off steps as you go; progress is computed for you.</li>
            <li>
              Optionally connect an AI agent over MCP, so your assistant can read and update
              your goals with you.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free to use</CardTitle>
          <CardDescription>A personal project, not a business.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Keep Going was made for personal use and is not run for profit. There is nothing to
            buy, no plan to upgrade to, and no trial that runs out.
          </p>
          <p>
            You&apos;re welcome to use it however it suits you — for your own goals, for as
            long as it helps. It is offered as is, with no promises about uptime or support.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Private by default.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <p>
            No sign-up is required to start — you get your own private space on the first
            visit. Your goals belong to you alone and are never shared with other users. You
            can create an account later to keep them across devices.
          </p>
        </CardContent>
      </Card>

      <section className="pt-2 pb-6 text-center text-sm text-muted-foreground">
        <p>
          One step today is enough.{" "}
          <span className="font-medium text-foreground">Keep going — and it will work out.</span>
        </p>
      </section>
    </StaticPage>
  );
}
