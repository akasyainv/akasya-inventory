/* =============================================
   AKASYA COFFEE - REPORTS MODULE
   All report generation and rendering
   ============================================= */

const ReportsModule = (function() {
    'use strict';

    function render() {
        const activeTab = document.querySelector('.report-tab.active');
        if (activeTab) {
            renderPanel(activeTab.dataset.report);
        } else {
            renderSummary();
        }
    }

    function renderPanel(type) {
        switch(type) {
            case 'summary': renderSummary(); break;
            case 'transactions': renderTransactions(); break;
            case 'lowstock': renderLowStock(); break;
            case 'suppliers': renderSuppliers(); break;
            case 'branches': renderBranches(); break;
            case 'mostused': renderMostUsed(); break;
        }
    }

    function renderSummary() {
        const items = app.getInventoryData();
        const settings = app.getSettingsData();
        const whName = settings.warehouseName || 'Main Warehouse';

        let totalValue = 0, totalItems = items.length, totalQty = 0, lowCount = 0;
        const categoryStats = {};

        items.forEach(item => {
            const w = item.qtyWarehouse || 0;
            const b = item.qtyBamban || 0;
            const c = item.qtyCapas || 0;
            const itemTotal = w + b + c;
            const val = itemTotal * (item.cost || 0);
            totalValue += val;
            totalQty += itemTotal;
            if (app.getStatus(item) !== 'Healthy') lowCount++;

            const cat = item.category || 'Uncategorized';
            if (!categoryStats[cat]) categoryStats[cat] = { items: 0, qty: 0, value: 0, low: 0 };
            categoryStats[cat].items++;
            categoryStats[cat].qty += itemTotal;
            categoryStats[cat].value += val;
            if (app.getStatus(item) !== 'Healthy') categoryStats[cat].low++;
        });

        document.getElementById('reportSummaryStats').innerHTML =
            '<div class="report-stat-item"><div class="report-stat-value">' + totalItems + '</div><div class="report-stat-label">Total Items</div></div>' +
            '<div class="report-stat-item"><div class="report-stat-value">' + totalQty.toLocaleString() + '</div><div class="report-stat-label">Total Quantity</div></div>' +
            '<div class="report-stat-item"><div class="report-stat-value">' + app.formatCurrency(totalValue) + '</div><div class="report-stat-label">Total Value</div></div>' +
            '<div class="report-stat-item"><div class="report-stat-value" style="color:var(--danger);">' + lowCount + '</div><div class="report-stat-label">Low Stock</div></div>';

        const tbody = document.getElementById('reportSummaryTable');
        const cats = Object.entries(categoryStats).sort((a, b) => b[1].value - a[1].value);
        tbody.innerHTML = cats.map(([cat, stat]) => '<tr>' +
            '<td><strong>' + app.escapeHtml(cat) + '</strong></td>' +
            '<td class="text-right">' + stat.items + '</td>' +
            '<td class="text-right">' + stat.qty.toLocaleString() + '</td>' +
            '<td class="text-right">' + app.formatCurrency(stat.value) + '</td>' +
            '<td class="text-right" style="color:' + (stat.low > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">' + stat.low + '</td>' +
        '</tr>').join('');
    }

    function renderTransactions() {
        const allTransactions = app.getTransactionsData();
        const typeFilter = document.getElementById('reportTransType').value;
        const fromDate = document.getElementById('reportTransFrom').value;
        const toDate = document.getElementById('reportTransTo').value;

        let filtered = [...allTransactions];
        if (typeFilter) filtered = filtered.filter(t => t.type === typeFilter);
        if (fromDate) filtered = filtered.filter(t => t.date >= fromDate);
        if (toDate) filtered = filtered.filter(t => t.date <= toDate);

        // Sort by date descending
        filtered.sort((a, b) => {
            const aKey = (a.date || '') + 'T' + (a.time || '');
            const bKey = (b.date || '') + 'T' + (b.time || '');
            return bKey.localeCompare(aKey);
        });

        const tbody = document.getElementById('reportTransactionsTable');
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No transactions found</p></td></tr>';
        } else {
            const typeColors = { Receive: 'badge-healthy', Transfer: 'badge-pending', Damage: 'badge-critical', Expired: 'badge-low', Adjustment: 'badge-low', Return: 'badge-low' };
            tbody.innerHTML = filtered.slice(0, 200).map(tx => '<tr>' +
                '<td>' + app.formatDate(tx.date) + ' ' + (tx.time || '') + '</td>' +
                '<td><span class="badge-status ' + (typeColors[tx.type] || '') + '">' + tx.type + '</span></td>' +
                '<td><span class="item-sku">' + app.escapeHtml(tx.refNum) + '</span></td>' +
                '<td>' + app.escapeHtml(tx.itemName) + '</td>' +
                '<td class="text-right">' + tx.qty + '</td>' +
                '<td>' + app.escapeHtml(tx.to || tx.from || '-') + '</td>' +
                '<td>' + app.escapeHtml(tx.user || 'System') + '</td>' +
                '<td>' + app.escapeHtml(tx.notes || tx.reason || '-') + '</td>' +
            '</tr>').join('');
        }
    }

    function renderLowStock() {
        const items = app.getInventoryData();
        const lowItems = items.filter(i => app.getStatus(i) !== 'Healthy').sort((a, b) => {
            const totalA = (a.qtyWarehouse || 0) + (a.qtyBamban || 0) + (a.qtyCapas || 0);
            const totalB = (b.qtyWarehouse || 0) + (b.qtyBamban || 0) + (b.qtyCapas || 0);
            return totalA - totalB;
        });

        const tbody = document.getElementById('reportLowStockTable');
        if (lowItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No low stock items</p></td></tr>';
        } else {
            tbody.innerHTML = lowItems.map(item => {
                const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
                const status = app.getStatus(item);
                const statusClass = status === 'Critical' ? 'badge-critical' : 'badge-low';
                return '<tr>' +
                    '<td><strong>' + app.escapeHtml(item.name) + '</strong></td>' +
                    '<td>' + app.escapeHtml(item.category) + '</td>' +
                    '<td class="text-right">' + (item.qtyWarehouse || 0) + '</td>' +
                    '<td class="text-right">' + (item.qtyBamban || 0) + '</td>' +
                    '<td class="text-right">' + (item.qtyCapas || 0) + '</td>' +
                    '<td class="text-right"><strong>' + total + '</strong></td>' +
                    '<td class="text-right">' + (item.reorderLevel || 0) + '</td>' +
                    '<td><span class="badge-status ' + statusClass + '">' + status + '</span></td>' +
                '</tr>';
            }).join('');
        }
    }

    function renderSuppliers() {
        const suppliers = app.getSuppliersData();
        const transactions = app.getTransactionsData();
        const items = app.getInventoryData();

        const supplierData = suppliers.map(s => {
            const sId = s._key || s.id;
            const suppliedItems = items.filter(i => i.supplierId === sId);
            const receives = transactions.filter(t => t.type === 'Receive' && t.supplierId === sId);
            const totalReceived = receives.reduce((sum, t) => sum + (t.qty || 0), 0);
            const totalValue = receives.reduce((sum, t) => sum + (t.qty || 0) * (t.unitCost || 0), 0);
            const sortedReceives = [...receives].sort((a, b) => {
                const aKey = (a.date || '') + 'T' + (a.time || '');
                const bKey = (b.date || '') + 'T' + (b.time || '');
                return bKey.localeCompare(aKey);
            });
            const lastDelivery = sortedReceives.length > 0 ? sortedReceives[0].date : null;
            return { ...s, productCount: suppliedItems.length, totalReceived, totalValue, lastDelivery };
        }).sort((a, b) => b.totalValue - a.totalValue);

        const tbody = document.getElementById('reportSupplierTable');
        tbody.innerHTML = supplierData.map(s => '<tr>' +
            '<td><strong>' + app.escapeHtml(s.name) + '</strong></td>' +
            '<td class="text-right">' + s.productCount + '</td>' +
            '<td class="text-right">' + s.totalReceived.toLocaleString() + '</td>' +
            '<td class="text-right">' + app.formatCurrency(s.totalValue) + '</td>' +
            '<td>' + (s.lastDelivery ? app.formatDate(s.lastDelivery) : 'No deliveries') + '</td>' +
        '</tr>').join('');
    }

    function renderBranches() {
        const items = app.getInventoryData();
        const settings = app.getSettingsData();
        const whName = settings.warehouseName || 'Main Warehouse';

        const branches = [
            { key: 'Warehouse', name: whName, qtyKey: 'qtyWarehouse' },
            { key: 'Bamban', name: 'Bamban Branch', qtyKey: 'qtyBamban' },
            { key: 'Capas', name: 'Capas Branch', qtyKey: 'qtyCapas' }
        ];

        let grandTotalVal = 0;
        const branchData = branches.map(b => {
            let totalItems = 0, totalQty = 0, totalValue = 0, lowStock = 0;
            items.forEach(item => {
                const qty = item[b.qtyKey] || 0;
                if (qty > 0) totalItems++;
                totalQty += qty;
                totalValue += qty * (item.cost || 0);
                if (qty <= (item.reorderLevel || settings.reorderLevel || 10)) lowStock++;
            });
            grandTotalVal += totalValue;
            return { ...b, totalItems, totalQty, totalValue, lowStock };
        });

        document.getElementById('reportBranchStats').innerHTML = branchData.map(b =>
            '<div class="report-stat-item"><div class="report-stat-value">' + app.formatCurrency(b.totalValue) + '</div><div class="report-stat-label">' + b.name + '</div></div>'
        ).join('') +
        '<div class="report-stat-item"><div class="report-stat-value" style="color:var(--primary);">' + app.formatCurrency(grandTotalVal) + '</div><div class="report-stat-label">Grand Total</div></div>';

        document.getElementById('reportBranchTable').innerHTML = branchData.map(b => '<tr>' +
            '<td><strong>' + b.name + '</strong></td>' +
            '<td class="text-right">' + b.totalItems + '</td>' +
            '<td class="text-right">' + b.totalQty.toLocaleString() + '</td>' +
            '<td class="text-right">' + app.formatCurrency(b.totalValue) + '</td>' +
            '<td class="text-right" style="color:' + (b.lowStock > 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">' + b.lowStock + '</td>' +
        '</tr>').join('');
    }

    function renderMostUsed() {
        const items = app.getInventoryData();
        const transactions = app.getTransactionsData();
        const suppliers = app.getSuppliersData();

        const usageTypes = new Set(['Transfer', 'Damage', 'Expired', 'Return', 'Correction', 'Adjustment']);
        const itemUsage = {};
        transactions.forEach(tx => {
            if (!usageTypes.has(tx.type)) return;
            if (!itemUsage[tx.itemId]) itemUsage[tx.itemId] = { count: 0, totalQty: 0 };
            itemUsage[tx.itemId].count++;
            itemUsage[tx.itemId].totalQty += tx.qty || 0;
        });

        const mostUsed = Object.entries(itemUsage)
            .map(([itemId, usage]) => {
                const item = items.find(i => (i._key || i.id) === itemId);
                if (!item) return null;
                const supplier = suppliers.find(s => (s._key || s.id) === item.supplierId);
                return { ...item, ...usage, supplierName: supplier ? supplier.name : '-' };
            })
            .filter(Boolean)
            .sort((a, b) => b.totalQty - a.totalQty)
            .slice(0, 20);

        const tbody = document.getElementById('reportMostUsedTable');
        if (mostUsed.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No transaction data yet</p></td></tr>';
        } else {
            tbody.innerHTML = mostUsed.map(item => '<tr>' +
                '<td><strong>' + app.escapeHtml(item.name) + '</strong></td>' +
                '<td>' + app.escapeHtml(item.category) + '</td>' +
                '<td class="text-right">' + item.count + '</td>' +
                '<td class="text-right">' + item.totalQty.toLocaleString() + '</td>' +
                '<td>' + app.escapeHtml(item.supplierName) + '</td>' +
            '</tr>').join('');
        }
    }

    function exportCSV() {
        if (!Auth.can('canExport')) {
            app.showToast('You do not have permission to export.', 'error');
            return;
        }
        const items = app.getInventoryData();
        const suppliers = app.getSuppliersData();
        const settings = app.getSettingsData();
        const whName = settings.warehouseName || 'Warehouse';

        const headers = ['Item Name', 'Category', 'Supplier', whName, 'Bamban', 'Capas', 'Total Qty', 'Unit', 'Unit Cost', 'Total Value', 'Reorder Level', 'Status'];
        const rows = items.map(item => {
            const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
            const status = app.getStatus(item);
            const supplier = suppliers.find(s => (s._key || s.id) === item.supplierId);
            return [
                item.name, item.category, supplier ? supplier.name : '-',
                item.qtyWarehouse || 0, item.qtyBamban || 0, item.qtyCapas || 0,
                total, item.unit, item.cost || 0, total * (item.cost || 0),
                item.reorderLevel || 0, status
            ];
        });
        app.downloadCSV(headers, rows, 'akasya_inventory_report.csv');
        app.showToast('Report exported as CSV', 'success');
    }

    function printReport() {
        window.print();
    }

    return {
        render,
        renderPanel,
        renderSummary,
        renderTransactions,
        renderLowStock,
        renderSuppliers,
        renderBranches,
        renderMostUsed,
        exportCSV,
        printReport
    };
})();
