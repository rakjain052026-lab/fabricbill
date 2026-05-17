// ─────────────────────────────────────────────
// src/components/InvoiceView.jsx (ENHANCED)
// Updated to display:
//   - Customer GSTIN (Feature 7)
//   - Bank Details (Feature 4)
//   - Email (Feature 6)
//   - HSN Codes (Feature 2)
//   - SO/RO Number (Feature 5)
//   - Signature with name (Feature 3)
// ─────────────────────────────────────────────

import { useState, Fragment } from "react";
import { fmt, fmtDate, numToWords } from "../utils/format";
import { buildGstRows } from "../utils/gst";
import { BDR, tds } from "../styles";
import { uploadPDF, sendWhatsApp } from "../lib/api";

export default function InvoiceView({ txn, settings, onClose }) {
  const [showThermal, setShowThermal] = useState(false);
  const [sending, setSending]         = useState(false);
  const f = (n) => fmt(n, settings.currency);

  // ── Derived values ────────────────────────────────────────
  const amtWords  = numToWords(Math.round(txn.total || txn.net || 0)) + " Rupees Only";
  const total     = txn.total || txn.net || 0;
  const subtotal  = txn.subtotal ||
    txn.items?.reduce((s, i) => s + (parseFloat(i.price) || 0) * Math.abs(parseFloat(i.qty) || 0), 0) || 0;
  const gstRows   = buildGstRows(txn.items || [], txn.taxable || 0, subtotal);
  const hasSplit  = txn.payments && txn.payments.length > 1;
  const creditAmt = txn.payments
    ? (txn.payments.find((p) => p.mode === "Credit") || {}).amount || 0
    : txn.paymentMode === "Credit" ? total : 0;
  const paymentLabel = hasSplit
    ? txn.payments.filter((p) => p.amount > 0).map((p) => p.mode + ": " + f(p.amount)).join(" | ")
    : txn.payments?.[0]?.mode || txn.paymentMode || "Cash";
  const isVoid = txn.void || txn.cancelled;

  // ── Load jsPDF + html2canvas dynamically ─────────────────
  const loadPDFLibs = async () => {
    if (!window.html2canvas)
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    if (!window.jspdf)
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
  };

  // ── Generate PDF blob ─────────────────────────────────────
  const generatePDFBase64 = async () => {
    await loadPDFLibs();
    const el = document.getElementById("inv-print");
    const canvas = await window.html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#fff" });
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const pdfW = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pdfW, (canvas.height * pdfW) / canvas.width);
    return pdf.output("datauristring").split(",")[1];
  };

  // ── Print (browser print dialog) ─────────────────────────
  const doPrint = () => {
    const el  = document.getElementById("inv-print");
    const win = window.open("", "_blank");
    if (!win || !el) return;
    win.document.write(`<html><head><title>Invoice ${txn.invoiceNo}</title>
      <style>body{font-family:monospace;margin:20px;}table{width:100%;border-collapse:collapse;}td,th{border:1px solid #000;padding:4px 6px;font-size:11px;}</style>
      </head><body>${el.innerHTML}
      <br/><button onclick="window.print();window.close();">Print / Save PDF</button>
      </body></html>`);
    win.document.close();
  };

  // ── WhatsApp via AiSensy (PDF) ────────────────────────────
  const doWhatsApp = async () => {
    if (!txn.customer?.phone && !txn.customerPhone) {
      alert("No valid phone number for this customer.");
      return;
    }
    setSending(true);
    try {
      const base64 = await generatePDFBase64();
      const filename  = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;
      const { mediaId } = await uploadPDF(base64, filename);
      if (mediaId) {
        await sendWhatsApp(
          txn.customer?.phone || txn.customerPhone,
          txn.customer?.name || txn.customerName || "Customer",
          txn.invoiceNo,
          mediaId
        );
        alert("Sent successfully!");
      }
    } catch (e) {
      alert("Error: " + (e.message || "Failed to send"));
    } finally {
      setSending(false);
    }
  };

  // ── Download PDF ──────────────────────────────────────────
  const doDownloadPDF = async () => {
    try {
      const base64 = await generatePDFBase64();
      const filename = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;
      const link = document.createElement("a");
      link.href = "data:application/pdf;base64," + base64;
      link.download = filename;
      link.click();
    } catch (e) {
      alert("Error generating PDF: " + e.message);
    }
  };

  // ── Share (native share if available) ──────────────────────
  const doShare = async () => {
    if (!navigator.share) {
      alert("Share not supported on this device");
      return;
    }
    try {
      const base64 = await generatePDFBase64();
      const filename = `Invoice-${txn.invoiceNo.replace("/", "-")}.pdf`;
      const blob = new Blob([new Uint8Array(atob(base64).split("").map((c) => c.charCodeAt(0)))], { type: "application/pdf" });
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: "Invoice " + txn.invoiceNo, files: [file] });
      } else {
        alert("Cannot share files on this device");
      }
    } catch (e) {
      alert("Share failed: " + e.message);
    }
  };

  // ── Thermal print (raw ESC/POS) ────────────────────────────
  const doThermalPrint = async () => {
    // This would require a thermal printer connection
    // For now, just show the preview
    alert("Thermal print setup required. Please check documentation.");
  };

  // ── Return JSX ──────────────────────────────────────────────
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 10 }}>
      <div style={{ background: "#fff", borderRadius: 12, maxHeight: "90vh", overflowY: "auto", width: "100%", maxWidth: 500 }}>
        {/* Header buttons */}
        <div style={{ display: "flex", gap: 8, padding: 12, borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
          <button onClick={doPrint} style={{ flex: 1, minWidth: 80, padding: "8px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🖨️ Print</button>
          <button onClick={doDownloadPDF} style={{ flex: 1, minWidth: 80, padding: "8px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⬇️ PDF</button>
          <button onClick={doWhatsApp} disabled={sending} style={{ flex: 1, minWidth: 80, padding: "8px 12px", background: "#25d366", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: sending ? 0.6 : 1 }}>💬 WhatsApp</button>
          <button onClick={onClose} style={{ flex: 1, minWidth: 80, padding: "8px 12px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕ Close</button>
        </div>

        {/* Void banner */}
        {isVoid && (
          <div style={{ background: "#fee2e2", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontWeight: 800, color: "#dc2626", fontSize: 15, textAlign: "center" }}>
            ❌ VOID / CANCELLED INVOICE
          </div>
        )}

        {/* Printable invoice area */}
        <div id="inv-print" style={{ border: "2px solid #000", padding: 10, fontFamily: "monospace", fontSize: 11, opacity: isVoid ? 0.55 : 1 }}>
          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: BDR, paddingBottom: 6, marginBottom: 6 }}>
            {isVoid && <div style={{ fontWeight: 900, fontSize: 14, color: "#dc2626", marginBottom: 4 }}>*** VOID / CANCELLED ***</div>}
            <div style={{ position: "relative", fontSize: 10, marginBottom: 4, minHeight: 16 }}>
              <span style={{ position: "absolute", left: 0 }}>STATE CODE : {settings.stateCode || "20"}</span>
              <span style={{ fontWeight: 700 }}>TAX INVOICE</span>
            </div>
            <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: 4, fontFamily: "Georgia,serif" }}>{settings.shopName}</div>
            {settings.shopTagline && <div style={{ fontSize: 9, fontStyle: "italic", fontWeight: 700 }}>{settings.shopTagline}</div>}
            <div style={{ fontSize: 9, fontWeight: 700 }}>{settings.shopAddress}</div>
            {settings.shopPhone && <div style={{ fontSize: 9 }}>Ph: {settings.shopPhone}</div>}
            {settings.gstin && <div style={{ fontSize: 9, fontWeight: 700 }}>GSTIN : {settings.gstin}</div>}
          </div>

          {/* Invoice meta */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10 }}>
            <span><b>Invoice No:</b> {txn.invoiceNo}</span>
            <span><b>Date:</b> {fmtDate(txn.date)}</span>
          </div>
          
          {/* FEATURE 5: SO/RO Number */}
          {txn.soRoNumber && (
            <div style={{ marginBottom: 4, fontSize: 10 }}><b>SO/RO No:</b> {txn.soRoNumber}</div>
          )}

          {/* Bill To Section */}
          <div style={{ marginBottom: 6, fontSize: 10, borderBottom: "1px solid #999", paddingBottom: 4 }}>
            <b>BILL TO:</b>
            <div><b>Name:</b> {txn.customer?.name || txn.customerName || "Customer"}</div>
            {(txn.customer?.phone || txn.customerPhone) && <div><b>Ph:</b> {txn.customer?.phone || txn.customerPhone}</div>}
            {/* FEATURE 7: Customer GSTIN */}
            {(txn.customer?.gstin || txn.customerGstin) && (
              <div><b>Buyer's GSTIN:</b> {txn.customer?.gstin || txn.customerGstin}</div>
            )}
            <div><b>Address:</b> ............................................</div>
          </div>

          {/* Items table with HSN */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
            <thead>
              <tr style={{ background: "#f3f4f6" }}>
                {["Sl.", "HSN", "Particulars", "Qty", "Rate", "Amount"].map((h, i) => (
                  <th key={h} style={{...tds({ textAlign: i === 0 ? "center" : i >= 3 ? "right" : "left", fontWeight: 700 }), fontSize: 9}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(txn.items || []).map((item, idx) => (
                <tr key={item.uid || idx} style={{ background: item.qty < 0 ? "#fff1f2" : "transparent" }}>
                  <td style={{...tds({ textAlign: "center" }), fontSize: 9}}>{idx + 1}</td>
                  {/* FEATURE 2: HSN Code */}
                  <td style={{...tds({ textAlign: "center" }), fontSize: 9}}>{item.hsnCode || "—"}</td>
                  <td style={{...tds({}), fontSize: 9}}>{item.name}{item.qty < 0 ? " (Return)" : ""}</td>
                  <td style={{...tds({ textAlign: "right", color: item.qty < 0 ? "#dc2626" : "inherit" }), fontSize: 9}}>{item.qty}</td>
                  <td style={{...tds({ textAlign: "right" }), fontSize: 9}}>{(item.price || 0).toFixed(2)}</td>
                  <td style={{...tds({ textAlign: "right", fontWeight: 600, color: item.qty < 0 ? "#dc2626" : "inherit" }), fontSize: 9}}>{((item.price || 0) * (item.qty || 0)).toFixed(2)}</td>
                </tr>
              ))}
              {Array(Math.max(0, 4 - (txn.items || []).length)).fill(0).map((_, i) => (
                <tr key={"e" + i}>{[0,1,2,3,4,5].map((c) => <td key={c} style={{...tds({ height: 18 }), fontSize: 9}}>&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ borderLeft: BDR, borderRight: BDR, borderBottom: BDR }}>
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1, padding: "6px 8px", borderRight: BDR, fontSize: 9 }}>
                <b>Amount in Words:</b><br />{amtWords}
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px dashed #999" }}>
                  <b>Payment:</b> {paymentLabel}
                  {creditAmt > 0 && <div style={{ fontWeight: 700, color: "#dc2626", marginTop: 2 }}>⚠ Due: {f(creditAmt)}</div>}
                </div>
              </div>
              <div style={{ width: 200, fontSize: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}><span>Gross Total</span><span style={{ fontWeight: 600 }}>{f(subtotal)}</span></div>
                {(txn.subtotal - txn.taxable) > 0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}>
                    <span>Less Discount</span>
                    <span style={{ fontWeight: 600 }}>{f(Math.round((txn.subtotal - txn.taxable) * 100) / 100)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}><span>Taxable Value</span><span style={{ fontWeight: 600 }}>{f(txn.taxable)}</span></div>
                {gstRows.map((r) => (
                  <Fragment key={r.rate}>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}><span>CGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.cgst)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}><span>SGST @ {r.half}%</span><span style={{ fontWeight: 600 }}>{f(r.sgst)}</span></div>
                  </Fragment>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}><span>IGST @</span><span style={{ fontWeight: 600 }}>—</span></div>
                {!!(txn.roundOff && txn.roundOff !== 0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: BDR, padding: "3px 6px" }}>
                    <span>Round Off</span><span>{(txn.roundOff > 0 ? "+" : "-") + f(Math.abs(txn.roundOff))}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 6px", fontWeight: 900, fontSize: 11 }}><span>Net Value</span><span>{f(Math.round(total))}</span></div>
              </div>
            </div>
          </div>

          {/* FEATURE 4: Bank Details Section */}
          {(settings.bankName || settings.accountNumber || settings.ifscCode) && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: BDR, fontSize: 9 }}>
              <b>SELLER'S BANK DETAIL:</b>
              {settings.bankName && <div><b>Bank:</b> {settings.bankName}</div>}
              {settings.accountNumber && <div><b>A/C No.:</b> {settings.accountNumber}</div>}
              {settings.accountHolder && <div><b>A/C Holder:</b> {settings.accountHolder}</div>}
              {settings.ifscCode && <div><b>IFSC:</b> {settings.ifscCode}</div>}
            </div>
          )}

          {/* Footer with signature and email */}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: BDR, fontSize: 9 }}>
            <div style={{ marginBottom: 4 }}>{settings.footerNote}</div>
            
            {/* FEATURE 6: Email */}
            {settings.emailId && (
              <div style={{ marginBottom: 4, fontSize: 8 }}>Email: {settings.emailId}</div>
            )}

            {/* Certification text */}
            <div style={{ marginBottom: 4, fontSize: 8, fontStyle: "italic", borderTop: "1px dashed #999", paddingTop: 4 }}>
              {settings.signoff}
            </div>

            {/* FEATURE 3: Signature section with name */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 20, minWidth: 80 }}>_________________</div>
                <div style={{ fontSize: 8 }}>Receiver's Sign</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: 20, minWidth: 100 }}>for, {settings.shopName}</div>
                <div style={{ marginBottom: 20, minWidth: 100 }}>_________________</div>
                <div style={{ fontSize: 8 }}>Authorized Signatory</div>
                {settings.signatoryName && (
                  <div style={{ fontSize: 8, fontWeight: 700, marginTop: 2 }}>{settings.signatoryName}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 12, textAlign: "center", color: "#9ca3af", fontSize: 11 }}>
          Invoice ID: {txn.id}
        </div>
      </div>
    </div>
  );
}
