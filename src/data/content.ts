export const GITHUB = "https://github.com/mounishmavuduru-bot";
export const LINKEDIN =
  "https://www.linkedin.com/in/mounish-mavuduru-aa62723b2";
export const EMAIL = "mounishmavuduru@gmail.com";

export const TAGLINE =
  "Builder, researcher, and aspiring cardiothoracic surgeon.";

// Ordered by perceived importance (top = most weight).
// `note` is the operative note shown when a project row is opened in the
// dropdown — short, plain, first-person. Edit freely.
export const projects = [
  {
    name: "Solace",
    tag: "Startup · COO",
    note: "Chief operating officer at Solace. I own the day-to-day operations and turn the plan into things that actually ship.",
  },
  {
    name: "Plasma-based miRNA biomarkers for SCLC diagnosis",
    tag: "Meta-analysis",
    note: "A meta-analysis pulling together plasma microRNA studies to weigh how well they flag small-cell lung cancer at diagnosis.",
  },
  {
    name: "ResearchRecap",
    tag: "Product",
    note: "A tool I built to make dense research easier to actually keep up with.",
  },
  {
    name: "Linguistic relativity, intertemporal choice, and the structural bias of behavioral economic policy",
    tag: "Systematic review",
    note: "A systematic review tracing how linguistic relativity and intertemporal choice surface a structural bias in behavioral-economic policy.",
  },
  {
    name: "Student Voice Initiative",
    tag: "Civic",
    note: "A civic project building a real channel for students into the decisions that affect them.",
  },
];

export const awards = [
  { name: "Outstanding Statesman", org: "Texas Youth & Government" },
  { name: "City-Level Art Show Winner", org: "Multiple placements" },
];

export const positions = [
  { role: "Chief Operating Officer", org: "Solace" },
  { role: "Class President", org: "" },
  { role: "Legislative Director", org: "Youth & Government" },
  { role: "Finance Director", org: "GEMHS" },
  { role: "Vice President", org: "Debate Team" },
];

export type Site = "projects" | "achievements" | "positions";

export const siteLabels: Record<Site, string> = {
  projects: "Projects",
  achievements: "Achievements",
  positions: "Positions",
};
