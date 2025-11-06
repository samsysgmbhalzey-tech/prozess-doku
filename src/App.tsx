import React, { useRef, useState, useEffect } from "react";
import jsPDF from "jspdf";

// -----------------------------
// Hilfskomponenten
// -----------------------------
function Button({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline";
}) {
  const style: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: variant === "outline" ? "1px solid #ccc" : "none",
    background: disabled
      ? "#e5e7eb"
      : variant === "outline"
      ? "#fff"
      : "#111827",
    color: disabled ? "#9ca3af" : variant === "outline" ? "#111827" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={style}>
      {children}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        ...props.style,
        padding: 8,
        borderRadius: 6,
        border: "1px solid #ccc",
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
        borderRadius: 6,
        border: "1px solid #ccc",
        width: "100%",
        minHeight: 80,
      }}
    />
  );
}

// -----------------------------
// Typen
// -----------------------------
interface TextItem {
  id: string;
  content: string;
  important: boolean;
}

interface StepData {
  index: number;
  photos: string[];
  texts: TextItem[];
}

interface ProcessData {
  name: string;
  version: string;
  createdAt: string;
  steps: StepData[];
}

// Hilfsfunktionen
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function bumpVersion(ver: string) {
  const [major, minor] = ver.split(".").map((v) => parseInt(v));
  return minor < 9 ? `${major}.${minor + 1}` : `${major + 1}.0`;
}

// -----------------------------
// Hauptkomponente
// -----------------------------
export default function ProzessDokuApp() {
  const [process, setProcess] = useState<ProcessData | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0");
  const [current, setCurrent] = useState(0);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [textDraft, setTextDraft] = useState("");
  const [important, setImportant] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [finalized, setFinalized] = useState(false);

  // -----------------------------
  // Schrittfunktionen
  // -----------------------------
  const addText = () => {
    if (!textDraft.trim()) return;
    setTexts((t) => [...t, { id: uid(), content: textDraft, important }]);
    setTextDraft("");
    setImportant(false);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files) return;
    const arr = await Promise.all(
      Array.from(files).map(
        (f) =>
          new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.onerror = rej;
            r.readAsDataURL(f);
          })
      )
    );
    setPhotos((p) => [...p, ...arr]);
  };

  const startProcess = () => {
    if (!name.trim()) return alert("Bitte Prozessnamen eingeben.");
    const p: ProcessData = {
      name,
      version,
      createdAt: new Date().toISOString(),
      steps: [{ index: 1, photos: [], texts: [] }],
    };
    setProcess(p);
    setCurrent(0);
    setTexts([]);
    setPhotos([]);
  };

  const finishStep = () => {
    if (!process) return;
    if (!photos.length || !texts.length)
      return alert("Jeder Schritt braucht Text und Foto.");
    const newProc = { ...process };
    newProc.steps[current] = { index: current + 1, photos, texts };
    newProc.steps.push({ index: newProc.steps.length + 1, photos: [], texts: [] });
    setProcess(newProc);
    setCurrent((i) => i + 1);
    setTexts([]);
    setPhotos([]);
  };

  const backStep = () => {
    if (current === 0) return;
    setCurrent((i) => i - 1);
    if (process) {
      setTexts(process.steps[current - 1].texts);
      setPhotos(process.steps[current - 1].photos);
    }
  };

  const finishProcess = () => {
    if (!process) return;
    const p = { ...process };
    p.version = bumpVersion(p.version);
    setProcess(p);
    setFinalized(true);
    exportPDF(p);
  };

  // -----------------------------
  // PDF Export
  // -----------------------------
  const exportPDF = async (p: ProcessData) => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;
    let y = margin;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(p.name, margin, y);
    y += 20;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Version ${p.version} – ${new Date(p.createdAt).toLocaleString()}`, margin, y);
    y += 20;

    const addPage = () => {
      pdf.addPage();
      y = margin;
    };

    for (const step of p.steps) {
      if (!step.texts.length && !step.photos.length) continue;

      // Seitenumbruch VOR Überschrift
      if (y + 250 > pageH) addPage();

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(`Schritt ${step.index}`, margin, y);
      y += 20;

      for (const ph of step.photos) {
        const img = new Image();
        img.src = ph;
        await new Promise((res) => (img.onload = res));
        const scale = Math.min(210 / img.width, 148 / img.height, 1); // DIN A6 ca. 210x148 pt
        const w = img.width * scale;
        const h = img.height * scale;
        if (y + h > pageH - margin) addPage();
        pdf.addImage(ph, "JPEG", margin, y, w, h);
        y += h + 10;
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      for (const [i, t] of step.texts.entries()) {
        if (y + 30 > pageH - margin) addPage();
        if (t.important) pdf.setTextColor(200, 0, 0);
        pdf.text(`${step.index}.${i + 1} ${t.content}`, margin, y);
        if (t.important) pdf.setTextColor(0, 0, 0);
        y += 18;
      }

      y += 10;
    }

    // Seitenzahlen
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(9);
      pdf.text(
        `Seite ${i} von ${total} | Erstellt ${new Date(p.createdAt).toLocaleDateString()}`,
        margin,
        pageH - 20
      );
    }

    pdf.save(`${p.name.replace(/\s+/g, "_")}_Prozess.pdf`);
  };

  // -----------------------------
  // Layout
  // -----------------------------
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Prozess-Dokumentation</h1>
      {!process ? (
        <div style={{ maxWidth: 400 }}>
          <Input
            placeholder="Prozessname"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={{ marginTop: 8 }}
          />
          <Button onClick={startProcess} style={{ marginTop: 8 }}>
            Prozess starten
          </Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <h2>Schritt {current + 1}</h2>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => uploadPhotos(e.target.files)}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {photos.map((p, i) => (
                <img
                  key={i}
                  src={p}
                  alt=""
                  style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 4 }}
                />
              ))}
            </div>
            <Textarea
              placeholder="Text für diesen Schritt"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              style={{ marginTop: 12 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
              />
              Wichtig
            </label>
            <Button onClick={addText} style={{ marginTop: 8 }}>
              Text hinzufügen
            </Button>

            <ol style={{ marginTop: 12 }}>
              {texts.map((t, i) => (
                <li key={t.id} style={{ color: t.important ? "red" : undefined }}>
                  {current + 1}.{i + 1} {t.content}
                </li>
              ))}
            </ol>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <Button variant="outline" onClick={backStep}>
                Schritt zurück
              </Button>
              <Button onClick={finishStep}>Schritt beenden</Button>
            </div>

            <div style={{ marginTop: 20 }}>
              <Button onClick={finishProcess}>Prozess beenden & PDF</Button>
            </div>
          </div>

          {process && (
            <div>
              <h3>
                Vorschau – {process.name} (v{process.version})
              </h3>
              {process.steps.map((s) => (
                <div key={s.index}>
                  <strong>Schritt {s.index}</strong>
                  <ul>
                    {s.texts.map((t, i) => (
                      <li key={i} style={{ color: t.important ? "red" : undefined }}>
                        {s.index}.{i + 1} {t.content}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
