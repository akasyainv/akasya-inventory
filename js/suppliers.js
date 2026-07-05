/* =============================================
   AKASYA COFFEE - SUPPLIERS MODULE
   Supplier management and rendering
   ============================================= */

const SuppliersModule = (function() {
    'use strict';

    function render(search) {
        const suppliers = app.getSuppliersData();
        let filtered = suppliers;

        if (search) {
            filtered = suppliers.filter(s =>
                (s.name || '').toLowerCase().includes(search) ||
                (s.contact || '').toLowerCase().includes(search) ||
                (s.phone || '').toLowerCase().includes(search) ||
                (s.email || '').toLowerCase().includes(search)
            );
        }

        const tbody = document.getElementById('suppliersTableBody');
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><p>No suppliers found</p></td></tr>';
        } else {
            tbody.innerHTML = filtered.map(s => {
                let actions = '';
                if (Auth.can('canEditSupplier')) {
                    actions += '<button class="btn-icon" onclick="SuppliersModule.editSupplier(\'' + (s._key || s.id) + '\')" title="Edit supplier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>';
                }
                if (Auth.can('canDeleteSupplier')) {
                    actions += '<button class="btn-icon" onclick="SuppliersModule.confirmDelete(\'' + (s._key || s.id) + '\', \'' + app.escapeHtml(s.name) + '\')" title="Delete supplier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>';
                }
                if (!actions) actions = '<span style="color:var(--text-muted);font-size:11px">View only</span>';

                return '<tr>' +
                    '<td><strong>' + app.escapeHtml(s.name) + '</strong></td>' +
                    '<td>' + app.escapeHtml(s.contact || '-') + '</td>' +
                    '<td>' + app.escapeHtml(s.phone || '-') + '</td>' +
                    '<td>' + app.escapeHtml(s.email || '-') + '</td>' +
                    '<td>' + app.escapeHtml(s.address || '-') + '</td>' +
                    '<td>' + app.escapeHtml(s.products || '-') + '</td>' +
                    '<td>' + (s.leadTime || '-') + ' days</td>' +
                    '<td>' + app.escapeHtml(s.payment || '-') + '</td>' +
                    '<td><div class="table-actions">' + actions + '</div></td>' +
                '</tr>';
            }).join('');
        }
    }

    function addSupplier() {
        if (!Auth.can('canAddSupplier')) {
            app.showToast('You do not have permission to add suppliers.', 'error');
            return;
        }
        document.getElementById('supplierId').value = '';
        document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
        document.getElementById('supplierForm').reset();
        app.openModal('supplierModal');
    }

    function editSupplier(id) {
        if (!Auth.can('canEditSupplier')) {
            app.showToast('You do not have permission to edit suppliers.', 'error');
            return;
        }
        const suppliers = app.getSuppliersData();
        const s = suppliers.find(s => (s._key || s.id) === id);
        if (!s) return;

        document.getElementById('supplierId').value = id;
        document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
        document.getElementById('supplierName').value = s.name || '';
        document.getElementById('supplierContact').value = s.contact || '';
        document.getElementById('supplierPhone').value = s.phone || '';
        document.getElementById('supplierEmail').value = s.email || '';
        document.getElementById('supplierAddress').value = s.address || '';
        document.getElementById('supplierLeadTime').value = s.leadTime || 7;
        document.getElementById('supplierPayment').value = s.payment || 'Net 30';
        document.getElementById('supplierProducts').value = s.products || '';
        app.openModal('supplierModal');
    }

    function saveSupplier() {
        if (!Auth.can('canAddSupplier') && !Auth.can('canEditSupplier')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const id = document.getElementById('supplierId').value;
        const name = document.getElementById('supplierName').value.trim();

        if (!name) {
            app.showToast('Supplier name is required', 'error');
            return;
        }

        const suppliers = app.getSuppliersData();
        const nameExists = suppliers.some(s =>
            s.name.toLowerCase() === name.toLowerCase() &&
            (s._key || s.id) !== id
        );
        if (nameExists) {
            app.showToast('A supplier with this name already exists.', 'error');
            return;
        }

        const data = {
            name,
            contact: document.getElementById('supplierContact').value.trim(),
            phone: document.getElementById('supplierPhone').value.trim(),
            email: document.getElementById('supplierEmail').value.trim(),
            address: document.getElementById('supplierAddress').value.trim(),
            leadTime: parseInt(document.getElementById('supplierLeadTime').value) || 7,
            payment: document.getElementById('supplierPayment').value,
            products: document.getElementById('supplierProducts').value.trim(),
            updatedAt: new Date().toISOString()
        };

        if (id) {
            DB.suppliers.update(id, data).then(() => {
                app.showToast('Supplier updated', 'success');
                app.closeModal('supplierModal');
            }).catch(err => {
                app.showToast('Failed to update supplier: ' + err.message, 'error');
            });
        } else {
            data.createdAt = new Date().toISOString();
            DB.suppliers.create(data).then(() => {
                app.showToast('Supplier added', 'success');
                app.closeModal('supplierModal');
            }).catch(err => {
                app.showToast('Failed to add supplier: ' + err.message, 'error');
            });
        }
    }

    function confirmDelete(id, name) {
        if (!Auth.can('canDeleteSupplier')) {
            app.showToast('Permission denied.', 'error');
            return;
        }
        if (confirm('Delete supplier "' + name + '"?')) {
            DB.suppliers.delete(id).then(() => {
                app.showToast('Supplier deleted', 'success');
            }).catch(err => {
                app.showToast('Failed to delete: ' + err.message, 'error');
            });
        }
    }

    return {
        render,
        addSupplier,
        editSupplier,
        saveSupplier,
        confirmDelete
    };
})();
