import Link from "next/link";

const GITHUB = "https://github.com/mounishmavuduru-bot";
const LINKEDIN =
  "https://www.linkedin.com/in/mounish-mavuduru-aa62723b2";
const EMAIL = "mounishmavuduru@gmail.com";

const projects = [
  { name: "Student Voice Initiative", tag: "Civic" },
  { name: "ResearchRecap", tag: "Product" },
  {
    name: "Plasma-based miRNA biomarkers for SCLC diagnosis",
    tag: "Meta-analysis",
  },
  {
    name: "Linguistic relativity, intertemporal choice, and the structural bias of behavioral economic policy",
    tag: "Systematic review",
  },
];

const awards = [
  { name: "2nd Place", org: "City-Level Art Show" },
  { name: "2nd Place", org: "City-Level Art Show" },
  { name: "3rd Place", org: "City-Level Art Show" },
  { name: "Outstanding Statesman", org: "Texas Youth & Government" },
];

const positions = [
  { role: "Vice President", org: "Debate Team" },
  { role: "Class President", org: "" },
  { role: "Legislative Director", org: "Youth & Government" },
  { role: "Finance Director", org: "GEMHS" },
  { role: "Chief Operating Officer", org: "Solace" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <span className="tag-dot" />
      <span className="text-xs uppercase tracking-[0.22em] text-muted font-mono">
        {children}
      </span>
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass glass-hover rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}

function IconGitHub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.21 1.79 1.21 1.04 1.78 2.74 1.27 3.41.97.1-.76.41-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.47.11-3.06 0 0 .98-.31 3.2 1.18A11.1 11.1 0 0 1 12 6.8c.99 0 1.99.13 2.92.39 2.22-1.49 3.2-1.18 3.2-1.18.63 1.59.23 2.77.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.7 5.4-5.26 5.68.42.36.79 1.07.79 2.16v3.2c0 .3.21.67.8.55C20.21 21.38 23.5 17.08 23.5 12 23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.86-3.04-1.86 0-2.15 1.45-2.15 2.95v5.66H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="flex-1 w-full">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/30 border-b border-white/[0.06]">
        <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-sm tracking-tight text-white/90 hover:text-white"
          >
            mounish.
          </Link>
          <div className="flex items-center gap-6 text-sm text-white/60">
            <a href="#projects" className="hover:text-white transition-colors">
              Projects
            </a>
            <a href="#awards" className="hover:text-white transition-colors">
              Awards
            </a>
            <a href="#positions" className="hover:text-white transition-colors">
              Positions
            </a>
          </div>
        </nav>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-28 pb-24 md:pt-40 md:pb-32">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted mb-6">
          <span className="tag-dot mr-3 align-middle" />
          Personal site
        </p>
        <h1 className="text-gradient text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02]">
          Mounish Mavuduru
        </h1>
        <p className="mt-6 max-w-2xl text-lg md:text-xl text-white/70 leading-relaxed">
          Builder, researcher, and aspiring cardiothoracic surgeon.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="glass glass-hover rounded-full px-4 py-2.5 text-sm flex items-center gap-2 text-white/85"
          >
            <IconGitHub />
            GitHub
          </a>
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer"
            className="glass glass-hover rounded-full px-4 py-2.5 text-sm flex items-center gap-2 text-white/85"
          >
            <IconLinkedIn />
            LinkedIn
          </a>
          <a
            href={`mailto:${EMAIL}`}
            className="glass glass-hover rounded-full px-4 py-2.5 text-sm flex items-center gap-2 text-white/85"
          >
            <IconMail />
            Email
          </a>
        </div>
      </section>

      <section id="projects" className="max-w-5xl mx-auto px-6 py-20 scroll-mt-20">
        <SectionLabel>Projects</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p, i) => (
            <GlassCard key={i}>
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg md:text-xl font-medium text-white leading-snug">
                  {p.name}
                </h3>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-white/45 px-2 py-1 rounded-full border border-white/10">
                  {p.tag}
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <section id="awards" className="max-w-5xl mx-auto px-6 py-20 scroll-mt-20">
        <SectionLabel>Awards</SectionLabel>
        <div className="glass rounded-2xl overflow-hidden divide-y divide-white/[0.06]">
          {awards.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-6 py-5 hover:bg-white/[0.02] transition-colors"
            >
              <span className="text-white/90">{a.name}</span>
              <span className="text-sm text-white/55 font-mono">{a.org}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="positions" className="max-w-5xl mx-auto px-6 py-20 scroll-mt-20">
        <SectionLabel>Positions</SectionLabel>
        <div className="grid gap-3">
          {positions.map((p, i) => (
            <GlassCard key={i} className="!p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="text-white/95 font-medium">{p.role}</span>
                {p.org && (
                  <span className="text-sm text-white/55 font-mono">{p.org}</span>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-6 py-16 mt-12 border-t border-white/[0.06]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-sm text-white/45">
          <span className="font-mono">
            © {new Date().getFullYear()} Mounish Mavuduru
          </span>
          <div className="flex items-center gap-5">
            <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href={LINKEDIN} target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              LinkedIn
            </a>
            <a href={`mailto:${EMAIL}`} className="hover:text-white transition-colors">
              Email
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
