import React, { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, Smartphone, Terminal, Settings, CheckCircle } from "lucide-react";

export default function ArchitectureDocs() {
  const [activeTab, setActiveTab] = useState<"diagram" | "folder">("diagram");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-2xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white font-sans">
            System Architecture &amp; Folder Structure
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualizing the German Verb Conjugation Manager technical design
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab("diagram")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "diagram"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Architecture Diagram
          </button>
          <button
            onClick={() => setActiveTab("folder")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "folder"
                ? "bg-indigo-600 text-white shadow-md"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Folder Structure
          </button>
        </div>
      </div>

      {activeTab === "diagram" && (
        <div className="space-y-6">
          <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex justify-center overflow-x-auto">
            <svg
              width="800"
              height="380"
              viewBox="0 0 800 380"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="max-w-full text-slate-300"
            >
              {/* Box: User Interface */}
              <rect x="250" y="20" width="300" height="60" rx="10" fill="#4338CA" stroke="#6366F1" strokeWidth="2" />
              <text x="400" y="55" fill="#FFFFFF" fontSize="14" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">
                React UI (VerbTable, Settings, Export)
              </text>

              {/* Arrow: UI -> DB Service */}
              <path d="M400 80 V120" stroke="#818CF8" strokeWidth="2" markerEnd="url(#arrow)" strokeDasharray="4 4" />

              {/* Box: Database Service (Merge Controller) */}
              <rect x="230" y="120" width="340" height="70" rx="10" fill="#1E1B4B" stroke="#4F46E5" strokeWidth="2" />
              <text x="400" y="150" fill="#F3F4F6" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
                DatabaseService.ts (getVerb)
              </text>
              <text x="400" y="170" fill="#94A3B8" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
                Performs Environment Detection &amp; Overlay Merging
              </text>

              {/* Arrow Left: DB Service -> JSON Cache */}
              <path d="M300 155 H160" stroke="#818CF8" strokeWidth="2" markerEnd="url(#arrow)" />
              {/* Arrow Right: DB Service -> IndexedDB */}
              <path d="M500 155 H640" stroke="#818CF8" strokeWidth="2" markerEnd="url(#arrow)" />

              {/* Box: Memory JSON Cache */}
              <rect x="10" y="240" width="220" height="80" rx="10" fill="#065F46" stroke="#059669" strokeWidth="2" />
              <text x="120" y="275" fill="#FFFFFF" fontSize="12" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">
                Memory Cache (O(1))
              </text>
              <text x="120" y="295" fill="#A7F3D0" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
                verbsCache (JSON data)
              </text>

              {/* Box: Dexie.js (IndexedDB) */}
              <rect x="570" y="240" width="220" height="80" rx="10" fill="#854D0E" stroke="#CA8A04" strokeWidth="2" />
              <text x="680" y="275" fill="#FFFFFF" fontSize="12" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">
                IndexedDB (Dexie.js)
              </text>
              <text x="680" y="295" fill="#FEF08A" fontSize="11" textAnchor="middle" fontFamily="sans-serif">
                User overrides &amp; categories
              </text>

              {/* Arrow down from JSON Cache to Base Source */}
              <path d="M120 320 V340" stroke="#059669" strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="120" y="355" fill="#10B981" fontSize="10" textAnchor="middle" fontFamily="sans-serif">
                German_DB_sample_file.json
              </text>

              {/* Arrow down from Dexie to Persistent Storage */}
              <path d="M680 320 V340" stroke="#CA8A04" strokeWidth="1.5" strokeDasharray="3 3" />
              <text x="680" y="355" fill="#FBBF24" fontSize="10" textAnchor="middle" fontFamily="sans-serif">
                Local Storage/IndexedDB
              </text>

              {/* Merge Junction Visual */}
              <path d="M120 240 V205 H300 V190" stroke="#34D399" strokeWidth="1.5" />
              <path d="M680 240 V205 H500 V190" stroke="#FBBF24" strokeWidth="1.5" />

              {/* Definition of markers */}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#818CF8" />
                </marker>
              </defs>
            </svg>
          </div>
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs leading-relaxed space-y-2">
            <p className="font-semibold text-indigo-400">Database Manager Flow:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong className="text-white">Startup:</strong> The JSON file database gets loaded into a memory singleton cache called <code className="text-pink-400 bg-slate-900 px-1 py-0.5 rounded font-mono">verbsCache</code>.
              </li>
              <li>
                <strong className="text-white">Environments:</strong> Detects if we are in a Tauri wrapper (for Windows/Android) to configure settings paths, a Chrome Extension (saving file contents directly into IndexedDB), or a standard Web Browser.
              </li>
              <li>
                <strong className="text-white">Retrieval &amp; Merging:</strong> When requesting a verb, <code className="text-pink-400 bg-slate-900 px-1 py-0.5 rounded font-mono">getVerb(infinitive)</code> looks up the conjugation in the cache, fetches any user-defined manual overrides or category tags in IndexedDB, and merges them securely, prioritizing user overrides.
              </li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "folder" && (
        <div className="space-y-4">
          <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 font-mono text-sm max-h-[350px] overflow-y-auto">
            <FolderTree />
          </div>
          <p className="text-xs text-slate-400 italic">
            * This tree matches the target cross-platform architecture ready for Tauri wrapper packing and Chrome Extension compilation.
          </p>
        </div>
      )}
    </div>
  );
}

function FolderTree() {
  const [open, setOpen] = useState<Record<string, boolean>>({
    src: true,
    components: true,
    tauri: false,
    extension: false,
  });

  const toggle = (key: string) => {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-2 text-slate-300 select-none">
      <div className="flex items-center gap-1">
        <Folder className="w-4 h-4 text-amber-500" />
        <span className="font-semibold text-white">german-verb-conjugator/</span>
      </div>

      <div className="pl-4 space-y-1.5">
        {/* tauri folder */}
        <div>
          <div onClick={() => toggle("tauri")} className="flex items-center gap-1 cursor-pointer hover:text-white">
            {open["tauri"] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
            <Folder className="w-4 h-4 text-amber-400" />
            <span>src-tauri/</span>
            <span className="text-slate-500 text-xs italic">(Tauri configuration files for Windows &amp; Android packaging)</span>
          </div>
          {open["tauri"] && (
            <div className="pl-6 space-y-1 border-l border-slate-800 mt-1">
              <div className="flex items-center gap-1 text-slate-400">
                <File className="w-3.5 h-3.5 text-slate-500" />
                <span>tauri.conf.json</span>
              </div>
              <div className="flex items-center gap-1 text-slate-400">
                <File className="w-3.5 h-3.5 text-slate-500" />
                <span>Cargo.toml</span>
              </div>
            </div>
          )}
        </div>

        {/* extension folder */}
        <div>
          <div onClick={() => toggle("extension")} className="flex items-center gap-1 cursor-pointer hover:text-white">
            {open["extension"] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
            <Folder className="w-4 h-4 text-amber-400" />
            <span>extension/</span>
            <span className="text-slate-500 text-xs italic">(Chrome Extension Manifest V3 metadata)</span>
          </div>
          {open["extension"] && (
            <div className="pl-6 space-y-1 border-l border-slate-800 mt-1">
              <div className="flex items-center gap-1 text-slate-400">
                <File className="w-3.5 h-3.5 text-slate-500" />
                <span>manifest.json</span>
                <span className="text-indigo-400 text-xs">(Manifest V3)</span>
              </div>
            </div>
          )}
        </div>

        {/* src folder */}
        <div>
          <div onClick={() => toggle("src")} className="flex items-center gap-1 cursor-pointer hover:text-white">
            {open["src"] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
            <Folder className="w-4 h-4 text-amber-400" />
            <span>src/</span>
          </div>
          {open["src"] && (
            <div className="pl-6 space-y-1 border-l border-slate-800 mt-1">
              {/* components folder */}
              <div>
                <div onClick={() => toggle("components")} className="flex items-center gap-1 cursor-pointer hover:text-white">
                  {open["components"] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                  <Folder className="w-4 h-4 text-sky-400" />
                  <span>components/</span>
                </div>
                {open["components"] && (
                  <div className="pl-6 space-y-1 border-l border-slate-800 mt-1">
                    <div className="flex items-center gap-1 text-slate-400">
                      <File className="w-3.5 h-3.5 text-emerald-400" />
                      <span>VerbTable.tsx</span>
                      <span className="text-slate-500 text-xs italic">(Requested 11-column strict order table)</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <File className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ArchitectureDocs.tsx</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      <File className="w-3.5 h-3.5 text-emerald-400" />
                      <span>CategoryManager.tsx</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 text-slate-300">
                <File className="w-3.5 h-3.5 text-sky-400" />
                <span>DatabaseService.ts</span>
                <span className="text-indigo-400 text-xs italic">(Cache &amp; Dexie overlays)</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300">
                <File className="w-3.5 h-3.5 text-sky-400" />
                <span>types.ts</span>
                <span className="text-slate-500 text-xs italic">(Shared enum &amp; record structures)</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300">
                <File className="w-3.5 h-3.5 text-slate-400" />
                <span>German_DB_sample_file.json</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300">
                <File className="w-3.5 h-3.5 text-sky-400" />
                <span>App.tsx</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300">
                <File className="w-3.5 h-3.5 text-sky-400" />
                <span>index.css</span>
              </div>
            </div>
          )}
        </div>

        {/* configs */}
        <div className="flex items-center gap-1 text-slate-400">
          <File className="w-3.5 h-3.5 text-slate-500" />
          <span>package.json</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <File className="w-3.5 h-3.5 text-slate-500" />
          <span>vite.config.ts</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <File className="w-3.5 h-3.5 text-slate-500" />
          <span>tsconfig.json</span>
        </div>
      </div>
    </div>
  );
}
