export const GITHUB = "https://github.com/mounishmavuduru-bot";
export const LINKEDIN =
  "https://www.linkedin.com/in/mounish-mavuduru-aa62723b2";
export const EMAIL = "mounishmavuduru@gmail.com";

export const projects = [
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

export const awards = [
  { name: "2nd Place", org: "City-Level Art Show" },
  { name: "2nd Place", org: "City-Level Art Show" },
  { name: "3rd Place", org: "City-Level Art Show" },
  { name: "Outstanding Statesman", org: "Texas Youth & Government" },
];

export const positions = [
  { role: "Vice President", org: "Debate Team" },
  { role: "Class President", org: "" },
  { role: "Legislative Director", org: "Youth & Government" },
  { role: "Finance Director", org: "GEMHS" },
  { role: "Chief Operating Officer", org: "Solace" },
];

export type Site = "projects" | "achievements" | "positions";

export const siteLabels: Record<Site, string> = {
  projects: "Projects",
  achievements: "Achievements",
  positions: "Positions",
};
