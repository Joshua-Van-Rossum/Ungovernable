import { useEffect, useRef, useState } from "react";
import { EmptyState, Spinner } from "../components/ui";
import { api } from "../lib/api";
import "./Projects.css";

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [newName, setNewName] = useState("");

  const load = async () => {
    const list = await api.get("/projects");
    setProjects(list);
    setActiveId((cur) => cur ?? list[0]?.id ?? null);
    return list;
  };
  useEffect(() => {
    load().catch(() => setProjects([]));
  }, []);

  const active = projects?.find((p) => p.id === activeId) || null;

  const addProject = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const p = await api.post("/projects", { name: newName.trim() });
    setNewName("");
    const list = await load();
    setActiveId(p.id || list[list.length - 1]?.id);
  };

  const removeProject = async (id) => {
    await api.del(`/projects/${id}`);
    setActiveId(null);
    const list = await load();
    setActiveId(list[0]?.id ?? null);
  };

  return (
    <div className="proj">
      <div className="proj__title">
        <h1>Projects</h1>
        <p className="proj__sub">A line per project. Click in to take notes.</p>
      </div>

      <div className="proj__layout">
        <aside className="proj__list">
          <form className="proj__add" onSubmit={addProject}>
            <input
              placeholder="New project…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn--primary btn--sm" aria-label="Add">+</button>
          </form>
          {!projects ? (
            <Spinner />
          ) : projects.length === 0 ? (
            <p className="proj__empty">No projects yet.</p>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    className={`proj__item ${p.id === activeId ? "is-active" : ""}`}
                    onClick={() => setActiveId(p.id)}
                  >
                    <span className="proj__dot" />
                    <span className="proj__name">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="proj__editor">
          {active ? (
            <NotesEditor key={active.id} project={active} onDeleted={() => removeProject(active.id)} onRenamed={load} />
          ) : (
            <EmptyState title="Select a project" hint="Or create one to start writing notes." icon="✎" />
          )}
        </section>
      </div>
    </div>
  );
}

function NotesEditor({ project, onDeleted, onRenamed }) {
  const [notes, setNotes] = useState(project.notes || "");
  const [name, setName] = useState(project.name);
  const [status, setStatus] = useState("saved"); // saved | saving | dirty
  const timer = useRef(null);

  // Debounced autosave of notes.
  useEffect(() => {
    setNotes(project.notes || "");
    setName(project.name);
    setStatus("saved");
  }, [project.id]);

  const scheduleSave = (next) => {
    setNotes(next);
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      await api.patch(`/projects/${project.id}`, { notes: next });
      setStatus("saved");
    }, 600);
  };

  const saveName = async () => {
    if (name.trim() && name !== project.name) {
      await api.patch(`/projects/${project.id}`, { name: name.trim() });
      onRenamed();
    }
  };

  return (
    <div className="notes">
      <header className="notes__head">
        <input
          className="notes__name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
        />
        <div className="notes__meta">
          <span className={`notes__status notes__status--${status}`}>
            {status === "saved" ? "saved" : status === "saving" ? "saving…" : "unsaved"}
          </span>
          <button className="btn btn--ghost btn--sm" onClick={onDeleted}>delete</button>
        </div>
      </header>
      <textarea
        className="notes__area mono"
        placeholder="Write anything — ideas, todos, links, decisions…"
        value={notes}
        onChange={(e) => scheduleSave(e.target.value)}
        spellCheck
      />
    </div>
  );
}
