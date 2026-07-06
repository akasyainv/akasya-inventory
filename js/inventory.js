/* =============================================
   AKASYA COFFEE - INVENTORY MODULE
   Inventory CRUD, stock operations, and rendering
   SKU removed - items identified by Name, Category, Unit, Supplier
   ============================================= */

const InventoryModule = (function() {
    'use strict';

    // ==========================================
    // RENDER INVENTORY TABLE
    // ==========================================
    function render() {
        const items = app.getInventoryData();
        const suppliers = app.getSuppliersData();
        const filter = app.getInventoryFilter();
        const sort = app.getInventorySort();
        let pageNum = app.getInventoryPageNum();
        const perPage = app.getInventoryPerPage();

        // Populate filter dropdowns
        populateCategoryFilter(items);
        populateSupplierFilter(suppliers);

        // Apply filters
        let filtered = [...items];
        if (filter.search) {
            filtered = filtered.filter(i =>
                (i.name || '').toLowerCase().includes(filter.search) ||
                (i.category || '').toLowerCase().includes(filter.search)
            );
        }
        if (filter.category) {
            filtered = filtered.filter(i => i.category === filter.category);
        }
        if (filter.supplier) {
            filtered = filtered.filter(i => i.supplierId === filter.supplier);
        }
        if (filter.status) {
            filtered = filtered.filter(i => app.getStatus(i) === filter.status);
        }

        // Apply sort
        filtered.sort((a, b) => {
            let av = a[sort.field] || '';
            let bv = b[sort.field] || '';
            if (typeof av === 'string') av = av.toLowerCase();
            if (typeof bv === 'string') bv = bv.toLowerCase();
            if (av < bv) return sort.dir === 'asc' ? -1 : 1;
            if (av > bv) return sort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        // Pagination
        const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
        if (pageNum > totalPages) pageNum = 1;
        app.setInventoryPageNum(pageNum);
        const start = (pageNum - 1) * perPage;
        const pageItems = filtered.slice(start, start + perPage);

        // Render table (no SKU column)
        const tbody = document.getElementById('inventoryTableBody');
        if (pageItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>No items found</p></td></tr>';
        } else {
            tbody.innerHTML = pageItems.map(item => {
                const status = app.getStatus(item);
                const statusClass = status === 'Healthy' ? 'badge-healthy' : status === 'Low' ? 'badge-low' : 'badge-critical';
                const supplier = suppliers.find(s => s.id === item.supplierId || s._key === item.supplierId);

                // Build actions based on permissions
                let actions = '';
                if (Auth.can('canEditItem')) {
                    actions += `<button class="btn-icon" onclick="InventoryModule.editItem('${item._key || item.id}')" title="Edit item" aria-label="Edit ${app.escapeHtml(item.name)}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>`;
                }
                if (Auth.can('canDeleteItem')) {
                    actions += `<button class="btn-icon" onclick="InventoryModule.confirmDelete('${item._key || item.id}', '${app.escapeHtml(item.name)}')" title="Delete item" aria-label="Delete ${app.escapeHtml(item.name)}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>`;
                }
                if (!actions) actions = '<span style="color:var(--text-muted);font-size:11px">View only</span>';

                return `<tr>
                    <td><span class="item-name-text">${app.escapeHtml(item.name)}</span></td>
                    <td>${app.escapeHtml(item.category)}</td>
                    <td>${app.escapeHtml(supplier ? supplier.name : '-')}</td>
                    <td class="text-right">${item.qtyWarehouse || 0}</td>
                    <td class="text-right">${item.qtyBamban || 0}</td>
                    <td class="text-right">${item.qtyCapas || 0}</td>
                    <td>${app.escapeHtml(item.unit)}</td>
                    <td class="text-right">${item.reorderLevel || 0}</td>
                    <td><span class="badge-status ${statusClass}">${status}</span></td>
                    <td>
                        <div class="table-actions">${actions}</div>
                    </td>
                </tr>`;
            }).join('');
        }

        // Pagination
        renderPagination(filtered.length, perPage, pageNum);
    }

    function populateCategoryFilter(items) {
        const select = document.getElementById('invCategoryFilter');
        const currentVal = select.value;
        const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
        select.innerHTML = '<option value="">All Categories</option>' +
            categories.map(c => `<option value="${app.escapeHtml(c)}">${app.escapeHtml(c)}</option>`).join('');
        select.value = currentVal;
    }

    function populateSupplierFilter(suppliers) {
        const select = document.getElementById('invSupplierFilter');
        const currentVal = select.value;
        select.innerHTML = '<option value="">All Suppliers</option>' +
            suppliers.map(s => `<option value="${s._key || s.id}">${app.escapeHtml(s.name)}</option>`).join('');
        select.value = currentVal;
    }

    function renderPagination(total, perPage, current) {
        const container = document.getElementById('inventoryPagination');
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        container.innerHTML = '';

        const prev = document.createElement('button');
        prev.className = 'page-btn';
        prev.innerHTML = '&lt;';
        prev.setAttribute('aria-label', 'Previous page');
        prev.disabled = current === 1;
        prev.onclick = () => { app.setInventoryPageNum(current - 1); render(); };
        container.appendChild(prev);

        const info = document.createElement('span');
        info.className = 'page-info';
        info.textContent = `Page ${current} of ${totalPages} (${total} items)`;
        container.appendChild(info);

        const next = document.createElement('button');
        next.className = 'page-btn';
        next.innerHTML = '&gt;';
        next.setAttribute('aria-label', 'Next page');
        next.disabled = current === totalPages;
        next.onclick = () => { app.setInventoryPageNum(current + 1); render(); };
        container.appendChild(next);
    }

    // ==========================================
    // ITEM CRUD (no SKU field)
    // ==========================================
    function addItem() {
        if (!Auth.can('canAddItem')) {
            app.showToast('You do not have permission to add items.', 'error');
            return;
        }
        document.getElementById('itemId').value = '';
        document.getElementById('itemModalTitle').textContent = 'Add Item';
        document.getElementById('itemForm').reset();
        populateItemSupplierDropdown();
        app.openModal('itemModal');
    }

    function editItem(id) {
        if (!Auth.can('canEditItem')) {
            app.showToast('You do not have permission to edit items.', 'error');
            return;
        }
        const items = app.getInventoryData();
        const item = items.find(i => (i._key || i.id) === id);
        if (!item) return;

        document.getElementById('itemId').value = id;
        document.getElementById('itemModalTitle').textContent = 'Edit Item';
        document.getElementById('itemName').value = item.name || '';
        document.getElementById('itemCategory').value = item.category || '';
        populateItemSupplierDropdown();
        document.getElementById('itemSupplier').value = item.supplierId || '';
        document.getElementById('itemUnit').value = item.unit || '';
        document.getElementById('itemCost').value = item.cost || '';
        document.getElementById('itemReorder').value = item.reorderLevel || 10;
        document.getElementById('itemDesc').value = item.desc || '';
        app.openModal('itemModal');
    }

    function saveItem() {
        if (!Auth.can('canAddItem') && !Auth.can('canEditItem')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const id = document.getElementById('itemId').value;
        const name = document.getElementById('itemName').value.trim();
        const category = document.getElementById('itemCategory').value;
        const supplierId = document.getElementById('itemSupplier').value;
        const unit = document.getElementById('itemUnit').value;
        const cost = parseFloat(document.getElementById('itemCost').value) || 0;
        const reorderLevel = parseInt(document.getElementById('itemReorder').value) || 10;
        const desc = document.getElementById('itemDesc').value.trim();

        if (!name || !category || !unit) {
            app.showToast('Please fill in all required fields (Name, Category, Unit).', 'error');
            return;
        }

        // Validation: item name must be unique
        const items = app.getInventoryData();
        const nameExists = items.some(i =>
            i.name.toLowerCase() === name.toLowerCase() &&
            (i._key || i.id) !== id
        );
        if (nameExists) {
            app.showToast('An item with this name already exists.', 'error');
            return;
        }

        const data = {
            name, category, supplierId, unit, cost, reorderLevel, desc,
            updatedAt: new Date().toISOString(),
            updatedBy: Auth.getUser()?.uid || ''
        };

        if (id) {
            // Update existing
            DB.inventory.update(id, data).then(() => {
                app.showToast('Item updated successfully', 'success');
                app.closeModal('itemModal');
            }).catch(err => {
                app.showToast('Failed to update item: ' + err.message, 'error');
            });
        } else {
            // Create new
            data.qtyWarehouse = 0;
            data.qtyBamban = 0;
            data.qtyCapas = 0;
            data.createdAt = new Date().toISOString();
            data.createdBy = Auth.getUser()?.uid || '';
            DB.inventory.create(data).then(() => {
                app.showToast('Item added successfully', 'success');
                app.closeModal('itemModal');
            }).catch(err => {
                app.showToast('Failed to add item: ' + err.message, 'error');
            });
        }
    }

    function confirmDelete(id, name) {
        if (!Auth.can('canDeleteItem')) {
            app.showToast('You do not have permission to delete items.', 'error');
            return;
        }
        if (confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
            DB.inventory.delete(id).then(() => {
                app.showToast('Item deleted', 'success');
            }).catch(err => {
                app.showToast('Failed to delete item: ' + err.message, 'error');
            });
        }
    }

    function populateItemSupplierDropdown() {
        const suppliers = app.getSuppliersData();
        const select = document.getElementById('itemSupplier');
        select.innerHTML = '<option value="">No Supplier</option>' +
            suppliers.map(s => `<option value="${s._key || s.id}">${app.escapeHtml(s.name)}</option>`).join('');
    }

    // ==========================================
    // POPULATE DROPDOWNS FOR STOCK OPERATIONS
    // ==========================================
    function populateDropdowns() {
        const items = app.getInventoryData();
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

        document.querySelectorAll('.receive-item-select').forEach(select => {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Select Item</option>' +
                sorted.map(i => `<option value="${i._key || i.id}" data-unit="${app.escapeHtml(i.unit)}">${app.escapeHtml(i.name)}</option>`).join('');
            select.value = currentVal;
        });

        // Populate supplier dropdown
        const suppliers = app.getSuppliersData();
        const suppSelect = document.getElementById('receiveSupplier');
        suppSelect.innerHTML = '<option value="">Select Supplier</option>' +
            suppliers.map(s => `<option value="${s._key || s.id}">${app.escapeHtml(s.name)}</option>`).join('');
    }

    function populateTransferDropdowns() {
        const items = app.getInventoryData();
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

        // Transfer item selects
        document.querySelectorAll('.transfer-item-select').forEach(select => {
            select.innerHTML = '<option value="">Select Item</option>' +
                sorted.map(i => `<option value="${i._key || i.id}">${app.escapeHtml(i.name)}</option>`).join('');
        });

        // Adjustment item select with qty data
        const adjSelect = document.getElementById('adjustItem');
        adjSelect.innerHTML = '<option value="">Select Item</option>' +
            sorted.map(i => `<option value="${i._key || i.id}" data-wh="${i.qtyWarehouse || 0}" data-ba="${i.qtyBamban || 0}" data-ca="${i.qtyCapas || 0}">${app.escapeHtml(i.name)}</option>`).join('');
    }

    // ==========================================
    // RECEIVE STOCK
    // ==========================================
    function addReceiveItem() {
        const container = document.getElementById('receiveItems');
        const rows = container.querySelectorAll('.receive-item-row');
        const newRow = document.createElement('div');
        newRow.className = 'receive-item-row';
        newRow.dataset.index = rows.length;
        newRow.innerHTML = `
            <div class="form-group item-select-group">
                <label class="form-label">Item</label>
                <select class="form-select receive-item-select" required>
                    <option value="">Select Item</option>
                </select>
            </div>
            <div class="form-group qty-group">
                <label class="form-label">Quantity</label>
                <input type="number" class="form-input receive-qty" min="1" placeholder="0" required>
            </div>
            <div class="form-group price-group">
                <label class="form-label">Unit Cost (${app.getSettingsData().currency || '\u20B1'})</label>
                <input type="number" class="form-input receive-price" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group branch-group">
                <label class="form-label">Destination</label>
                <select class="form-select receive-branch" required>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Bamban">Bamban Branch</option>
                    <option value="Capas">Capas Branch</option>
                </select>
            </div>
            <button type="button" class="btn-icon remove-item" onclick="InventoryModule.removeReceiveItem(this)" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        container.appendChild(newRow);
        populateDropdowns();

        if (container.querySelectorAll('.receive-item-row').length > 1) {
            container.querySelectorAll('.remove-item').forEach(btn => btn.style.display = '');
        }
    }

    function removeReceiveItem(btn) {
        const container = document.getElementById('receiveItems');
        const rows = container.querySelectorAll('.receive-item-row');
        if (rows.length <= 1) return;
        btn.closest('.receive-item-row').remove();
        if (container.querySelectorAll('.receive-item-row').length <= 1) {
            container.querySelectorAll('.remove-item').forEach(b => b.style.display = 'none');
        }
    }

    function submitReceive() {
        if (!Auth.can('canReceiveStock')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const refNum = document.getElementById('receiveRef').value;
        const date = document.getElementById('receiveDate').value;
        const supplierId = document.getElementById('receiveSupplier').value;
        const notes = document.getElementById('receiveNotes').value;

        if (!date || !supplierId) {
            app.showToast('Please fill in all required fields', 'error');
            return;
        }

        const rows = document.querySelectorAll('#receiveItems .receive-item-row');
        const received = [];
        let hasError = false;

        rows.forEach(row => {
            const itemId = row.querySelector('.receive-item-select').value;
            const qty = parseInt(row.querySelector('.receive-qty').value);
            const cost = parseFloat(row.querySelector('.receive-price').value) || 0;
            const branch = row.querySelector('.receive-branch').value;

            if (!itemId || !qty || qty < 1) {
                hasError = true;
                return;
            }
            received.push({ itemId, qty, cost, branch });
        });

        if (hasError || received.length === 0) {
            app.showToast('Please fill in all item details', 'error');
            return;
        }

        const supplierName = app.getSupplierName(supplierId);
        const items = app.getInventoryData();
        const branchField = { Warehouse: 'qtyWarehouse', Bamban: 'qtyBamban', Capas: 'qtyCapas' };

        // Process each received item
        const promises = [];
        received.forEach(r => {
            const item = items.find(i => (i._key || i.id) === r.itemId);
            if (!item) return;

            const field = branchField[r.branch];

            // Atomically add to the destination quantity. Non-quantity updates
            // and transaction log tracking now follow sequentially under structural execution.
            const meta = { updatedAt: new Date().toISOString() };
            if (r.cost > 0) meta.cost = r.cost;

            const receiveSequence = DB.inventory.adjustQty(r.itemId, field, r.qty, { allowNegative: true })
                .then(() => {
                    return Promise.all([
                        DB.inventory.update(r.itemId, meta),
                        DB.transactions.create({
                            date,
                            time: app.nowTimeStr(),
                            type: 'Receive',
                            itemId: r.itemId,
                            itemName: item.name,
                            qty: r.qty,
                            unit: item.unit,
                            to: r.branch,
                            supplierId,
                            supplierName,
                            refNum,
                            user: Auth.getDisplayName(),
                            userId: Auth.getUser()?.uid || '',
                            notes,
                            unitCost: r.cost || item.cost || 0
                        })
                    ]);
                });

            promises.push(receiveSequence);
        });

        Promise.all(promises).then(() => {
            app.showToast(`Received ${received.length} item(s) successfully`, 'success');
            // Reset form
            document.getElementById('receiveForm').reset();
            document.getElementById('receiveDate').value = app.todayStr();
            app.updateRefNumbers();
            document.getElementById('receiveItems').innerHTML = createFirstReceiveRowHTML();
            populateDropdowns();
        }).catch(err => {
            app.showToast('Error recording receipt: ' + err.message, 'error');
        });
    }

    function createFirstReceiveRowHTML() {
        return `<div class="receive-item-row" data-index="0">
            <div class="form-group item-select-group">
                <label class="form-label">Item</label>
                <select class="form-select receive-item-select" required>
                    <option value="">Select Item</option>
                </select>
            </div>
            <div class="form-group qty-group">
                <label class="form-label">Quantity</label>
                <input type="number" class="form-input receive-qty" min="1" placeholder="0" required>
            </div>
            <div class="form-group price-group">
                <label class="form-label">Unit Cost</label>
                <input type="number" class="form-input receive-price" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="form-group branch-group">
                <label class="form-label">Destination</label>
                <select class="form-select receive-branch" required>
                    <option value="Warehouse">Warehouse</option>
                    <option value="Bamban">Bamban Branch</option>
                    <option value="Capas">Capas Branch</option>
                </select>
            </div>
            <button type="button" class="btn-icon remove-item" onclick="InventoryModule.removeReceiveItem(this)" style="display:none;" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>`;
    }

    // ==========================================
    // TRANSFER STOCK
    // ==========================================
    function addTransferItem() {
        const container = document.getElementById('transferItems');
        const items = app.getInventoryData();
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

        const newRow = document.createElement('div');
        newRow.className = 'receive-item-row';
        newRow.style.cssText = 'grid-template-columns: 2fr 1fr auto; gap: 12px;';
        newRow.innerHTML = `
            <div class="form-group item-select-group">
                <label class="form-label">Item</label>
                <select class="form-select transfer-item-select" required>
                    <option value="">Select Item</option>
                    ${sorted.map(i => `<option value="${i._key || i.id}">${app.escapeHtml(i.name)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group qty-group">
                <label class="form-label">Quantity</label>
                <input type="number" class="form-input transfer-qty" min="1" placeholder="0" required>
            </div>
            <button type="button" class="btn-icon remove-item" onclick="InventoryModule.removeTransferItem(this)" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        container.appendChild(newRow);

        if (container.querySelectorAll('.receive-item-row').length > 1) {
            container.querySelectorAll('.remove-item').forEach(btn => btn.style.display = '');
        }
    }

    function removeTransferItem(btn) {
        const container = document.getElementById('transferItems');
        const rows = container.querySelectorAll('.receive-item-row');
        if (rows.length <= 1) return;
        btn.closest('.receive-item-row').remove();
        if (container.querySelectorAll('.receive-item-row').length <= 1) {
            container.querySelectorAll('.remove-item').forEach(b => b.style.display = 'none');
        }
    }

    function submitTransfer() {
        if (!Auth.can('canTransferStock')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const refNum = document.getElementById('transferRef').value;
        const date = document.getElementById('transferDate').value;
        const from = document.getElementById('transferFrom').value;
        const to = document.getElementById('transferTo').value;
        const notes = document.getElementById('transferNotes').value;

        if (!date || !from || !to) {
            app.showToast('Please fill in all required fields', 'error');
            return;
        }
        if (from === to) {
            app.showToast('Source and destination cannot be the same', 'error');
            return;
        }

        const rows = document.querySelectorAll('#transferItems .receive-item-row');
        const transfers = [];
        let hasError = false;

        rows.forEach(row => {
            const itemId = row.querySelector('.transfer-item-select').value;
            const qty = parseInt(row.querySelector('.transfer-qty').value);
            if (!itemId || !qty || qty < 1) {
                hasError = true;
                return;
            }
            transfers.push({ itemId, qty });
        });

        if (hasError || transfers.length === 0) {
            app.showToast('Please fill in all item details', 'error');
            return;
        }

        const items = app.getInventoryData();

        // Validate quantities
        for (const t of transfers) {
            const item = items.find(i => (i._key || i.id) === t.itemId);
            if (!item) continue;
            let fromQty = 0;
            if (from === 'Warehouse') fromQty = item.qtyWarehouse || 0;
            else if (from === 'Bamban') fromQty = item.qtyBamban || 0;
            else if (from === 'Capas') fromQty = item.qtyCapas || 0;
            if (t.qty > fromQty) {
                app.showToast(`Insufficient stock for ${item.name} at ${from}`, 'error');
                return;
            }
        }

        // Process transfers
        const branchField = { Warehouse: 'qtyWarehouse', Bamban: 'qtyBamban', Capas: 'qtyCapas' };
        const promises = [];
        transfers.forEach(t => {
            const item = items.find(i => (i._key || i.id) === t.itemId);
            if (!item) return;

            const fromField = branchField[from];
            const toField = branchField[to];

            // FIXED: Metadata and log writing are securely locked down inside 
            // a sequential .then() promise chain, executing only after the 
            // atomic resource adjustments verify balance deduction availability.
            const transferSequence = DB.inventory.adjustQty(t.itemId, fromField, -t.qty)
                .then(() => DB.inventory.adjustQty(t.itemId, toField, t.qty, { allowNegative: true }))
                .then(() => {
                    return Promise.all([
                        DB.inventory.update(t.itemId, { updatedAt: new Date().toISOString() }),
                        DB.transactions.create({
                            date,
                            time: app.nowTimeStr(),
                            type: 'Transfer',
                            itemId: t.itemId,
                            itemName: item.name,
                            qty: t.qty,
                            unit: item.unit,
                            from,
                            to,
                            refNum,
                            user: Auth.getDisplayName(),
                            userId: Auth.getUser()?.uid || '',
                            notes,
                            unitCost: item.cost || 0
                        })
                    ]);
                });

            promises.push(transferSequence);
        });

        Promise.all(promises).then(() => {
            app.showToast(`Transferred ${transfers.length} item(s) from ${from} to ${to}`, 'success');
            document.getElementById('transferForm').reset();
            document.getElementById('transferDate').value = app.todayStr();
            app.updateRefNumbers();
            document.getElementById('transferItems').innerHTML = createFirstTransferRowHTML();
            populateTransferDropdowns();
        }).catch(err => {
            const msg = err.aborted
                ? 'Transfer failed: stock changed before this could complete (insufficient quantity). Please review and try again.'
                : 'Error recording transfer: ' + err.message;
            app.showToast(msg, 'error');
        });
    }

    function createFirstTransferRowHTML() {
        const items = app.getInventoryData();
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
        return `<div class="receive-item-row" data-index="0" style="grid-template-columns: 2fr 1fr auto; gap: 12px;">
            <div class="form-group item-select-group">
                <label class="form-label">Item</label>
                <select class="form-select transfer-item-select" required>
                    <option value="">Select Item</option>
                    ${sorted.map(i => `<option value="${i._key || i.id}">${app.escapeHtml(i.name)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group qty-group">
                <label class="form-label">Quantity</label>
                <input type="number" class="form-input transfer-qty" min="1" placeholder="0" required>
            </div>
            <button type="button" class="btn-icon remove-item" onclick="InventoryModule.removeTransferItem(this)" style="display:none;" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>`;
    }

    // ==========================================
    // STOCK ADJUSTMENT
    // ==========================================
    function updateAdjustCurrentQty() {
        const itemId = document.getElementById('adjustItem').value;
        const location = document.getElementById('adjustLocation').value;
        const items = app.getInventoryData();
        const item = items.find(i => (i._key || i.id) === itemId);
        const display = document.getElementById('adjustCurrentQty');
        if (!item || !location) {
            display.value = '-';
            return;
        }
        let qty = 0;
        if (location === 'Warehouse') qty = item.qtyWarehouse || 0;
        else if (location === 'Bamban') qty = item.qtyBamban || 0;
        else if (location === 'Capas') qty = item.qtyCapas || 0;
        display.value = `${qty} ${item.unit}`;
    }

    function submitAdjustment() {
        if (!Auth.can('canAdjustStock')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const refNum = document.getElementById('adjustRef').value;
        const date = document.getElementById('adjustDate').value;
        const location = document.getElementById('adjustLocation').value;
        const itemId = document.getElementById('adjustItem').value;
        const type = document.getElementById('adjustType').value;
        const qty = parseInt(document.getElementById('adjustQty').value);
        const notes = document.getElementById('adjustNotes').value;

        if (!date || !location || !itemId || !type || !qty || qty < 1 || !notes) {
            app.showToast('Please fill in all required fields', 'error');
            return;
        }

        const items = app.getInventoryData();
        const item = items.find(i => (i._key || i.id) === itemId);
        if (!item) {
            app.showToast('Item not found', 'error');
            return;
        }

        // Quick verification using the local snapshot value cache
        let currentQty = 0;
        if (location === 'Warehouse') currentQty = item.qtyWarehouse || 0;
        else if (location === 'Bamban') currentQty = item.qtyBamban || 0;
        else if (location === 'Capas') currentQty = item.qtyCapas || 0;

        if (qty > currentQty) {
            app.showToast('Adjustment quantity exceeds current stock', 'error');
            return;
        }

        const branchField = { Warehouse: 'qtyWarehouse', Bamban: 'qtyBamban', Capas: 'qtyCapas' };
        const field = branchField[location];

        // FIXED: Rebuilt promise structure into sequential order to protect transaction processing 
        // patterns. Metadata updates and ledger log items write ONLY after the structural atomic balance operation passes.
        DB.inventory.adjustQty(itemId, field, -qty)
            .then(() => {
                return Promise.all([
                    DB.inventory.update(itemId, { updatedAt: new Date().toISOString() }),
                    DB.transactions.create({
                        date,
                        time: app.nowTimeStr(),
                        type,
                        itemId,
                        itemName: item.name,
                        qty,
                        unit: item.unit,
                        from: location,
                        refNum,
                        reason: notes,
                        user: Auth.getDisplayName(),
                        userId: Auth.getUser()?.uid || '',
                        notes,
                        unitCost: item.cost || 0
                    })
                ]);
            })
            .then(() => {
                app.showToast(`${type} recorded: ${qty} ${item.unit} of ${item.name}`, 'success');
                document.getElementById('adjustForm').reset();
                document.getElementById('adjustDate').value = app.todayStr();
                document.getElementById('adjustCurrentQty').value = '-';
                app.updateRefNumbers();
            })
            .catch(err => {
                const msg = err.aborted
                    ? 'Adjustment failed: stock changed before this could complete (insufficient quantity). Please review and try again.'
                    : 'Error recording adjustment: ' + err.message;
                app.showToast(msg, 'error');
            });
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        render,
        addItem,
        editItem,
        saveItem,
        confirmDelete,
        populateDropdowns,
        populateTransferDropdowns,
        addReceiveItem,
        removeReceiveItem,
        submitReceive,
        addTransferItem,
        removeTransferItem,
        submitTransfer,
        updateAdjustCurrentQty,
        submitAdjustment
    };
})();
