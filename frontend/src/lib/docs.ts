export interface DocInfo { id: string; title: string; blurb: string }

// Markdown documents served from public/docs (copies of the files in the project root and research/).
export const DOCS: DocInfo[] = [
  { id: "USER_GUIDE", title: "User guide", blurb: "How to plan a walk, read a route card, use your own data, with four worked examples." },
  { id: "PRINCIPLES", title: "Mathematics and science", blurb: "Every formula behind slope, sun position, signal delay, route scoring, A* planning and the two trained models." },
  { id: "DATA_REPORT", title: "Data sources report", blurb: "What each NASA and USGS source offers, how it was tested, what worked and what did not." },
  { id: "DATA_FILES", title: "Data files", blurb: "The static files the app loads, field by field, and how the terrain grid is decoded." },
  { id: "HOW_WE_BUILT_IT", title: "How it was built", blurb: "The build in order, how the data is integrated, decisions made, problems met, what was and was not verified." },
  { id: "MISSION_CONCEPT", title: "Mission concept", blurb: "Why COMPASS exists, the gaps it targets, and the status of every promise." },
  { id: "SUBMISSION", title: "Submission pack", blurb: "Project summary, demo scripts, datasets used and how the project meets the judging criteria." },
];
