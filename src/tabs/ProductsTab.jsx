// ─────────────────────────────────────────────
// tabs/ProductsTab.jsx (ENHANCED)
// FEATURE 2: Added HSN Code field
// ─────────────────────────────────────────────
import { useState } from "react";
import { insertProduct, updateProduct, deleteProduct } from "../lib/api";
import { genId } from "../utils/misc";
import { card, inp, lbl } from "../styles";
import GstSelect from "../components/GstSelect";

export function ProductsTab({ products, setProducts, settings, shopCode }) {
  const [newProdName, setNewProdName]   = useState("");
  const [newProdHsn, setNewProdHsn]     = useState("");   // FEATURE 2: HSN Code
  const [newProdGst, setNewProdGst]     = useState("default");
  const [newProdQty, setNewProdQty]     = useState("");   // default quantity
  const [newProdStep, setNewProdStep]   = useState("");   // +/- step (e.g. 0.25)
  const [prodMsg, setProdMsg]           = useState("");

  const handleAdd = async () => {
    setProdMsg("");
    if (!newProdName.trim()) return setProdMsg("Name required.");
    if (products.find((p) => p.name.toLowerCase() === newProdName.trim().toLowerCase())) return setProdMsg("Already exists.");
    
    // FEATURE 2: Validate HSN code if provided (8 digits or empty)
    if (newProdHsn && (!newProdHsn.match(/^\d{1,8}$/))) {
      return setProdMsg("HSN must be 1-8 digits.");
    }
    
    const np = {
      id:          genId(),
      name:        newProdName.trim(),
      hsnCode:     newProdHsn.trim() || null,  // FEATURE 2: Store HSN code
      gstOverride: newProdGst === "default" ? null : parseFloat(newProdGst),
      defaultQty:  newProdQty  ? parseFloat(newProdQty)  : null,
      qtyStep:     newProdStep ? parseFloat(newProdStep) : null,
    };
    await insertProduct(shopCode, np);
    setProducts((p) => [...p, np]);
    setProdMsg(`"${np.name}" added!`);
    setNewProdName(""); setNewProdHsn(""); setNewProdGst("default"); setNewProdQty(""); setNewProdStep("");
  };

  const handleGstChange = async (prod, val) => {
    const updated = { ...prod, gstOverride: val === "default" ? null : parseFloat(val) };
    await updateProduct(shopCode, updated);
    setProducts((prev) => prev.map((pr) => pr.id === prod.id ? updated : pr));
  };

  // FEATURE 2: Handle HSN code update
  const handleHsnChange = async (prod, val) => {
    if (val && !val.match(/^\d{1,8}$/)) return; // Validate before updating
    const updated = { ...prod, hsnCode: val || null };
    await updateProduct(shopCode, updated);
    setProducts((prev) => prev.map((pr) => pr.id === prod.id ? updated : pr));
  };

  const handleDelete = async (prod) => {
    if (!window.confirm(`Delete "${prod.name}"?`)) return;
    await deleteProduct(shopCode, prod.id);
    setProducts((prev) => prev.filter((pr) => pr.id !== prod.id));
  };

  return (
    <>
      {/* ── Add product ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 4 }}>➕ Add Product</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
          ★ = Fixed GST override · Default = threshold-based ({settings.gstLow}% / {settings.gstHigh}%)
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Product Name</label>
          <input value={newProdName} onChange={(e) => setNewProdName(e.target.value)} placeholder="e.g. Silk Saree" style={inp} />
        </div>
        
        {/* FEATURE 2: HSN Code field */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>HSN Code (optional)</label>
          <input 
            value={newProdHsn} 
            onChange={(e) => setNewProdHsn(e.target.value.replace(/\D/g, "").slice(0, 8))} 
            placeholder="e.g. 6204 (8 digits max)"
            inputMode="numeric"
            style={inp} 
          />
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>HSN will appear on invoice line items</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>GST Rate</label>
          <GstSelect value={newProdGst} onChange={setNewProdGst} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Default Qty (optional)</label>
            <input type="number" value={newProdQty} inputMode="decimal" step="any"
              onChange={(e) => setNewProdQty(e.target.value)}
              placeholder="e.g. 1" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>+/− Step (optional)</label>
            <input type="number" value={newProdStep} inputMode="decimal" step="any"
              onChange={(e) => setNewProdStep(e.target.value)}
              placeholder="e.g. 0.25" style={inp} />
          </div>
        </div>
        {prodMsg && (
          <div style={{ fontSize: 13, marginBottom: 8, color: prodMsg.includes("added") ? "#16a34a" : "#dc2626", background: prodMsg.includes("added") ? "#f0fdf4" : "#fee2e2", padding: "6px 10px", borderRadius: 6 }}>
            {prodMsg.includes("added") ? "✅ " : "⚠ "}{prodMsg}
          </div>
        )}
        <button onClick={handleAdd}
          style={{ width: "100%", padding: "12px 0", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          Add Product
        </button>
      </div>

      {/* ── Product list ── */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f", marginBottom: 12 }}>📦 Products ({products.length})</div>
        {products.length === 0 && <div style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No products yet.</div>}
        {[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p, i) => (
          <div key={p.id || p.name} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 0", borderBottom: i < products.length - 1 ? "1px solid #f3f4f6" : "none" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: p.gstOverride !== null && p.gstOverride !== undefined ? "#7c3aed" : "#9ca3af" }}>
                {p.hsnCode && <span>HSN: {p.hsnCode} · </span>}  {/* FEATURE 2: Display HSN */}
                {p.gstOverride !== null && p.gstOverride !== undefined ? `★ GST: ${p.gstOverride}%` : "Default GST"}
                {p.defaultQty != null ? ` · Qty: ${p.defaultQty}` : ""}
                {p.qtyStep    != null ? ` · Step: ${p.qtyStep}`   : ""}
              </div>
            </div>
            
            {/* FEATURE 2: HSN editing inline */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input 
                value={p.hsnCode || ""} 
                onChange={(e) => handleHsnChange(p, e.target.value)}
                placeholder="HSN"
                inputMode="numeric"
                maxLength="8"
                style={{ width: 50, padding: "6px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }} 
              />
              <GstSelect value={p.gstOverride} onChange={(v) => handleGstChange(p, v)} />
              <button onClick={() => handleDelete(p)}
                style={{ background: "#fee2e2", border: "none", borderRadius: 6, color: "#dc2626", padding: "8px 10px", cursor: "pointer", fontWeight: 700 }}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
