import React, { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";

/** ------------------------
 *  Hilfs-UI (ohne Fremdbibliotheken)
 *  ------------------------ */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" }) {
  const { variant = "default", style, ...rest } = props;
  const styles: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: variant === "outline" ? "1px solid #d1d5db" : "1px solid transparent",
    background: props.disabled ? "#e5e7eb" : variant === "outline" ? "#fff" : "#111827",
    color: props.disabled ? "#9ca3af" : variant === "outline" ? "#111827" : "#fff",
    cursor: props.disabled ? "not-allowed" : "pointer",
    fontSize: 14,
    ...style,
  };
  return <button {...rest} style={styles} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        ...props.style,
        padding: 8,
        borderRadius: 10,
        border: "1px solid #d1d5db",
        width: "100%",
      }}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      style={{
        ...props.style,
        padding: 8,
        borderRadius: 10,
        border: "1px solid #d1d5db",
        width: "100%",
        minHeight: 90,
      }}
    />
  );
}

/** ------------------------
 *  Typen & Utils
 *  ------------------------ */
interface TextItem {
  id: string;
  content: string;
  important: boolean;
}

interface StepData {
  index: number;       // Schritt-Nr. (1-basiert)
  photos: string[];    // DataURLs
  texts: TextItem[];   // 1.1, 1.2 …
  done?: boolean;
}

interface ProcessData {
  name: string;
  version: string;     // z. B. "1.0"
  createdAt: string;   // ISO
  steps: StepData[];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function parseVersion(v: string) {
  const m = v.match(/^(\d+)\.(\d+)$/);
  if (!m) return { major: 1, minor: 0 };
  return { major: parseInt(m[1], 10) || 1, minor: parseInt(m[2], 10) || 0 };
}

function bumpVersion(v: string) {
  const { major, minor } = parseVersion(v);
  if (minor < 9) return `${major}.${minor + 1}`;
  return `${major + 1}.0`;
}

/** ------------------------
 *  App
 *  ------------------------ */
export default function App() {
  // Prozess
  const [process, setProcess] = useState<ProcessData | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [versionInput, setVersionInput] = useState("1.0");

  // Editor-Zustand
  const [currentIndex, setCurrentIndex] = useState(0); // Index im steps-Array
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [pendingTexts, setPendingTexts] = useState<TextItem[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [textImportant, setTextImportant] = useState(false);

  // Finalisierung / Export
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);

  const loadRef = useRef<HTMLInputElement>(null);

  // Beim Schrittwechsel Editor puffern/laden
  useEffect(() => {
    if (!process) return;
    const step = process.steps[currentIndex];
    if (step) {
      setPendingPhotos(step.photos || []);
      setPendingTexts(step.texts || []);
      setTextDraft("");
      setTextImportant(false);
    }
  }, [currentIndex, process]);

  function ensureIndices(p: ProcessData) {
    for (let i = 0; i < p.steps.length; i++) {
      p.steps[i].index = i + 1;
    }
  }

  /** Prozess neu anlegen */
  function startNew() {
    if (!nameInput.trim()) {
      alert("Bitte einen Prozessnamen eingeben.");
      return;
    }
    const p: ProcessData = {
      name: nameInput.trim(),
      version: versionInput.trim() || "1.0",
      createdAt: new Date().toISOString(),
      steps: [{ index: 1, photos: [], texts: [] }],
    };
    setProcess(p);
    setCurrentIndex(0);
    setPendingPhotos([]);
    setPendingTexts([]);
    setTextDraft("");
    setTextImportant(false);
    setLastSnapshot(null);
    setFinalized(false);
  }

  /** Änderungen am aktuellen Schritt in den Prozess schreiben (ohne Versionierung) */
  function commitStepEdits(mutator?: (p: ProcessData) => void) {
    if (!process) return;
    const draft: ProcessData = JSON.parse(JSON.stringify(process));
    const step = draft.steps[currentIndex];
    if (step) {
      step.photos = pendingPhotos;
      step.texts = pendingTexts;
    }
    if (mutator) mutator(draft);
    ensureIndices(draft);
    setProcess(draft);
    setFinalized(false);
  }

  /** Text hinzufügen/entfernen/toggle wichtig */
  function addText() {
    const c = textDraft.trim();
    if (!c) return;
    const item: TextItem = { id: uid(), content: c, important: textImportant };
    setPendingTexts((prev) => [...prev, item]);
    setTextDraft("");
    setTextImportant(false);
  }
  function removeText(id: string) {
    setPendingTexts((prev) => prev.filter((t) => t.id !== id));
  }
  function toggleImportant(id: string) {
    setPendingTexts((prev) => prev.map((t) => (t.id === id ? { ...t, important: !t.important } : t)));
  }

  /** Fotos laden/entfernen */
  async function onPhotoUpload(files: FileList | null) {
    if (!files) return;
    const readers = Array.from(files).map(
      (f) =>
        new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(f);
        })
    );
    const urls = await Promise.all(readers);
    setPendingPhotos((prev) => [...prev, ...urls]);
  }
  function removePhotoAt(i: number) {
    setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  function canFinishStep() {
    return pendingPhotos.length > 0 && pendingTexts.length > 0;
  }

  /** Schritt beenden → neuer leerer Schritt */
  function finishStep() {
    if (!process) return;
    if (!canFinishStep()) {
      alert("Jeder Schritt braucht mindestens ein Foto und einen Text.");
      return;
    }
    commitStepEdits((draft) => {
      draft.steps[currentIndex].done = true;
      draft.steps.push({ index: draft.steps.length + 1, photos: [], texts: [] });
    });
    setCurrentIndex((i) => i + 1);
    setPendingPhotos([]);
    setPendingTexts([]);
    setTextDraft("");
    setTextImportant(false);
  }

  /** Schritt zurück */
  function backStep() {
    if (currentIndex === 0) return;
    commitStepEdits();
    setCurrentIndex((i) => i - 1);
  }

  /** Prozess beenden → Version nur hier erhöhen; Export erst danach erlaubt */
  function finishProcess() {
    if (!process) return;
    // Entwurf mit übernommenen Pufferwerten
    const draft: ProcessData = JSON.parse(JSON.stringify(process));
    const step = draft.steps[currentIndex];
    if (step) {
      step.photos = pendingPhotos;
      step.texts = pendingTexts;
    }
    // letzen leeren Schritt abschneiden
    if (draft.steps.length > 0) {
      const last = draft.steps[draft.steps.length - 1];
      if (last.photos.length === 0 && last.texts.length === 0) draft.steps.pop();
    }
    ensureIndices(draft);

    // Snapshots ohne volatile Felder vergleichen
    const snap = JSON.stringify({ ...draft, createdAt: "X", version: "X" });
    if (lastSnapshot === null || lastSnapshot !== snap) {
      draft.version = bumpVersion(draft.version);
    }
    setProcess(draft);
    setLastSnapshot(snap);
    setFinalized(true);
  }

  /** Speichern/Laden */
  function saveProcess() {
    if (!process) return;
    const blob = new Blob([JSON.stringify(process, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${process.name.replace(/\s+/g, "_")}_Prozess.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function loadProcess(file: File | null) {
    if (!file) return;
    try {
      const txt = await file.text();
      const obj = JSON.parse(txt) as ProcessData;
      if (!obj || !obj.name || !Array.isArray(obj.steps)) {
        alert("Ungültige Datei.");
        return;
      }
      const normalized: ProcessData = {
        name: String(obj.name),
        version: /^\d+\.\d+$/.test(obj.version) ? obj.version : "1.0",
        createdAt: obj.createdAt || new Date().toISOString(),
        steps: (obj.steps || []).map((s, i) => ({
          index: typeof s.index === "number" ? s.index : i + 1,
          photos: Array.isArray(s.photos) ? s.photos.map(String) : [],
          texts: Array.isArray(s.texts)
            ? s.texts.map((t: any) => ({ id: String(t?.id || uid()), content: String(t?.content || ""), important: !!t?.important }))
            : [],
          done: !!s.done,
        })),
      };
      ensureIndices(normalized);
      setProcess(normalized);
      setCurrentIndex(0);
      setPendingPhotos(normalized.steps[0]?.photos || []);
      setPendingTexts(normalized.steps[0]?.texts || []);
      setTextDraft("");
      setTextImportant(false);
      setLastSnapshot(null);
      setFinalized(false);
    } catch {
      alert("Konnte die Datei nicht laden.");
    } finally {
      if (loadRef.current) loadRef.current.value = "";
    }
  }

  /** PDF-Export (nur nach Finalisierung) */
  async function exportPDF() {
    if (!process) return;
    if (!finalized) {
      alert('Bitte zuerst "Prozess beenden" drücken, dann PDF exportieren.');
      return;
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const contentW = pageW - margin * 2;

    // DIN A6 ungefähr in pt (Portrait)
    const A6W = 297.64;
    const A6H = 420.94;
    const maxImgW = Math.min(A6W, contentW);
    const maxImgH = Math.min(A6H, pageH - margin * 2);

    let y = margin;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(process.name, margin, y);
    y += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const created = new Date(process.createdAt).toLocaleString();
    pdf.text(`Erstellt am: ${created}   |   Version: ${process.version}`, margin, y);
    y += 14;

    pdf.setDrawColor(200);
    pdf.line(margin, y, pageW - margin, y);
    y += 10;

    function addPage() {
      pdf.addPage();
      y = margin;
    }
    function spaceLeft() {
      return pageH - margin - y;
    }
    function ensureSpace(needed: number) {
      if (spaceLeft() < needed) addPage();
    }
    function loadImage(dataUrl: string) {
      return new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = dataUrl;
      });
    }
    function scaleDims(img: HTMLImageElement) {
      const s = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
      return { w: img.width * s, h: img.height * s };
    }

    // Schritte
    for (let s = 0; s < process.steps.length; s++) {
      const step = process.steps[s];
      if (step.photos.length === 0 && step.texts.length === 0) continue;

      // Reserve für Überschrift + (falls vorhanden) erstes Bild
      let reserve = 20; // heading
      if (step.photos.length > 0) {
        try {
          const img0 = await loadImage(step.photos[0]);
          const d0 = scaleDims(img0);
          reserve += d0.h + 12;
        } catch {
          reserve += 120;
        }
      } else {
        reserve += 40;
      }
      if (spaceLeft() < reserve) addPage();

      // Überschrift
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text(`Schritt ${step.index}`, margin, y);
      y += 20;

      // Bilder
      for (let p = 0; p < step.photos.length; p++) {
        const dataUrl = step.photos[p];
        try {
          const im = await loadImage(dataUrl);
          const d = scaleDims(im);
          ensureSpace(d.h); // nie splitten
          pdf.addImage(dataUrl, "JPEG", margin, y, d.w, d.h, undefined, "FAST");
          y += d.h + 12; // mehr Platz unter dem Bild
        } catch {
          // Bild konnte nicht geladen werden -> überspringen
        }
      }

      // Texte (1.1, 1.2, …) – „wichtige“ rot + fett
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      for (let i = 0; i < step.texts.length; i++) {
        const t = step.texts[i];
        const label = `${step.index}.${i + 1} `;
        const full = label + t.content;

        const lines = pdf.splitTextToSize(full, contentW);
        // Platz für alle Zeilen + kleinen Abstand
        let blockHeight = lines.length * 14 + 6;
        ensureSpace(blockHeight);

        if (t.important) {
          pdf.setTextColor(200, 0, 0);
          pdf.setFont("helvetica", "bold");
        } else {
          pdf.setTextColor(0, 0, 0);
          pdf.setFont("helvetica", "normal");
        }
        for (let li = 0; li < lines.length; li++) {
          pdf.text(lines[li], margin, y);
          y += 14;
        }
        y += 6;
      }

      y += 6; // kleiner Abstand am Schrittende
    }

    // Fußzeile mit Seitenzahlen, Datum, Version
    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const left = `Erstellt am: ${created}`;
      const center = `Version: ${process.version}`;
      const right = `Seite ${p} von ${total}`;
      pdf.text(left, margin, pdf.internal.pageSize.getHeight() - 16);
      pdf.text(center, pageW / 2, pdf.internal.pageSize.getHeight() - 16, { align: "center" });
      pdf.text(right, pageW - margin, pdf.internal.pageSize.getHeight() - 16, { align: "right" });
    }

    const file = `${process.name.replace(/\s+/g, "_")}_Prozess.pdf`;
    pdf.save(file);
  }

  /** Render */
  const stepNo = process ? (process.steps[currentIndex]?.index ?? 1) : 1;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Prozess-Dokumentation</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={saveProcess} disabled={!process}>Speichern</Button>
            <Button variant="outline" onClick={() => loadRef.current?.click()}>Laden</Button>
            <input ref={loadRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => loadProcess(e.target.files?.[0] || null)} />
            <Button variant="outline" onClick={exportPDF} disabled={!finalized}>PDF exportieren</Button>
          </div>
        </header>

        {!process ? (
          <div style={{ maxWidth: 520, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <label style={{ fontWeight: 600 }}>Prozessname (erster Schritt)</label>
            <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="z. B. Wareneingang prüfen" />
            <div style={{ height: 8 }} />
            <label style={{ fontWeight: 600 }}>Version</label>
            <Input value={versionInput} onChange={(e) => setVersionInput(e.target.value)} placeholder="z. B. 1.0" />
            <div style={{ height: 12 }} />
            <Button onClick={startNew}>Prozess anlegen</Button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Schritt {stepNo}</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="outline" onClick={backStep} disabled={currentIndex === 0}>Schritt zurück</Button>
                  <Button onClick={finishStep} disabled={!canFinishStep()}>Schritt beenden</Button>
                </div>
              </div>

              <section style={{ marginBottom: 14 }}>
                <strong>Fotos</strong>
                <div style={{ height: 6 }} />
                <Input type="file" accept="image/*" multiple onChange={(e) => onPhotoUpload(e.target.files)} />
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {pendingPhotos.map((src, i) => (
                    <div key={i} style={{ position: "relative", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                      <img src={src} alt={`Foto ${i + 1}`} style={{ width: "100%", height: 120, objectFit: "cover" }} />
                      <Button variant="outline" style={{ position: "absolute", top: 6, right: 6 }} onClick={() => removePhotoAt(i)}>Entfernen</Button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <strong>Texte</strong>
                <div style={{ height: 6 }} />
                <Textarea
                  placeholder={`Beschreibung für Schritt ${stepNo}`}
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <input type="checkbox" checked={textImportant} onChange={(e) => setTextImportant(e.target.checked)} />
                  Als wichtig markieren
                </label>
                <div style={{ height: 8 }} />
                <Button variant="outline" onClick={addText}>Text hinzufügen</Button>

                <ol style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {pendingTexts.map((t, i) => (
                    <li key={t.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                      <div style={{ width: 46, fontWeight: 700 }}>{stepNo}.{i + 1}</div>
                      <div style={{ flex: 1, color: t.important ? "#b91c1c" : undefined, fontWeight: t.important ? 700 : 400 }}>
                        {t.content}
                        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                          <Button variant="outline" onClick={() => toggleImportant(t.id)}>Wichtig umschalten</Button>
                          <Button variant="outline" onClick={() => removeText(t.id)}>Entfernen</Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Button variant="outline" onClick={backStep} disabled={currentIndex === 0}>Schritt zurück</Button>
                <Button onClick={finishStep} disabled={!canFinishStep()}>Schritt beenden</Button>
              </div>

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Zum Export zuerst finalisieren.</div>
                <Button onClick={finishProcess}>Prozess beenden</Button>
              </div>
            </div>

            <div style={{ position: "sticky", top: 24 }}>
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0, marginBottom: 6 }}>
                  Vorschau – {process.name} (v{process.version})
                </h3>
                {process.steps.map((s) => {
                  if (s.photos.length === 0 && s.texts.length === 0) return null;
                  return (
                    <div key={s.index} style={{ marginBottom: 12 }}>
                      <strong>Schritt {s.index}</strong>
                      {s.photos.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                          {s.photos.map((src, i) => (
                            <img key={i} src={src} alt="" style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                          ))}
                        </div>
                      )}
                      {s.texts.length > 0 && (
                        <ol style={{ marginTop: 6, paddingLeft: 18 }}>
                          {s.texts.map((t, i) => (
                            <li key={t.id} style={{ color: t.important ? "#b91c1c" : undefined, fontWeight: t.important ? 700 : 400 }}>
                              {s.index}.{i + 1} {t.content}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
