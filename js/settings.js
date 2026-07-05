/* =============================================
   AKASYA COFFEE - SETTINGS MODULE
   Business settings and data management
   ============================================= */

const SettingsModule = (function() {
    'use strict';

    // ==========================================
    // RENDER SETTINGS PAGE
    // ==========================================
    function render() {
        const settings = app.getSettingsData();
        document.getElementById('settingBusinessName').value = settings.businessName || 'Akasya Coffee';
        document.getElementById('settingWarehouseName').value = settings.warehouseName || 'Main Warehouse';
        document.getElementById('settingCurrency').value = settings.currency || '\u20B1';
        document.getElementById('settingReorderLevel').value = settings.reorderLevel || 10;

        // Theme
        const theme = settings.theme || 'light';
        document.querySelectorAll('input[name="theme"]').forEach(r => {
            r.checked = r.value === theme;
            r.closest('.theme-option').classList.toggle('active', r.value === theme);
        });

        // System info
        const items = app.getInventoryData();
        const suppliers = app.getSuppliersData();
        const transactions = app.getTransactionsData();
        const recipes = app.getRecipesData();

        document.getElementById('sysTotalItems').textContent = items.length;
        document.getElementById('sysTotalSuppliers').textContent = suppliers.length;
        document.getElementById('sysTotalTransactions').textContent = transactions.length;
        document.getElementById('sysTotalRecipes').textContent = recipes.length;
    }

    // ==========================================
    // SAVE SETTINGS
    // ==========================================
    function save() {
        if (!Auth.can('canEditSettings')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const settings = {
            businessName: document.getElementById('settingBusinessName').value.trim() || 'Akasya Coffee',
            warehouseName: document.getElementById('settingWarehouseName').value.trim() || 'Main Warehouse',
            currency: document.getElementById('settingCurrency').value,
            reorderLevel: parseInt(document.getElementById('settingReorderLevel').value) || 10,
            theme: document.querySelector('input[name="theme"]:checked')?.value || 'light'
        };

        DB.settings.save(settings).then(() => {
            app.showToast('Settings saved', 'success');
            // Apply theme immediately
            if (settings.theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        }).catch(err => {
            app.showToast('Failed to save settings: ' + err.message, 'error');
        });
    }

    // ==========================================
    // DATA MANAGEMENT
    // ==========================================
    function backupData() {
        const data = {
            inventory: app.getInventoryData(),
            suppliers: app.getSuppliersData(),
            transactions: app.getTransactionsData(),
            recipes: app.getRecipesData(),
            settings: app.getSettingsData(),
            exportDate: new Date().toISOString(),
            version: '3.0.0'
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `akasya_backup_${app.todayStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        app.showToast('Backup downloaded', 'success');
    }

    function importData(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                const promises = [];
                if (data.inventory) {
                    // Clear existing and import
                    promises.push(DB.write('inventory', arrayToObject(data.inventory)));
                }
                if (data.suppliers) {
                    promises.push(DB.write('suppliers', arrayToObject(data.suppliers)));
                }
                if (data.transactions) {
                    promises.push(DB.write('transactions', arrayToObject(data.transactions)));
                }
                if (data.recipes) {
                    promises.push(DB.write('recipes', arrayToObject(data.recipes)));
                }
                if (data.settings) {
                    promises.push(DB.settings.save(data.settings));
                }
                Promise.all(promises).then(() => {
                    app.showToast('Data imported successfully', 'success');
                }).catch(err => {
                    app.showToast('Import error: ' + err.message, 'error');
                });
            } catch(err) {
                app.showToast('Invalid backup file', 'error');
            }
        };
        reader.readAsText(file);
        input.value = '';
    }

    /**
     * Convert array to object keyed by _key or id (for Firebase RTDB format)
     */
    function arrayToObject(arr) {
        const obj = {};
        arr.forEach(item => {
            const key = item._key || item.id || app.genId();
            obj[key] = item;
            delete obj[key]._key; // Clean up
        });
        return obj;
    }

    function exportData() {
        backupData();
    }

    function importInventory() {
        document.getElementById('importFileInput').click();
    }

    function resetData() {
        if (!Auth.can('canReset')) {
            app.showToast('Permission denied.', 'error');
            return;
        }
        if (confirm('This will erase ALL inventory data. This cannot be undone! Are you sure?')) {
            app.showLoading('Clearing data...');
            Promise.all([
                DB.remove('inventory'),
                DB.remove('suppliers'),
                DB.remove('transactions'),
                DB.remove('recipes'),
                DB.remove('settings')
            ]).then(() => {
                // Re-save default settings
                return DB.settings.save({
                    businessName: 'Akasya Coffee',
                    warehouseName: 'Main Warehouse',
                    currency: '\u20B1',
                    reorderLevel: 10,
                    theme: 'light'
                });
            }).then(() => {
                app.hideLoading();
                app.showToast('All data cleared. Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);
            }).catch(err => {
                app.hideLoading();
                app.showToast('Error clearing data: ' + err.message, 'error');
            });
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        render,
        save,
        backupData,
        importData,
        exportData,
        importInventory,
        resetData
    };
})();
