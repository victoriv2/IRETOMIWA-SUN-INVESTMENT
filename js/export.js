// ============================================
// EXPORT.JS - Professional Excel & PDF Exporter
// Strictly NO EMOJIS! Official Naira ₦ currency.
// ============================================

const Exporter = (() => {
  // ---- Helper: Format Currency Amount ----
  function formatAmount(n) {
    return parseFloat(n || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ---- 1. EXCEL / CSV EXPORT ----
  // Outputs UTF-8 BOM CSV so Microsoft Excel natively opens with perfect formatting & Naira (₦) signs
  function toExcel({ filename, headers, rows }) {
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const headerLine = headers.map(h => escapeCsv(h)).join(',');
    const rowLines = rows.map(r => r.map(c => escapeCsv(c)).join(','));
    const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const finalName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.setAttribute('download', finalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- 2. PDF / PRINT REPORT EXPORT ----
  // Opens a high-resolution, print-ready official statement with 1-click Save-as-PDF
  function toPDF({ title, subtitle, meta, summary, headers, rows }) {
    const printWindow = window.open('', '_blank', 'width=920,height=720');
    if (!printWindow) {
      alert('Please allow popups to open and print the PDF statement.');
      return;
    }

    const todayStr = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const summaryHtml = summary && summary.length ? `
      <div class="summary-cards">
        ${summary.map(s => `
          <div class="summary-card">
            <div class="summary-label">${s.label}</div>
            <div class="summary-val ${s.isDebit ? 'debit' : ''}">${s.value}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    const metaHtml = meta && meta.length ? `
      <div class="meta-row">
        ${meta.map(m => `<span><strong>${m.label}:</strong> ${m.value}</span>`).join(' &bull; ')}
      </div>
    ` : '';

    const tableRowsHtml = rows.map((r, i) => `
      <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
        ${r.map((c, colIdx) => {
          const isAmt = headers[colIdx] && headers[colIdx].toLowerCase().includes('amount') || headers[colIdx].toLowerCase().includes('balance') || headers[colIdx].toLowerCase().includes('deposited') || headers[colIdx].toLowerCase().includes('withdrawn');
          return `<td class="${isAmt ? 'amount-col' : ''}">${c}</td>`;
        }).join('')}
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${title} - Iretomiwa Sun Enterprise</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1a2228;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5px solid #095426;
            padding-bottom: 16px;
            margin-bottom: 18px;
          }
          .brand-title {
            font-size: 20px;
            font-weight: 800;
            color: #095426;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            margin: 0 0 4px 0;
          }
          .brand-sub {
            font-size: 11px;
            font-weight: 600;
            color: #5d6d79;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin: 0;
          }
          .report-info {
            text-align: right;
          }
          .report-title {
            font-size: 18px;
            font-weight: 700;
            color: #1a2228;
            margin: 0 0 4px 0;
          }
          .report-date {
            font-size: 11.5px;
            color: #7d8b99;
          }
          .meta-row {
            background: #f4f7f5;
            border: 1px solid #e1e7e4;
            padding: 8px 14px;
            border-radius: 6px;
            font-size: 12px;
            color: #37474f;
            margin-bottom: 16px;
          }
          .summary-cards {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
          }
          .summary-card {
            flex: 1;
            background: #f8faf9;
            border: 1px solid #e1e7e4;
            border-radius: 8px;
            padding: 10px 14px;
          }
          .summary-label {
            font-size: 10.5px;
            font-weight: 600;
            color: #7d8b99;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .summary-val {
            font-size: 16px;
            font-weight: 800;
            color: #095426;
            margin-top: 4px;
          }
          .summary-val.debit { color: #c62828; }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin-bottom: 24px;
          }
          .report-table th {
            background: #095426;
            color: #ffffff;
            font-weight: 600;
            text-align: left;
            padding: 9px 12px;
          }
          .report-table td {
            padding: 8px 12px;
            border-bottom: 1px solid #e5eae7;
          }
          .report-table tr.odd {
            background: #fbfdfc;
          }
          .amount-col {
            font-weight: 700;
            text-align: right;
          }
          .report-table th:last-child,
          .report-table td:last-child {
            text-align: right;
          }
          .print-footer {
            border-top: 1px solid #e5eae7;
            padding-top: 12px;
            display: flex;
            justify-content: space-between;
            font-size: 10.5px;
            color: #8c9ba5;
            margin-top: 24px;
          }
          .no-print-bar {
            background: #eaf3ed;
            border: 1px solid #c2ded0;
            padding: 10px 18px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .btn-print {
            background: #095426;
            color: #ffffff;
            border: none;
            padding: 9px 18px;
            border-radius: 6px;
            font-weight: 700;
            cursor: pointer;
            font-size: 13px;
          }
          .btn-print:hover {
            background: #063e1c;
          }
          @media print {
            .no-print-bar { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="no-print-bar">
          <span style="font-size:13px; color:#095426; font-weight:600;">Print Statement or Save as PDF via browser print dialog</span>
          <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
        </div>

        <div class="print-header">
          <div>
            <h2 class="brand-title">Iretomiwa Sun Enterprise</h2>
            <p class="brand-sub">Savings & Loans Management System</p>
          </div>
          <div class="report-info">
            <h1 class="report-title">${title}</h1>
            <div class="report-date">Generated: ${todayStr}</div>
          </div>
        </div>

        ${metaHtml}
        ${summaryHtml}

        <table class="report-table">
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="print-footer">
          <span>Official Financial Statement &bull; Iretomiwa Sun Enterprise</span>
          <span>Confidential Client Financial Record</span>
        </div>

        <script>
          window.addEventListener('load', () => {
            setTimeout(() => { window.print(); }, 400);
          });
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return { toExcel, toPDF, formatAmount };
})();
