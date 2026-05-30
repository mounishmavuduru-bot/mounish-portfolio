export const GITHUB = "https://github.com/mounishmavuduru-bot";
export const LINKEDIN =
  "https://www.linkedin.com/in/mounish-mavuduru-aa62723b2";
export const EMAIL = "mounishmavuduru@gmail.com";

export const TAGLINE =
  "Builder, researcher, and aspiring cardiothoracic surgeon.";

// Ordered by perceived importance (top = most weight)
export const projects = [
  { name: "Solace", tag: "Startup · COO" },
  {
    name: "Plasma-based miRNA biomarkers for SCLC diagnosis",
    tag: "Meta-analysis",
  },
  { name: "ResearchRecap", tag: "Product" },
  {
    name: "Linguistic relativity, intertemporal choice, and the structural bias of behavioral economic policy",
    tag: "Systematic review",
  },
  { name: "Student Voice Initiative", tag: "Civic" },
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
