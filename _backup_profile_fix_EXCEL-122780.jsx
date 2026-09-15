import React, { useState, useMemo, useRef } from "react";
import {
  ArrowLeft,
  PlayCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Play,
  ClipboardList,
  Layers,
} from "lucide-react";

/* ------------------------------------------------------------------
   FORMULA LOGIC  (ported 1:1 from Louver / Material & Hardware sheets)
   ------------------------------------------------------------------
   fixFrameBars = CEILING(((Width+Height)*2)/5850, 0.1)  -> Louver!H6
   ------------------------------------------------------------------ */

const computeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;

  const rawBars = ((width + height) * 2 * qty) / 5850;
  const fixFrameBars = rawBars === 0 ? 0 : Math.ceil(rawBars * 10) / 10;

  return { fixFrameBars };
};

/* ------------------------------------------------------------------
   STATIC CONFIG DATA  (from Louver sheet header + Material & Hardware)
   ------------------------------------------------------------------ */

const SCHEDULE_FIELDS = [
  { name: "Window No", type: "String", required: true },
  { name: "Qty", type: "Number", required: true },
  { name: "Width", type: "Number", required: true },
  { name: "Height", type: "Number", required: true },
];

const RULES = [
  {
    key: "fixFrameBars",
    name: "fixFrameBars",
    formula: "CEILING((((Width + Height) * 2 * Qty) / 5850), 0.1)",
  },
];

// Material & Hardware Explorer rows, with their linked rule (if any)
const MATERIALS = [
  { no: 1, name: "60 Casement Frame", linked: null },
  { no: 2, name: "60 Small Casement Frame", linked: "fixFrameBars" },
  { no: 3, name: "60 Casement Mullion", linked: null },
  { no: 4, name: "60 Outward Sash", linked: null },
  { no: 5, name: "60 Single Glazing Bead", linked: null },
  { no: 6, name: "60 Door Panel", linked: null },
  { no: 7, name: "60 Casement Door Frame A", linked: null },
  { no: 8, name: "60 Outward Door Sash A", linked: null },
  { no: 9, name: "60 Sliding Frame", linked: null },
  { no: 10, name: "60 Small Sliding Sash", linked: null },
  { no: 11, name: "60 Big Sliding Sash", linked: null },
  { no: 12, name: "60 Sliding Door Sash", linked: null },
  { no: 13, name: "Interlock for 60 Window", linked: null },
  { no: 14, name: "Interlock for 60 Door Sash B", linked: null },
  { no: 15, name: "60 Sliding Single Glazing Bead", linked: null },
  { no: 16, name: "60 Double Glazing Bead", linked: null },
  { no: 17, name: "60 Sliding Sash Mullion", linked: null },
  { no: 18, name: "60 Inline Adaptor", linked: null },
  { no: 19, name: "88 Sliding Frame Mesh", linked: null },
  { no: 20, name: "80-88 Sliding Insert Screen", linked: null },
  { no: 21, name: "112 Three Sliding Track Frame", linked: null },
  { no: 22, name: "Frame Connector", linked: null },
  { no: 23, name: "Blinds", linked: null },
];

/* ------------------------------------------------------------------
   SMALL UI HELPERS
   ------------------------------------------------------------------ */

const fmt = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";

const NavPill = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center sm:justify-start gap-3 flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
      active
        ? "bg-slate-900 text-white shadow-md"
        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
    }`}
  >
    <Icon size={18} className={active ? "text-indigo-300" : "text-slate-400"} />
    {label}
  </button>
);

const Card = ({ title, action, children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        {title && <h3 className="text-base font-semibold text-slate-800">{title}</h3>}
        {action}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

/* ------------------------------------------------------------------
   TAB 1 — SIMULATOR + PRODUCTION PREVIEW
   ------------------------------------------------------------------ */

const FIELDS = ["wno", "qty", "width", "height"];

const SimulatorAndProduction = ({
  windows,
  setWindows,
  hasRun,
  setHasRun,
  orderNo,
  results,
}) => {
  const tableRef = useRef(null);

  const updateWindow = (id, field, value) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, [field]: value } : w))
    );
  };

  const addWindow = () => {
    const nextNum = windows.length + 1;
    setWindows((prev) => [
      ...prev,
      { id: Date.now(), wno: `W${nextNum}`, qty: "", width: "", height: "" },
    ]);
  };

  const removeWindow = (id) => {
    setWindows((prev) => {
      const next = prev.filter((w) => w.id !== id);
      if (next.length === 0) setHasRun(false);
      return next;
    });
  };

  const runSimulation = () => {
    if (windows.length > 0) setHasRun(true);
  };

  const focusCell = (rowIdx, colIdx) => {
    const el = tableRef.current?.querySelector(
      `[data-row="${rowIdx}"][data-col="${colIdx}"]`
    );
    if (el) el.focus();
  };

  const handleKeyDown = (e, rowIdx, colIdx) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const isLastCol = colIdx === FIELDS.length - 1;
    const isLastRow = rowIdx === windows.length - 1;

    if (isLastCol && isLastRow) {
      // Last cell of the last row -> run the simulation
      e.currentTarget.blur();
      runSimulation();
      return;
    }

    if (isLastCol) {
      // Move to the first cell of the next row
      focusCell(rowIdx + 1, 0);
    } else {
      // Move to the next cell in the same row
      focusCell(rowIdx, colIdx + 1);
    }
  };

  const cellClass =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400";

  return (
    <div className="space-y-6">
      {/* Simulator */}
      <Card
        title="Engineering Simulator"
        action={
          <button
            onClick={runSimulation}
            disabled={windows.length === 0}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
              windows.length === 0
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            <Play size={16} fill="currentColor" />
            Run Simulation
          </button>
        }
      >
        <p className="text-sm text-slate-500 -mt-2 mb-4">
          Populate the schedule table to test calculation chains.
        </p>

        <div ref={tableRef} className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-3">W.No</th>
                <th className="text-left font-semibold px-4 py-3">Qty</th>
                <th className="text-left font-semibold px-4 py-3">Width</th>
                <th className="text-left font-semibold px-4 py-3">Height</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {windows.map((w, rowIdx) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <input
                      data-row={rowIdx}
                      data-col={0}
                      value={w.wno}
                      onChange={(e) => updateWindow(w.id, "wno", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 0)}
                      className={`${cellClass} w-24`}
                      placeholder="W1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      data-row={rowIdx}
                      data-col={1}
                      type="number"
                      value={w.qty}
                      onChange={(e) => updateWindow(w.id, "qty", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 1)}
                      className={`${cellClass} w-20`}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      data-row={rowIdx}
                      data-col={2}
                      type="number"
                      value={w.width}
                      onChange={(e) => updateWindow(w.id, "width", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 2)}
                      className={`${cellClass} w-28`}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      data-row={rowIdx}
                      data-col={3}
                      type="number"
                      value={w.height}
                      onChange={(e) => updateWindow(w.id, "height", e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIdx, 3)}
                      className={`${cellClass} w-28`}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => removeWindow(w.id)}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addWindow}
          className="mt-4 flex items-center gap-2 text-indigo-600 text-sm font-semibold hover:text-indigo-700"
        >
          <Plus size={16} />
          Add Window
        </button>
      </Card>

      {/* Production Preview */}
      {hasRun && (
        <Card title="Production Cards Preview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {results.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 overflow-hidden"
              >
                {/* Order header */}
                <div className="grid grid-cols-2 text-sm">
                  <div className="px-4 py-3 font-semibold text-slate-700 border-b border-r border-slate-200 bg-slate-50">
                    ORDER NO
                  </div>
                  <div className="px-4 py-3 font-bold text-slate-900 border-b border-slate-200 bg-slate-50">
                    {orderNo}
                  </div>
                  <div className="col-span-2 px-4 py-2 text-center font-semibold text-slate-700 border-b border-slate-200 bg-slate-50 text-xs tracking-wide uppercase">
                    Louver Breeze Production
                  </div>
                </div>

                {/* Measurements */}
                <div className="px-4 py-2 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide bg-slate-50 border-b border-slate-200">
                  Measurements
                </div>
                <div className="grid grid-cols-2 text-sm">
                  <div className="px-4 py-2 font-medium text-slate-600 border-b border-r border-slate-100">
                    Property
                  </div>
                  <div className="px-4 py-2 font-semibold text-slate-800 border-b border-slate-100">
                    {r.wno}
                  </div>
                  <div className="px-4 py-2 font-medium text-slate-600 border-b border-r border-slate-100">
                    Width
                  </div>
                  <div className="px-4 py-2 text-slate-800 border-b border-slate-100">
                    {r.width}
                  </div>
                  <div className="px-4 py-2 font-medium text-slate-600 border-r border-slate-100">
                    Height
                  </div>
                  <div className="px-4 py-2 text-slate-800">{r.height}</div>
                </div>

                {/* General */}
                <div className="px-4 py-2 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide bg-slate-50 border-y border-slate-200">
                  General
                </div>
                <div className="grid grid-cols-2 text-sm">
                  <div className="px-4 py-2 font-medium text-slate-600 border-b border-r border-slate-100">
                    Property
                  </div>
                  <div className="px-4 py-2 font-semibold text-slate-800 border-b border-slate-100">
                    {r.wno}
                  </div>
                  <div className="px-4 py-2 font-medium text-slate-600 border-b border-r border-slate-100">
                    Qty
                  </div>
                  <div className="px-4 py-2 text-slate-800 border-b border-slate-100">
                    {r.qty}
                  </div>
                  <div className="px-4 py-2 font-medium text-slate-600 border-b border-r border-slate-100">
                    fixFrameBars
                  </div>
                  <div className="px-4 py-2 text-slate-800 border-b border-slate-100">
                    {fmt(r.fixFrameBars)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------
   TAB 2 — BOM PREVIEW
   ------------------------------------------------------------------ */

const BomPreview = ({ results, hasRun }) => {
  // Aggregate quantities from the simulator results (sum across all windows)
  const totals = useMemo(() => {
    if (!hasRun || results.length === 0) return null;
    return results.reduce(
      (acc, r) => ({
        fixFrameBars: acc.fixFrameBars + (r.fixFrameBars || 0),
      }),
      { fixFrameBars: 0 }
    );
  }, [results, hasRun]);

  const qtyFor = (linked) => {
    if (!totals) return null;
    if (linked === "fixFrameBars") return totals.fixFrameBars;
    return null;
  };

  return (
    <Card title="Master BOM Preview">
      {!hasRun && (
        <p className="text-sm text-slate-500 -mt-2 mb-4">
          Run a simulation on the Simulator &amp; Production tab to populate
          quantities below.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th colSpan={3} className="px-4 py-3 text-left font-semibold border-b border-slate-200">
                Material Consumed for this Order
              </th>
            </tr>
            <tr className="bg-slate-50">
              <th colSpan={3} className="px-4 py-2 text-center font-semibold text-slate-700 border-b border-slate-200 text-xs uppercase tracking-wide">
                Louver Breeze Production
              </th>
            </tr>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <th className="text-left font-semibold px-4 py-3 w-16">S.No</th>
              <th className="text-left font-semibold px-4 py-3">Description</th>
              <th className="text-right font-semibold px-4 py-3 w-32">Qty</th>
            </tr>
          </thead>
          <tbody>
            {MATERIALS.map((m) => {
              const qty = qtyFor(m.linked);
              return (
                <tr key={m.no} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 text-slate-500">{m.no}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {m.name}
                    {m.linked && (
                      <span className="ml-2 inline-flex items-center rounded-md bg-indigo-50 text-indigo-600 text-[11px] font-semibold px-2 py-0.5">
                        {m.linked}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-slate-800">
                    {qty !== null ? fmt(qty) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------------
   TAB 3 — FORM DETAILS (Overview + Schedule + Rule Explorer + Materials)
   ------------------------------------------------------------------ */

const FormDetails = () => {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card title="Product Twin Overview">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="rounded-xl border border-slate-200 p-3 sm:p-5">
            <div className="text-xl sm:text-3xl font-bold text-slate-900">
              {SCHEDULE_FIELDS.length}
            </div>
            <div className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">
              Schedule Inputs
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 sm:p-5">
            <div className="text-xl sm:text-3xl font-bold text-slate-900">{RULES.length}</div>
            <div className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">
              Public Rules
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 sm:p-5">
            <div className="text-xl sm:text-3xl font-bold text-slate-900">
              {MATERIALS.length}
            </div>
            <div className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">
              Materials &amp; Hardware
            </div>
          </div>
        </div>
      </Card>

      {/* Input Schedule Definition */}
      <Card title="Input Schedule Definition">
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <th className="text-left font-semibold px-4 py-3">Field Name</th>
                <th className="text-left font-semibold px-4 py-3">Data Type</th>
                <th className="text-left font-semibold px-4 py-3">Required</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_FIELDS.map((f, idx) => (
                <tr key={idx} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{f.name}</td>
                  <td className="px-4 py-3 text-slate-600">{f.type}</td>
                  <td className="px-4 py-3">
                    <span className="text-emerald-600 font-semibold">
                      {f.required ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Rule Explorer */}
      <Card
        title="Rule Explorer"
        action={
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
            0 Hidden Helper Nodes
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RULES.map((rule) => (
            <div
              key={rule.key}
              className="rounded-xl border border-slate-200 p-4 hover:border-indigo-200 transition-colors"
            >
              <div className="font-semibold text-slate-800 mb-2">{rule.name}</div>
              <code className="block text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 break-all">
                {rule.formula}
              </code>
            </div>
          ))}
        </div>
      </Card>

      {/* Material & Hardware Explorer */}
      <Card title="Material & Hardware Explorer">
        <div className="space-y-3">
          {MATERIALS.map((m) => (
            <div
              key={m.no}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-5 py-4"
            >
              <div>
                <div className="font-semibold text-slate-800">{m.name}</div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-1">
                  Profiles
                </div>
              </div>
              {m.linked ? (
                <span className="inline-flex items-center gap-2 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1.5">
                  <ArrowLeft size={14} />
                  {m.linked}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold px-3 py-1.5">
                  <ArrowLeft size={14} />
                  Unlinked
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

/* ------------------------------------------------------------------
   ROOT COMPONENT
   ------------------------------------------------------------------ */

const TABS = [
  { id: "simulator", label: "Simulator & Production", icon: PlayCircle },
  { id: "bom", label: "BOM Preview", icon: ClipboardList },
  { id: "details", label: "Form Details", icon: Layers },
];

export default function LouverBreezeProduction() {
  const [activeTab, setActiveTab] = useState("simulator");
  const [windows, setWindows] = useState([
    { id: 1, wno: "W1", qty: "", width: "", height: "" },
  ]);
  const [hasRun, setHasRun] = useState(false);
  const [orderNo] = useState(0);

  const results = useMemo(
    () => windows.map((w) => ({ ...w, ...computeWindow(w) })),
    [windows]
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <button className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                <ArrowLeft size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Louver Breeze Production
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-semibold bg-slate-100 text-slate-500 rounded-full px-3 py-1">
                    Version 1.0
                  </span>
                  <span className="text-xs font-bold bg-indigo-50 text-indigo-600 rounded-full px-3 py-1 tracking-wide">
                    DIGITAL PRODUCT TWIN
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <PlayCircle size={16} />
                Go to Simulator
              </button>
              <button className="flex items-center gap-2 bg-slate-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-colors">
                <CheckCircle2 size={16} />
                Publish Template
              </button>
            </div>
          </div>
        </div>

        {/* Layout: top nav + content */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-2">
            {TABS.map((t) => (
              <NavPill
                key={t.id}
                icon={t.icon}
                label={t.label}
                active={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
              />
            ))}
          </div>

          <div>
            {activeTab === "simulator" && (
              <SimulatorAndProduction
                windows={windows}
                setWindows={setWindows}
                hasRun={hasRun}
                setHasRun={setHasRun}
                orderNo={orderNo}
                results={results}
              />
            )}
            {activeTab === "bom" && (
              <BomPreview results={results} hasRun={hasRun} />
            )}
            {activeTab === "details" && <FormDetails />}
          </div>
        </div>
      </div>
    </div>
  );
}
