import { createFileRoute } from "@tanstack/react-router";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { IconExternalLink } from "nucleo-micro-bold";

export const Route = createFileRoute("/faq")({
  component: FAQComponent,
  head: () => ({
    meta: [
      { title: "Frequently Asked Questions - skowt.cc" },
      {
        name: "description",
        content: "Frequently asked questions about skowt.cc",
      },
      {
        name: "og:title",
        content: "Frequently Asked Questions - skowt.cc",
      },
      {
        name: "og:description",
        content: "Frequently asked questions about skowt.cc",
      },
    ],
  }),
});

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-display text-xl md:text-2xl text-foreground mb-5 tracking-tight">
      {children}
    </h2>
  );
}

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`space-y-4 ${className}`}>{children}</section>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-muted-foreground leading-[1.7]">{children}</p>;
}

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-4 mt-5">
      "{children}"
    </p>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground hover:text-muted-foreground transition-colors duration-200 underline decoration-border/50 underline-offset-2 hover:decoration-transparent"
    >
      {children}
      <IconExternalLink className="size-3" />
    </a>
  );
}

function FAQComponent() {
  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title="Frequently Asked Questions"
        description="Answers to common questions about skowt. If you're too lazy to read the entire thing, there's summary sections provided."
        className="mb-10"
      />

      <div className="columns-1 md:columns-2 gap-14 space-y-14 [&>*]:break-inside-avoid">
        <Section>
          <SectionHeader>Why is Discord login required?</SectionHeader>
          <Paragraph>
            You need to log in with Discord and be in our{" "}
            <ExternalLink href="https://discord.gg/noid">Discord</ExternalLink> to use skowt.cc.
            There's a valid reason behind it.
          </Paragraph>
          <Paragraph>
            skowt.cc is operated under Antifield LTD, ran by{" "}
            <ExternalLink href="https://dromzeh.dev">dromzeh</ExternalLink> (me hi hello). I'm the
            solo developer behind everything here, alongside my other platform,{" "}
            <ExternalLink href="https://originoid.co">Originoid</ExternalLink>, which I've been
            building for over 1,000 days. I've worked on skowt since I was 15, I make nothing from
            it, and it's expensive to run.
          </Paragraph>
          <Paragraph>
            Requiring the server means far fewer emails where the answer is "it's in the server",
            and more time for development. It also puts distance between me and years of users not
            crediting, being demanding, and sending death threats; it was damaging my mental health
            and my motivation to work on skowt.
          </Paragraph>
          <Summary>Keeps skowt alive and allows for more time to work on development.</Summary>
        </Section>

        <Section>
          <SectionHeader>What happened to wanderer.moe?</SectionHeader>
          <Paragraph>
            skowt.cc is wanderer.moe. Same site, same assets, same developer; we rebranded to a new
            name and moved to this domain. If you found us again through this page, welcome back.
          </Paragraph>
          <Summary>skowt.cc is the rebrand of wanderer.moe.</Summary>
        </Section>

        <Section>
          <SectionHeader>I'm having issues downloading</SectionHeader>
          <Paragraph>
            Use your actual browser (not the in-app ones such as TikTok or Twitter), turn off your
            VPN if you've got one, clear your cache in{" "}
            <ExternalLink href="/settings">/settings</ExternalLink> , and maybe slow down if you've
            been downloading a lot.
          </Paragraph>
          <Paragraph>If that's not the issue, give it a few minutes and try again.</Paragraph>
          <Summary>Real browser, no VPN, clear cache, patience.</Summary>
        </Section>

        <Section>
          <SectionHeader>How do I request new games or assets?</SectionHeader>
          <Paragraph>
            skowt gets hundreds of requests a month, it's hard to prioritize what to work on first.
            So there's a <ExternalLink href="/requests">requests page</ExternalLink> now.
            Contributors and staff add suggestions there, and anyone can upvote what they want.
          </Paragraph>
          <Paragraph>
            More votes means higher priority. No promises on when though. This is still a one-person
            hobby project and life happens.
          </Paragraph>
          <Summary>Vote on /requests. No ETAs, but votes help.</Summary>
        </Section>

        <Section>
          <SectionHeader>Why are so many assets missing?</SectionHeader>
          <Paragraph>
            I've been working on a{" "}
            <ExternalLink href="/request/019b6407-c456-7629-85f7-1f082bca095d">
              new system
            </ExternalLink>{" "}
            for the past couple months that will soon automate about 99% of asset updates. Once it's
            done, skowt can basically run itself.
          </Paragraph>
          <Paragraph>
            By "automatically running itself" it'll be able to figure out what assets are missing
            from versions; automatically map their names to make it readable then upload it on the
            site.
          </Paragraph>
          <Summary>Automation is in the works for more consistent updates.</Summary>
        </Section>

        <Section>
          <SectionHeader>What's the usage guidelines?</SectionHeader>
          <Paragraph>
            All assets come from official releases, promo materials, or community contributions that
            follow publisher guidelines, these are tagged as either fanmade or official.
          </Paragraph>
          <Paragraph>
            Usage depends on the publisher. Some have written fan content policies, others tolerate
            fan use without a formal licence, and leaked or unreleased content isn't allowed under
            any of them. We simply just make a place where it's easy to get everything.
          </Paragraph>
          <Paragraph>
            Game assets belong to their publishers, fan-made assets belongs to whoever made it. If
            you use an asset from skowt, credit it as the source. You will need to seek permission
            from the game publisher for commercial usage.
          </Paragraph>
          <Paragraph>
            Every asset page summarises what you can and can't do with that game's assets, taken
            from the publisher's own fan content terms. Where the publisher has a written policy, we
            link it there too if you want to read further into it.
          </Paragraph>
          <Summary>
            No unreleased content can be posted on skowt. Credit creators always; each asset page
            has the per-publisher rules.
          </Summary>
        </Section>

        <Section>
          <SectionHeader>What happens if you're banned from the Discord?</SectionHeader>
          <Paragraph>
            If you're banned from the Discord server, this means you obviously can't join, therefore
            you can't download. This is intentional. Bans are genuinely rare though, and each one is
            thoroughly investigated before being enforced.
          </Paragraph>
          <Paragraph>
            Most of the time, bans are issued towards toxic individuals. I'd rather you not be able
            to use skowt if you don't know how to behave.
          </Paragraph>
          <Summary>Honestly what do I even say here? skill issue tbqh</Summary>
        </Section>

        <Section>
          <SectionHeader>Is skowt safe?</SectionHeader>
          <Paragraph>
            Yes, it is. It's been around since 2022, many popular sites in which you probably use on
            the daily rely on skowt for assets; even developers at the companies which make the
            games on skowt use it! If you've ever downloaded assets from Pinterest before, 99% of
            the time they're reuploaded from skowt. The whole codebase is source-available on{" "}
            <ExternalLink href="https://github.com/skowtcc">GitHub</ExternalLink>, so anyone
            technical can check exactly how skowt works and what it does with your data.
          </Paragraph>
          <Paragraph>
            Alongside this, skowt is fully GDPR compliant and everything is hosted in the EU.
          </Paragraph>
          <Summary>Yes.</Summary>
        </Section>

        <Section>
          <SectionHeader>Is skowt open source?</SectionHeader>
          <Paragraph>
            No, and that's on purpose. skowt is source-available now: you can read the code and
            learn from how it's built, but you can't copy it, run it, deploy it, or spin up your own
            clone. Between AI scrapers being everywhere and the spam that comes with them, fully
            open source caused more problems than it solved.
          </Paragraph>
          <Paragraph>
            The code's on <ExternalLink href="https://github.com/skowtcc">GitHub</ExternalLink> for
            transparency and for the technical people who want to see how things work. It's a tRPC
            monorepo: TanStack Start on the web, Elysia on the server, Turso for the database, all
            in one repo with types shared end to end.
          </Paragraph>
          <Paragraph>There's no API access, sorry.</Paragraph>
          <Summary>
            Source-available, not open source. Read it freely, but there's no cloning and no API.
          </Summary>
        </Section>

        <Section>
          <SectionHeader>What data do you collect?</SectionHeader>
          <Paragraph>
            As little as needed. skowt stores your Discord UID, username, display name, profile
            picture, email and email verification status. For sessions and ratelimiting we log your
            IP address and user agent. You can request to see what data skowt has on you anytime by
            going to your <ExternalLink href="/settings">settings</ExternalLink>.
          </Paragraph>
          <Paragraph>
            There's no ads, no data selling, no tracking anything about what you do. You're here to
            download assets from games.
          </Paragraph>
          <Summary>Bare minimum.</Summary>
        </Section>

        <Section>
          <SectionHeader>How can I contribute?</SectionHeader>
          <Paragraph>
            Depends what you want to contribute. For assets: share them in our{" "}
            <ExternalLink href="https://discord.gg/noid">Discord server</ExternalLink> first.
            Uploaders with a good track record are given contributor access on the site, where
            uploads go into an approval queue before they're published.
          </Paragraph>
          <Paragraph>
            If you're a developer, the answer is no. Not to be impolite; skowt is something in which
            I care deeply about.
          </Paragraph>
          <Summary>Assets go through the Discord first; a track record earns site access.</Summary>
        </Section>

        <Section>
          <SectionHeader>Legal</SectionHeader>
          <Paragraph>
            skowt.cc is a hobby project operated under Antifield LTD, provided as-is with no
            guarantees about uptime or accuracy. Antifield LTD (Company No. 15988228) isn't liable
            for anything that goes wrong.
          </Paragraph>
          <Summary>No guarantees. Use at your own risk.</Summary>
        </Section>

        <Section>
          <SectionHeader>Content removal requests</SectionHeader>
          <Paragraph>
            If you are a game developer, publisher, or content creator and your work has been posted
            on skowt without your consent, you can request its removal by emailing{" "}
            <ExternalLink href="mailto:marcel@antifield.com">marcel@antifield.com</ExternalLink>.
            Please include the specific assets or pages you'd like removed and proof of ownership.
          </Paragraph>
          <Paragraph>
            Removal requests are taken seriously and are usually processed within 48 hours.
          </Paragraph>
          <Summary>Email marcel@antifield.com with details and proof of ownership.</Summary>
        </Section>

        <Section>
          <SectionHeader>My question isn't listed here!!</SectionHeader>
          <Paragraph>
            Depending on the nature of your question, it's best to just ask for help on the Discord
            server, we don't bite.
          </Paragraph>
          <Paragraph>
            If your issue is genuinely urgent, such as security, affecting your ability to use the
            site, or you want your account deleted, contact me via{" "}
            <ExternalLink href="mailto:marcel@antifield.com">marcel@antifield.com</ExternalLink> .
            Account deletions are respected and processed usually within 24-48 hours. Also, don't
            email me for general support or I will ignore it.
          </Paragraph>
          <Summary>Ask in the Discord, send an email if absolutely necessary</Summary>
        </Section>
      </div>
    </div>
  );
}
