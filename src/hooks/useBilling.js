// ─────────────────────────────────────────────
// hooks/useBilling.js (FIXED FOR EXCLUSIVE GST)
// Changed: Price entered = WITHOUT GST
//          GST is calculated and ADDED on top
// ─────────────────────────────────────────────

import { useState } from "react";
import { saveInvoice } from "../lib/api";
import { PAYMENT_MODES } from "../constants";
import { getItemGstRate } from "../utils/gst";
import { genId } from "../utils/misc";

export function useBilling({ shopCode, role, settings, products, customers, setTransactions }) {

  // ── Cart ──────────────────────────────────────────────────
  const [cart, setCart]                       = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("c1");
  const [discount, setDiscount]               = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [payments, setPayments]               = useState([
    { mode: settings.defaultPaymentMode, amount: "" },
  ]);
  const [saving, setSaving]                   = useState(false);
  const [billDate, setBillDate]               = useState(() => new Date().toISOString().slice(0, 10));

  // ── Cart helpers ──────────────────────────────────────────
  const addLine    = () => setCart((p) => [...p, { uid: genId(), name: "", price: "", qty: 1 }]);
  const removeLine = (uid) => setCart((p) => p.filter((i) => i.uid !== uid));
  const updateLine = (uid, field, value) =>
    setCart((p) => p.map((i) => (i.uid === uid ? { ...i, [field]: value } : i)));

  // ── Payment row helpers ───────────────────────────────────
  const usedModes       = payments.map((p) => p.mode);
  const availableModesFor = (cur) => PAYMENT_MODES.filter((m) => m === cur || !usedModes.includes(m));
  const canAddPaymentRow  = payments.length < PAYMENT_MODES.length;

  const addPaymentRow = (currentNetAmount, currentPayments) => {
    const remaining = PAYMENT_MODES.filter((m) => !usedModes.includes(m));
    if (!remaining.length) return;
    const net = currentNetAmount || 0;
    const alreadyEntered = (currentPayments || [])
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const leftover = Math.max(0, net - alreadyEntered);
    setPayments((p) => [...p, { mode: remaining[0], amount: leftover > 0 ? String(leftover) : "" }]);
  };
  const removePaymentRow  = (idx) => setPayments((p) => p.filter((_, i) => i !== idx));
  const updatePaymentRow  = (idx, field, value) =>
    setPayments((p) => p.map((pm, i) => (i === idx ? { ...pm, [field]: value } : pm)));

  // ── GST calculations (EXCLUSIVE - price WITHOUT GST) ───────
  // Price entered = BASE AMOUNT (WITHOUT GST)
  // GST is ADDED on top
  const cartWithTax = cart.map((item) => {
    const price    = parseFloat(item.price) || 0;  // Price WITHOUT GST
    const qty      = parseFloat(item.qty)   || 0;
    const subtotal = price * qty;  // This is the taxable amount
    const grandSub = cart.reduce((s, i) => (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0) + s, 0);
    const manualDisc    = Math.min(parseFloat(discount) || 0, grandSub);
    const collected     = parseFloat(amountCollected) || 0;
    const effectiveDisc = collected > 0 ? Math.max(0, grandSub - collected) : manualDisc;
    const itemDiscShare    = grandSub > 0 ? (subtotal / grandSub) * effectiveDisc : 0;
    
    // Taxable amount = price after discount (still without GST)
    const taxableAmount = subtotal - itemDiscShare;
    const rate = getItemGstRate(item.name, taxableAmount, products, settings);
    
    // Tax amount = taxableAmount * rate (GST added on top)
    const taxAmount = taxableAmount * rate;
    
    // Total = taxable + tax
    const total = taxableAmount + taxAmount;
    
    return { ...item, price, qty, subtotal, gstRate: rate, taxAmount, total };
  });

  const grandSubtotal  = cartWithTax.reduce((s, i) => s + i.subtotal, 0);
  const manualDiscount = Math.min(parseFloat(discount) || 0, grandSubtotal);
  const collected      = parseFloat(amountCollected) || 0;
  const useCollected   = collected > 0 && grandSubtotal > 0;

  // Blended GST rate (weighted average)
  const blendedRate = grandSubtotal > 0
    ? cartWithTax.reduce((s, i) => s + (i.subtotal / grandSubtotal) * i.gstRate, 0)
    : 0;

  // EXCLUSIVE GST CALCULATION:
  // taxableAmount = grossAfterDiscount (WITHOUT GST)
  // gstAmount = taxableAmount * blendedRate
  // netAmount = taxableAmount + gstAmount
  const grossAfterDiscount = useCollected
    ? Math.max(0, collected)
    : grandSubtotal - manualDiscount;

  // In exclusive mode, grossAfterDiscount IS the taxable amount
  const taxableAmount = Math.round(grossAfterDiscount * 100) / 100;
  
  // Calculate GST on the taxable amount
  const rawGST = taxableAmount * blendedRate;
  const gstAmount = Math.round(rawGST * 100) / 100;
  
  // Net = taxable + GST
  const netBeforeRound = taxableAmount + gstAmount;
  const netAmount = useCollected ? Math.round(collected) : Math.round(netBeforeRound);
  const roundOff = Math.round((netAmount - netBeforeRound) * 100) / 100;

  // ── Validation flags ──────────────────────────────────────
  const validCart         = cartWithTax.filter((i) => i.name && i.price !== 0 && i.qty !== 0);
  const totalPayments     = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const creditInPayments  = payments.find((p) => p.mode === "Credit");
  const creditAmount      = parseFloat(creditInPayments?.amount) || 0;
  const hasCredit         = creditAmount > 0;
  const creditNeedsCustomer   = hasCredit && selectedCustomer === "c1";
  const paymentSplitMismatch  = payments.length > 1 && totalPayments > 0 && Math.abs(totalPayments - netAmount) > 1;

  // ── Save invoice ──────────────────────────────────────────
  const handleConfirmPayment = async () => {
    if (validCart.length === 0) return;
    if (creditNeedsCustomer) {
      alert("Credit sales require a named customer. Please select or create a customer.");
      return;
    }
    if (paymentSplitMismatch) {
      alert(`Payment total doesn't match net amount. Please fix.`);
      return;
    }

    setSaving(true);
    try {
      const finalPayments = payments.map((p, i) =>
        i === 0 && payments.length === 1 && !p.amount
          ? { ...p, amount: netAmount }
          : p
      );

      const txn = {
        id: genId(),
        invoiceNo: "",
        date: billDate,
        soRoNumber: "",
        customerId: selectedCustomer,
        items: validCart.map((item) => ({
          uid: item.uid,
          name: item.name,
          price: item.price,
          qty: item.qty,
          gst: item.gstRate,
          amount: item.subtotal,
          lineTotal: item.total,
        })),
        subtotal: Math.round(taxableAmount * 100) / 100,
        taxable: Math.round(taxableAmount * 100) / 100,
        totalTax: Math.round(gstAmount * 100) / 100,
        roundOff,
        total: netAmount,
        discount: manualDiscount,
        discountPercent: grandSubtotal > 0 ? Math.round((manualDiscount / grandSubtotal) * 10000) / 100 : 0,
        paymentMode: finalPayments[0]?.mode || "Cash",
        payments: finalPayments,
        amountCollected: netAmount,
        credit: creditAmount,
        status: "completed",
        createdBy: role,
      };

      const saved = await saveInvoice(shopCode, txn);
      if (saved) {
        setTransactions((prev) => [...prev, saved]);
        setCart([]);
        setDiscount("");
        setAmountCollected("");
        setPayments([{ mode: settings.defaultPaymentMode, amount: "" }]);
        alert(`Invoice ${saved.invoiceNo} created successfully!`);
      }
    } catch (err) {
      alert("Error: " + (err.message || "Failed to save invoice"));
    } finally {
      setSaving(false);
    }
  };

  return {
    cart, addLine, removeLine, updateLine,
    cartWithTax, grandSubtotal, taxableAmount, gstAmount, netAmount, roundOff,
    discount, setDiscount, manualDiscount,
    amountCollected, setAmountCollected,
    payments, addPaymentRow, removePaymentRow, updatePaymentRow, canAddPaymentRow, availableModesFor,
    selectedCustomer, setSelectedCustomer,
    billDate, setBillDate,
    handleConfirmPayment, saving, blendedRate,
  };
}
