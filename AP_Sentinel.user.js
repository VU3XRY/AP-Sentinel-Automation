// ==UserScript==
// @name         AP Focus - Precision v5.2.2 (Portfolio Version)
// @namespace    portfolio.arunava.dey
// @version      5.2.2
// @description  Automated Audit & Verification Engine for ERP/SharePoint Workflows.
// @author       Arunava Dey
// @match        https://*.sharepoint.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Prevent execution in iframes or if already initialized
    if (window.self !== window.top || document.getElementById("ap-sentinel-v52")) return;

    const KNOWLEDGE_BASE = {
        entities: {
            "ENT_01": {
                name: "Business Unit A",
                note: "Tax Alert! If Use Tax is $0 but PDF has Sales Tax, REASSIGN to lead."
            },
            "ENT_02": {
                name: "Business Unit B",
                note: "Order-based. If grid is empty, toggle 'Ordered Quantity' in ERP."
            }
        },
        rules: [
            { "q": "Scope Check", "a": "Only process PO/Job-related invoices. Non-PO invoices must be entered by local POC." },
            { "q": "PO Status", "a": "If PO Approval Status is NOT CONFIRMED → Reassign. Do NOT reject in system." },
            { "q": "Header Match", "a": "Vendor, Address, Inv #, Date, and Amount must match PDF. Any mismatch → Reassign." },
            { "q": "Variance Rule", "a": "≤ $5 → Post with penny difference (40). > $5 → Reassign to Process Owner." },
            { "q": "General Formatting", "a": "Remove spaces and special characters from invoice numbers to match ERP requirements." }
        ],
        notes: [
            { "l": "Open Order", "t": "PO line not received – Open order" },
            { "l": "Duplicate", "t": "Duplicate invoice—already processed in system. Verified History." },
            { "l": "Remit Err", "t": "Remit address mismatch—needs vendor master update" },
            { "l": "Tax Query", "t": "Job Tax Exempt - verification required" }
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
                        <span>Vendor:</span> <b id="res-vendor" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>PO:</span> <b id="res-po" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Inv #:</span> <b id="res-inv" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Date:</span> <b id="res-date" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <span>Amt:</span> <b id="res-amt" class="click-val" style="color: #d13438; cursor: pointer;">---</b>
                        <div id="credit-label" style="grid-column: span 2; color: #d13438; font-weight: bold; font-size: 10px; text-align: right; display: none;">⚠ CREDIT NOTE</div>
                    </div>
                    <button id="btn-fetch" style="width: 100%; margin-top: 8px; padding: 6px; background: #004a99; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 10px;">SCAN PROPERTIES</button>
                </div>

                <div style="margin-bottom: 10px;">
                    <input type="text" id="sop-search" placeholder="Search SOP..." style="width: 100%; padding: 6px; border: 1px solid #004a99; border-radius: 4px; box-sizing: border-box; font-size: 11px;">
                    <div id="sop-results" style="margin-top: 5px; max-height: 120px; overflow-y: auto;"></div>
                </div>

                <div id="notes-area" style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;"></div>

                <div style="border-top: 1px solid #eee; padding-top: 8px; font-size: 9px; color: #aaa; text-align: center;">
                    Created by Arunava Dey | Process Automation
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // --- SOP Search Logic ---
        const sopInput = document.getElementById('sop-search');
        const sopResults = document.getElementById('sop-results');

        sopInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            sopResults.innerHTML = "";
            if (query.length < 2) return;

            KNOWLEDGE_BASE.rules.filter(r => 
                r.q.toLowerCase().includes(query) || r.a.toLowerCase().includes(query)
            ).forEach(m => {
                const div = document.createElement('div');
                div.style = "background: #fff9c4; border-left: 3px solid #fbc02d; padding: 5px; margin-bottom: 5px; font-size: 10px; border-radius: 2px;";
                div.innerHTML = `<strong>${m.q}:</strong> ${m.a}`;
                sopResults.appendChild(div);
            });
        });

        // --- Data Extraction Logic ---
        document.getElementById('btn-fetch').onclick = () => {
            const docs = [document];
            document.querySelectorAll('iframe').forEach(f => {
                try { if(f.contentDocument) docs.push(f.contentDocument); } catch(e) {}
            });

            docs.forEach(d => {
                if(!d) return;

                // Extraction helper using optional chaining for safety
                const getVal = (label) => d.querySelector(`[aria-label*="${label}"]`)?.getAttribute('aria-label')?.split(',')[1]?.trim() ?? "";

                const poValue = getVal("PO Number");
                if (poValue) {
                    const finalPo = poValue.includes('-') ? poValue.split('-')[1] : poValue;
                    document.getElementById('res-po').innerText = "*" + finalPo;
                }

                const invValue = getVal("Invoice Number");
                if (invValue) document.getElementById('res-inv').innerText = invValue;

                const dateValue = getVal("Invoice Date");
                if (dateValue) document.getElementById('res-date').innerText = dateValue.split(' ')[0];

                const vendorValue = getVal("Vendor Name");
                if (vendorValue) document.getElementById('res-vendor').innerText = vendorValue;

                const amtValue = getVal("Invoice Amount");
                const creditLabel = document.getElementById('credit-label');
                if (amtValue) {
                    let cleanAmt = amtValue.replace(/,$/, "");
                    const amtEl = document.getElementById('res-amt');
                    amtEl.innerText = cleanAmt;

                    if (cleanAmt.includes('-') || cleanAmt.includes('(')) {
                        amtEl.style.color = "#d13438";
                        creditLabel.style.display = "block";
                    } else {
                        amtEl.style.color = "#107c10";
                        creditLabel.style.display = "none";
                    }
                }
            });
        };

        // --- UI Interactions ---
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
            b.onclick = () => { 
                navigator.clipboard.writeText(n.t); 
                b.style.background = "#d4edda"; 
                setTimeout(() => b.style.background = "white", 800); 
            };
            nArea.appendChild(b);
        });

        document.querySelectorAll('.click-val').forEach(el => {
            el.addEventListener('click', () => {
                if (el.innerText !== "---") { 
                    navigator.clipboard.writeText(el.innerText); 
                    const oldColor = el.style.color;
                    el.style.color="#28a745"; 
                    setTimeout(()=>el.style.color=oldColor, 600); 
                }
            });
        });
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        initSentinel();
    } else {
        window.addEventListener('DOMContentLoaded', initSentinel);
    }
})();
