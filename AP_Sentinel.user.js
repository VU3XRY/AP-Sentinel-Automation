// ==UserScript==
// @name         AP Focus - Precision v5.2.2
// @namespace    api.gcc.bangalore.arunava.dey
// @version      5.2.2
// @description  Automated Audit & Verification Engine for SharePoint/AX Workflows.
// @author       Arunava Dey
// @match        https://apigroupinc.sharepoint.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (window.self !== window.top || document.getElementById("ap-sentinel-v52")) return;

    const KNOWLEDGE_BASE = {
        entities: {
            "1046": {
                name: "USAF (Dawn)",
                note: "Tax Alert! If AX Use Tax is $0 but PDF has Sales Tax, REASSIGN to Dawn."
            },
            "1025": {
                name: "Viking (Jennifer)",
                note: "Order-based. If grid is empty, toggle 'Ordered Quantity' in AX."
            },
            "1061": {
                name: "AFPG (POC)",
                note: "Receipt-based. If grid is empty, item is likely not received."
            }
        },
rules: [
    { "q": "USAFP Scope", "a": "GCC ONLY processes PO/Job-related invoices. Non-PO invoices must be entered by POC." },
    { "q": "USAFP PO Not Confirmed", "a": "If PO Approval Status is NOT CONFIRMED in AX → Reassign to POC. Do NOT reject in SharePoint." },
    { "q": "USAFP Open Order", "a": "If PO Line Status is NOT RECEIVED (Open Order) → Reassign to POC. Do NOT process invoice." },
    { "q": "USAFP Header Match", "a": "Vendor Name, Remit To Address, Invoice Number, Invoice Date, and Invoice Amount must match invoice PDF. Any mismatch → Reassign to POC." },
    { "q": "USAFP Quantity Short", "a": "If AX quantity is LESS than invoice quantity → Reassign to POC." },
    { "q": "USAFP Quantity Excess", "a": "If AX quantity is MORE than invoice quantity → Quantity may be amended in AX as per invoice." },
    { "q": "USAFP Variance", "a": "≤ $5 → Post with 'Post variance to penny difference (40)'. > $5 → Reassign to POC (Dawn Maynard)." },
    { "q": "USAFP Tax Handling", "a": "If tax doesn't match, enter amount from invoice into TAX field; if no tax collected, uncheck 'Vendor Collect Tax on entire invoice'." },
    { "q": "VIKING Scope", "a": "GCC ONLY processes PO/Job-related invoices. Non-PO invoices must be entered by POC." },
    { "q": "VIKING PO Not Confirmed", "a": "If PO Approval Status is NOT CONFIRMED in AX → Reassign to POC in SharePoint." },
    { "q": "VIKING Quantity Short", "a": "If AX quantity is LESS than invoice quantity → Reassign to POC (POC)." },
    { "q": "VIKING Quantity Excess", "a": "If AX quantity is MORE than invoice quantity → Quantity may be amended in AX as per invoice." },
    { "q": "VIKING No Lines to Invoice", "a": "If 'No lines to invoice' → Change Default Quantity for Lines to Ordered Quantity. If unresolved → Reassign to POC." },
    { "q": "VIKING Variance", "a": "≤ $5 → Update amount and check 'Post variance to penny difference (40)'. > $5 → Reassign to POC (POC)." },
    { "q": "VIKING Status Update", "a": "After posting, update Invoice Status to 'Sch for Payment' in SharePoint. Reassigned invoices must be routed back to POC." },
    { "q": "AFPG Scope", "a": "GCC ONLY processes PO/Job-related invoices. Non-PO invoices must be entered by POC ." },
    { "q": "AFPG Receipts", "a": "If receipt grid is EMPTY → Invoice is NOT RECEIVED. Note 'PO line not received – Open order' and reassign to POC ." },
    { "q": "AFPG Open Order", "a": "If PO Line Status is NOT RECEIVED → Reassign to POC (POC ) in SharePoint. Do NOT reject." },
    { "q": "AFPG Quantity Short", "a": "If AX quantity is LESS than invoice quantity → Reassign to POC (POC )." },
    { "q": "AFPG Quantity Excess", "a": "If AX quantity is MORE than invoice quantity → Quantity may be amended in AX." },
    { "q": "AFPG Variance", "a": "≤ $5 → Post with 'Post variance to penny difference (40)'. > $5 → Reassign to POC (POC )." },
    { "q": "AFPG Discrepancy Handling", "a": "Duplicate invoice, subtotal mismatch, or no lines to invoice → Close invoice in AX, select error in SharePoint, and reassign to POC ." },
    { "q": "General Invoice Numbering", "a": "Format exactly as shown on invoice; remove spaces for 'Reliable' and remove asterisks (*) if applicable. No special characters/symbols allowed." }
],
        notes: [
            { "l": "Open Order", "t": "PO line not received – Open order" },
            { "l": "Duplicate", "t": "Duplicate invoice—already invoiced in AX. Verified History." },
            { "l": "Remit Err", "t": "Remit address mismatch—needs vendor update" },
            { "l": "Tax Query", "t": "Job Tax Exempt" },
            { "l": "Multiple Invoices", "t": "Multiple invoices in one PDF - Reassigned for splitting" },
            { "l": "Freight", "t": "Freight charges exceed allowed limit" },
            { "l": "No Receipt", "t": "Packing slip/Receipt not found in system" }
        ]
    };

    function initSentinel() {
        if (document.getElementById("ap-sentinel-v52")) return;

        const container = document.createElement('div');
        container.id = "ap-sentinel-v52";
        container.style = "position: fixed; top: 100px; right: 20px; width: 180px; background: white; border: 2px solid #004a99; border-radius: 10px; z-index: 2147483647; box-shadow: 0 10px 40px rgba(0,0,0,0.5); font-family: 'Segoe UI', sans-serif; cursor: default; overflow: hidden;";

        container.innerHTML = `
            <div id="ap-header" style="background: #004a99; color: white; padding: 12px; font-weight: bold; font-size: 13px; cursor: move; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <span>AP SENTINEL</span>
                <span id="ap-toggle-icon" style="cursor: pointer; padding: 0 5px;">+</span>
            </div>
            <div id="ap-body" style="max-height: 620px; overflow-y: auto; padding: 15px; display: none;">
                <div style="background: #f0f7ff; padding: 10px; border-radius: 6px; border: 1px solid #cce5ff; margin-bottom: 12px;">
                    <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 5px; font-size: 11px;">
                        <span>Vendor Name:</span> <b id="res-vendor" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>PO:</span> <b id="res-po" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Inv #:</span> <b id="res-inv" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Date:</span> <b id="res-date" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Amt:</span> <b id="res-amt" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
<div id="credit-label" style="grid-column: span 2; color: #d13438; font-weight: bold; font-size: 10px; text-align: right; display: none; user-select: none;">⚠ CREDIT NOTE</div>
                    </div>
                    <button id="btn-fetch" style="width: 100%; margin-top: 8px; padding: 6px; background: #004a99; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 10px;">SCAN PROPERTIES</button>
                </div>

                <div style="margin-bottom: 10px;">
                    <input type="text" id="sop-search" placeholder="Search SOP..." style="width: 100%; padding: 6px; border: 1px solid #004a99; border-radius: 4px; box-sizing: border-box; font-size: 11px;">
                    <div id="sop-results" style="margin-top: 5px; max-height: 120px; overflow-y: auto;"></div>
                </div>

                <div id="notes-area" style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;"></div>

                <div style="border-top: 1px solid #eee; padding-top: 8px; font-size: 9px; color: #aaa; text-align: center;">
                    Created by Arunava Dey | APi GCC Bangalore
                </div>
            </div>
        `;
        document.body.appendChild(container);

        const sopInput = document.getElementById('sop-search');
        const sopResults = document.getElementById('sop-results');

        sopInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            sopResults.innerHTML = "";
            if (query.length < 2) return;

            const matches = KNOWLEDGE_BASE.rules.filter(r =>
                r.q.toLowerCase().includes(query) || r.a.toLowerCase().includes(query)
            );

            matches.forEach(m => {
                const div = document.createElement('div');
                div.style = "background: #fff9c4; border-left: 3px solid #fbc02d; padding: 5px; margin-bottom: 5px; font-size: 10px; border-radius: 2px;";
                div.innerHTML = `<strong>${m.q}:</strong> ${m.a}`;
                sopResults.appendChild(div);
            });
        });

        document.getElementById('btn-fetch').onclick = () => {
            const docs = [document];
            document.querySelectorAll('iframe').forEach(f => {
                try { if(f.id !== 'search-frame') docs.push(f.contentDocument); } catch(e) {}
            });

            docs.forEach(d => {
                if(!d) return;

                const po = d.querySelector(`[aria-label*="PO Number"]`);
if (po) {
    let poValue = po.getAttribute('aria-label').split(',')[1]?.trim() || "";

    // Check if there is a hyphen (e.g., 1046-0105426)
    if (poValue.includes('-')) {
        poValue = poValue.split('-')[1]; // Take the part after the dash
    }

    // Prepend the asterisk as requested
    document.getElementById('res-po').innerText = "*" + poValue;
}

                const inv = d.querySelector(`[aria-label*="Invoice Number"]`);
                if(inv) document.getElementById('res-inv').innerText = inv.getAttribute('aria-label').split(',')[1]?.trim();

                const dt = d.querySelector(`[aria-label*="Invoice Date"]`);
                if(dt) document.getElementById('res-date').innerText = dt.getAttribute('aria-label').split(',')[1]?.trim().split(' ')[0];

                const vendor = d.querySelector(`[aria-label*="Vendor Name"]`);
                if(vendor) {
                    const vendorValue = vendor.getAttribute('aria-label').split(',')[1]?.trim();
                    const resVendor = document.getElementById('res-vendor');
                    if(resVendor) resVendor.innerText = vendorValue;
                }

                const am = d.querySelector(`[aria-label*="Invoice Amount"]`);
const creditLabel = document.getElementById('credit-label'); // Get the new label

if (am) {
    const label = am.getAttribute('aria-label');
    const match = label.match(/Invoice Amount,\s*([-\d,.( )]+)/);

    if (match && match[1]) {
        let cleanAmt = match[1].trim().replace(/,$/, "");
        const amtEl = document.getElementById('res-amt');
        amtEl.innerText = cleanAmt;

        // Check for Negative/Credit
        if (cleanAmt.includes('-') || cleanAmt.includes('(')) {
            amtEl.style.color = "#d13438";
            creditLabel.style.display = "block"; // Show the "Credit Note" text
        } else {
            amtEl.style.color = "#107c10";
            creditLabel.style.display = "none";  // Hide it for normal invoices
        }
    }
}
            });
        };

        let isDragging = false, offsetLeft = 0, offsetTop = 0;
        const header = document.getElementById('ap-header');
        header.addEventListener('mousedown', (e) => {
            if(e.target.id === 'ap-toggle-icon') return;
            isDragging = true;
            offsetLeft = e.clientX - container.getBoundingClientRect().left;
            offsetTop = e.clientY - container.getBoundingClientRect().top;
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            container.style.left = (e.clientX - offsetLeft) + 'px';
            container.style.top = (e.clientY - offsetTop) + 'px';
            container.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => isDragging = false);

        const body = document.getElementById('ap-body');
        const icon = document.getElementById('ap-toggle-icon');
        icon.onclick = (e) => {
            e.stopPropagation();
            const isHidden = body.style.display === "none";
            body.style.display = isHidden ? "block" : "none";
            icon.innerText = isHidden ? "−" : "+";
            container.style.width = isHidden ? "320px" : "180px";
        };

        const nArea = document.getElementById('notes-area');
        KNOWLEDGE_BASE.notes.forEach(n => {
            const b = document.createElement('button');
            b.innerText = n.l; b.style = "padding: 5px; font-size: 10px; cursor: pointer; border: 1px solid #ccc; background: white; border-radius: 4px;";
            b.onclick = () => { navigator.clipboard.writeText(n.t); b.style.background = "#d4edda"; setTimeout(() => b.style.background = "white", 800); };
            nArea.appendChild(b);
        });

        document.querySelectorAll('.click-val').forEach(el => {
            el.addEventListener('click', () => {
                if (el.innerText !== "---") { navigator.clipboard.writeText(el.innerText); el.style.color="#28a745"; setTimeout(()=>el.style.color="#d13438", 600); }
            });
        });
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        initSentinel();
    } else {
        window.addEventListener('DOMContentLoaded', initSentinel);
    }
})();
