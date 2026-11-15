import { useEffect, useState } from "react";
import { marked } from "marked";
import { DOCS } from "../lib/docs";

const IDS = new Set(DOCS.map((d) => d.id));

// Files written as "SOMETHING.md" in the documents point to the other documents inside the site.
function fixLinks(html: string): string {
  return html.replace(/href="(?:[^"]*\/)?([A-Z_]+)\.md"/g, (m, id) => (IDS.has(id) ? `href="#/docs/${id}"` : m));
}

export default function DocPage({ id }: { id: string }) {
  const doc = DOCS.find((d) => d.id === id);
  const [html, setHtml] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setHtml(""); setErr("");
    if (!doc) { setErr("This document does not exist."); return; }
    fetch(`docs/${id}.md`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then((t) => setHtml(fixLinks(marked.parse(t, { gfm: true, async: false }) as string)))
      .catch((e) => setErr(`Could not load the document (${e.message}).`));
    window.scrollTo?.(0, 0);
    document.querySelector(".docpage")?.scrollTo?.(0, 0);
  }, [id, doc]);

  return (
    <div className="landing docpage">
      <header className="lnav">
        <a className="lbrand" href="#/"><Mark />Compass</a>
        <nav className="llinks"><a href="#/">Home</a><a href="#/docs/USER_GUIDE">Guide</a><a href="#/docs/PRINCIPLES">Science</a></nav>
        <a className="lbtn primary sm" href="#/app">Open the planner</a>
      </header>
      <div className="docwrap">
        <aside className="docnav" aria-label="Documents">
          <div className="docnav-t">Documents</div>
          {DOCS.map((d) => <a key={d.id} href={`#/docs/${d.id}`} className={d.id === id ? "on" : ""}>{d.title}</a>)}
        </aside>
        <article className="prose">
          {err && <p className="derr">{err}</p>}
          {!err && !html && <p className="mutl">Loading…</p>}
          {/* the documents are this project's own files, copied into public/docs */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </div>
  );
}

export function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" fill="none" stroke="#e9eff8" strokeWidth="1.5" />
      <path d="M13 3.5 L16 13 L13 22.5 L10 13 Z" fill="#f5a344" />
      <path d="M13 3.5 L16 13 L10 13 Z" fill="#ffd199" />
      <circle cx="13" cy="13" r="1.6" fill="#0f1a2c" />
    </svg>
  );
}
