/* =============================================
   AKASYA COFFEE - MAIN APPLICATION MODULE
   Navigation, UI utilities, and app orchestration
   ============================================= */

const app = (function() {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let currentPage = 'dashboard';
    let inventorySort = { field: 'name', dir: 'asc' };
    let inventoryFilter = { search: '', category: '', supplier: '', status: '' };
    let inventoryPageNum = 1;
    const inventoryPerPage = 15;

    // Cache for real-time data
    let _inventoryData = [];
    let _suppliersData = [];
    let _transactionsData = [];
    let _recipesData = [];
    let _settingsData = {};

    // Unsubscribe functions for real-time listeners
    let _unsubInventory = null;
    let _unsubSuppliers = null;
    let _unsubTransactions = null;
    let _unsubRecipes = null;
    let _unsubSettings = null;

    // ==========================================
    // UTILITY FUNCTIONS (exposed to all modules)
    // ==========================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        const currency = (_settingsData && _settingsData.currency) || '\u20B1';
        return currency + (amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function todayStr() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function nowTimeStr() {
        const d = new Date();
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function getStatus(item) {
        if (!item) return 'Healthy';
        const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
        const reorder = item.reorderLevel || _settingsData.reorderLevel || 10;
        if (total <= 0) return 'Critical';
        if (total <= reorder * 0.5) return 'Critical';
        if (total <= reorder) return 'Low';
        return 'Healthy';
    }

    function getSupplierName(supplierId) {
        if (!supplierId) return '-';
        const s = _suppliersData.find(s => (s._key || s.id) === supplierId);
        return s ? s.name : '-';
    }

    function debounce(fn, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ==========================================
    // THEME SYSTEM
    // ==========================================

    function getStoredThemePreference() {
        try {
            return localStorage.getItem('akasya-theme');
        } catch (e) { return null; }
    }

    function setThemePreference(theme) {
        try {
            localStorage.setItem('akasya-theme', theme);
        } catch (e) {}
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            const isDark = theme === 'dark';
            btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setThemePreference(next);
    }

    // ==========================================
    // TOAST NOTIFICATIONS
    // ==========================================

    function showToast(message, type) {
        type = type || 'info';
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.setAttribute('role', 'alert');

        const icons = {
            success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
            info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };

        toast.innerHTML = icons[type] + '<span>' + escapeHtml(message) + '</span>';
        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ==========================================
    // MODAL SYSTEM
    // ==========================================

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // ==========================================
    // LOADING OVERLAY
    // ==========================================

    function showLoading(message) {
        let overlay = document.getElementById('loadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text"></div>';
            document.body.appendChild(overlay);
        }
        overlay.querySelector('.loading-text').textContent = message || 'Loading...';
        overlay.classList.add('active');
    }

    function hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    // ==========================================
    // REFERENCE NUMBERS
    // ==========================================

    function updateRefNumbers() {
        const prefix = 'AKS-' + todayStr().replace(/-/g, '') + '-';
        const random = Math.floor(1000 + Math.random() * 9000);
        const ref = prefix + random;

        const receiveRef = document.getElementById('receiveRef');
        const transferRef = document.getElementById('transferRef');
        const adjustRef = document.getElementById('adjustRef');

        if (receiveRef) receiveRef.value = 'RCV-' + ref;
        if (transferRef) transferRef.value = 'TRF-' + ref;
        if (adjustRef) adjustRef.value = 'ADJ-' + ref;
    }

    // ==========================================
    // CSV DOWNLOAD
    // ==========================================

    function downloadCSV(headers, rows, filename) {
        const csv = [headers.join(','), ...rows.map(r =>
            r.map(cell => {
                const str = String(cell || '').replace(/"/g, '""');
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str + '"';
                }
                return str;
            }).join(',')
        )].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // DATA ACCESSORS (for modules)
    // ==========================================

    function getInventoryData() { return _inventoryData; }
    function getSuppliersData() { return _suppliersData; }
    function getTransactionsData() { return _transactionsData; }
    function getRecipesData() { return _recipesData; }
    function getSettingsData() { return _settingsData; }
    function getInventoryFilter() { return inventoryFilter; }
    function getInventorySort() { return inventorySort; }
    function getInventoryPageNum() { return inventoryPageNum; }
    function getInventoryPerPage() { return inventoryPerPage; }
    function setInventoryPageNum(n) { inventoryPageNum = n; }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    function init() {
        // Apply saved theme immediately (before Firebase loads)
        const savedTheme = getStoredThemePreference();
        if (savedTheme) {
            applyTheme(savedTheme);
        }

        // Step 1: Initialize Firebase
        const dbReady = DB.init();

        if (!dbReady) {
            showFirebaseConfigScreen();
            return;
        }

        // Step 2: Set up auth state listener
        // Use a small delay to let Firebase auth state settle
        setTimeout(() => {
            Auth.init().then(firebaseUser => {
                if (firebaseUser) {
                    // User is logged in - verify they're active
                    const profile = Auth.getProfile();
                    if (!profile || profile.isActive !== true) {
    console.log("Redirecting to login...");
    Auth.logout();
    showLoginScreen();
    return;
}

    function checkFirstTimeSetup() {
        Auth.checkAdminExists().then(adminExists => {
            if (adminExists) {
                showLoginScreen();
            } else {
                showSetupScreen();
            }
        }).catch(() => {
            showLoginScreen();
        });
    }

    function setupApp() {
        showAppScreen();
        setupRealTimeListeners();
        setupEventListeners();
        updateUserDisplay();
        applyRoleBasedUI();
        navigate('dashboard');
    }

    // ==========================================
    // REAL-TIME DATA LISTENERS
    // ==========================================

    function setupRealTimeListeners() {
        _unsubInventory = DB.inventory.getAll(data => {
            _inventoryData = data || [];
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'branches') renderBranches();
            if (currentPage === 'receive') InventoryModule.populateDropdowns();
            if (currentPage === 'transfer') InventoryModule.populateTransferDropdowns();
            if (currentPage === 'recipes') RecipesModule.populateDropdowns();
        });

        _unsubSuppliers = DB.suppliers.getAll(data => {
            _suppliersData = data || [];
            if (currentPage === 'suppliers') SuppliersModule.render();
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
        });

        _unsubTransactions = DB.transactions.getAll(data => {
            _transactionsData = data || [];
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'receive') renderRecentDeliveries();
            if (currentPage === 'transfer') renderTransferHistory();
            if (currentPage === 'reports') ReportsModule.render();
        });

        _unsubRecipes = DB.recipes.getAll(data => {
            _recipesData = data || [];
            if (currentPage === 'recipes') RecipesModule.render();
        });

        _unsubSettings = DB.settings.get(data => {
            _settingsData = data || {};
            // Personal theme preference always overrides business default
            const personal = getStoredThemePreference();
            applyTheme(personal || _settingsData.theme || 'light');
            if (currentPage === 'settings') SettingsModule.render();
        });
    }

    // ==========================================
    // AUTHENTICATION UI SCREENS
    // ==========================================

    function showLoginScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    function showSetupScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    function showAppScreen() {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = '';
        document.body.style.overflow = '';
    }

    function showFirebaseConfigScreen() {
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('setupContainer').style.display = 'none';
        document.getElementById('configContainer').style.display = 'flex';
        document.body.style.overflow = '';
    }

    // ==========================================
    // LOGIN HANDLERS
    // ==========================================

    function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginBtn');
        const errorEl = document.getElementById('loginError');

        if (!email || !password) {
            errorEl.textContent = 'Please enter both email and password.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Signing in...';
        errorEl.textContent = '';

        Auth.login(email, password)
            .then(() => {
                setupApp();
                document.getElementById('loginForm').reset();
            })
            .catch(err => {
                let msg = 'Login failed. Please try again.';
                if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
                if (err.code === 'auth/wrong-password') msg = 'Incorrect password.';
                if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
                if (err.code === 'auth/invalid-credential') msg = 'Invalid email or password.';
                if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please try again later.';
                if (err.code === 'auth/user-disabled') msg = 'This account has been disabled.';
                errorEl.textContent = msg;
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            });
    }

    function handleSetup(e) {
        e.preventDefault();
        const displayName = document.getElementById('setupName').value.trim();
        const email = document.getElementById('setupEmail').value.trim();
        const password = document.getElementById('setupPassword').value;
        const confirmPassword = document.getElementById('setupConfirmPassword').value;
        const btn = document.getElementById('setupBtn');
        const errorEl = document.getElementById('setupError');

        if (!displayName || !email || !password) {
            errorEl.textContent = 'Please fill in all fields.';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters.';
            return;
        }
        if (password !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating Account...';
        errorEl.textContent = '';

        Auth.createFirstAdmin(email, password, displayName)
            .then(() => {
                return DB.settings.save({
                    businessName: 'Akasya Coffee',
                    warehouseName: 'Main Warehouse',
                    currency: '\u20B1',
                    reorderLevel: 10,
                    theme: 'light'
                });
            })
            .then(() => {
                setupApp();
                showToast('Welcome, Admin! Your account has been created.', 'success');
                document.getElementById('setupForm').reset();
            })
            .catch(err => {
                let msg = 'Failed to create account. Please try again.';
                if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
                if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
                if (err.code === 'auth/weak-password') msg = 'Password is too weak.';
                errorEl.textContent = msg;
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Create Admin Account';
            });
    }

    function handleLogout() {
        showLoading('Signing out...');
        DB.detachAllListeners();
        _unsubInventory = null;
        _unsubSuppliers = null;
        _unsubTransactions = null;
        _unsubRecipes = null;
        _unsubSettings = null;

        Auth.logout().then(() => {
            hideLoading();
            showLoginScreen();
            document.getElementById('loginForm').reset();
            document.getElementById('loginError').textContent = '';
        }).catch(() => {
            hideLoading();
            showLoginScreen();
        });
    }

    // ==========================================
    // USER DISPLAY
    // ==========================================

    function updateUserDisplay() {
        const avatarEl = document.getElementById('userAvatar');
        const nameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');

        if (avatarEl) avatarEl.textContent = Auth.getAvatarText();
        if (nameEl) nameEl.textContent = Auth.getDisplayName();
        if (roleEl) roleEl.textContent = Auth.getRoleLabel();
    }

    // ==========================================
    // ROLE-BASED UI
    // ==========================================

    function applyRoleBasedUI() {
        const allowedPages = Auth.getAllowedPages();

        // Show/hide nav links based on role
        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            const page = link.dataset.page;
            if (allowedPages.includes(page)) {
                link.style.display = '';
            } else {
                link.style.display = 'none';
            }
        });

        // Hide nav sections that have no visible links
        document.querySelectorAll('.nav-section').forEach(section => {
            const visibleLinks = section.querySelectorAll('.nav-link:not([style*="display: none"])');
            section.style.display = visibleLinks.length > 0 ? '' : 'none';
        });

        // Hide action buttons based on permissions
        const inventoryActions = document.getElementById('inventoryActions');
        if (inventoryActions) inventoryActions.style.display = Auth.can('canAddItem') ? '' : 'none';

        const supplierActions = document.getElementById('supplierActions');
        if (supplierActions) supplierActions.style.display = Auth.can('canAddSupplier') ? '' : 'none';

        const recipeActions = document.getElementById('recipeActions');
        if (recipeActions) recipeActions.style.display = Auth.can('canAddRecipe') ? '' : 'none';

        const reportActions = document.getElementById('reportActions');
        if (reportActions) reportActions.style.display = Auth.can('canExport') ? '' : 'none';

        const dashReceiveBtn = document.getElementById('dashReceiveBtn');
        if (dashReceiveBtn) dashReceiveBtn.style.display = Auth.can('canReceiveStock') ? '' : 'none';
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    function navigate(page) {
        if (!Auth.canAccessPage(page)) {
            showToast('You do not have permission to access this page.', 'error');
            return;
        }

        currentPage = page;

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const pageEl = document.getElementById(page + 'Page');
        if (pageEl) pageEl.classList.add('active');

        const navLink = document.querySelector('.nav-link[data-page="' + page + '"]');
        if (navLink) navLink.classList.add('active');

        const titles = {
            dashboard: 'Dashboard',
            inventory: 'Inventory',
            receive: 'Receive Stock',
            transfer: 'Transfer Stock',
            suppliers: 'Suppliers',
            branches: 'Branches',
            recipes: 'Recipe / BOM',
            reports: 'Reports',
            settings: 'Settings',
            users: 'User Management'
        };
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = titles[page] || page;

        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');

        switch(page) {
            case 'dashboard': renderDashboard(); break;
            case 'inventory': InventoryModule.render(); break;
            case 'receive': renderReceive(); break;
            case 'transfer': renderTransfer(); break;
            case 'suppliers': SuppliersModule.render(); break;
            case 'branches': renderBranches(); break;
            case 'recipes': RecipesModule.render(); break;
            case 'reports': ReportsModule.render(); break;
            case 'settings': SettingsModule.render(); break;
            case 'users': renderUsers(); break;
        }

        window.scrollTo(0, 0);
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    function setupEventListeners() {
        // Sidebar toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('open');
            document.getElementById('sidebarOverlay').classList.add('active');
        });
        document.getElementById('sidebarClose').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });

        // Theme toggle
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        // Nav links
        document.querySelectorAll('.nav-link[data-page]').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                navigate(link.dataset.page);
            });
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', handleLogin);

        // Setup form
        document.getElementById('setupForm').addEventListener('submit', handleSetup);

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);

        // Global search
        document.getElementById('globalSearch').addEventListener('input', debounce(e => {
            const val = e.target.value.toLowerCase();
            if (val.length > 2) {
                navigate('inventory');
                inventoryFilter.search = val;
                document.getElementById('invSearch').value = val;
                InventoryModule.render();
            }
        }, 300));

        // Inventory filters
        document.getElementById('invSearch').addEventListener('input', debounce(e => {
            inventoryFilter.search = e.target.value.toLowerCase();
            inventoryPageNum = 1;
            InventoryModule.render();
        }, 200));
        document.getElementById('invCategoryFilter').addEventListener('change', e => {
            inventoryFilter.category = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });
        document.getElementById('invSupplierFilter').addEventListener('change', e => {
            inventoryFilter.supplier = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });
        document.getElementById('invStatusFilter').addEventListener('change', e => {
            inventoryFilter.status = e.target.value;
            inventoryPageNum = 1;
            InventoryModule.render();
        });

        // Inventory sort
        document.querySelectorAll('#inventoryTable thead th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (inventorySort.field === field) {
                    inventorySort.dir = inventorySort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    inventorySort.field = field;
                    inventorySort.dir = 'asc';
                }
                document.querySelectorAll('#inventoryTable thead th.sortable').forEach(t => {
                    t.classList.remove('asc', 'desc');
                });
                th.classList.add(inventorySort.dir);
                InventoryModule.render();
            });
        });

        // Receive form
        document.getElementById('receiveForm').addEventListener('submit', e => {
            e.preventDefault();
            InventoryModule.submitReceive();
        });

        // Transfer form
        document.getElementById('transferForm').addEventListener('submit', e => {
            e.preventDefault();
            InventoryModule.submitTransfer();
        });

        // Adjustment form
        document.getElementById('adjustForm').addEventListener('submit', e => {
            e.preventDefault();
            InventoryModule.submitAdjustment();
        });

        document.getElementById('adjustItem').addEventListener('change', () => {
            InventoryModule.updateAdjustCurrentQty();
        });
        document.getElementById('adjustLocation').addEventListener('change', () => {
            InventoryModule.updateAdjustCurrentQty();
        });

        // Transfer tabs
        document.querySelectorAll('.transfer-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.transfer-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.transfer-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panelId = 'transfer' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1) + 'Panel';
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
                if (tab.dataset.tab === 'history') renderTransferHistory();
            });
        });

        // Report tabs
        document.querySelectorAll('.report-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.report-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const reportId = 'report' + tab.dataset.report.charAt(0).toUpperCase() + tab.dataset.report.slice(1);
                const panel = document.getElementById(reportId);
                if (panel) panel.classList.add('active');
                ReportsModule.renderPanel(tab.dataset.report);
            });
        });

        // Report transaction filters
        document.getElementById('reportTransType').addEventListener('change', () => ReportsModule.renderTransactions());
        document.getElementById('reportTransFrom').addEventListener('change', () => ReportsModule.renderTransactions());
        document.getElementById('reportTransTo').addEventListener('change', () => ReportsModule.renderTransactions());

        // Transfer history filters
        document.getElementById('transferFromFilter').addEventListener('change', () => renderTransferHistory());
        document.getElementById('transferToFilter').addEventListener('change', () => renderTransferHistory());
        document.getElementById('transferDateFilter').addEventListener('change', () => renderTransferHistory());

        // Supplier search
        document.getElementById('supplierSearch').addEventListener('input', debounce(e => {
            SuppliersModule.render(e.target.value.toLowerCase());
        }, 200));

        // Recipe search
        document.getElementById('recipeSearch').addEventListener('input', debounce(e => {
            RecipesModule.render(e.target.value.toLowerCase());
        }, 200));

        // Close modals on overlay click
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });

        // Close modals on Escape key
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active').forEach(m => {
                    m.classList.remove('active');
                });
                document.body.style.overflow = '';
            }
        });
    }

    // ==========================================
    // DASHBOARD
    // ==========================================

    function renderDashboard() {
        const items = _inventoryData;
        const transactions = _transactionsData;

        let inventoryValue = 0;
        let lowStock = 0;
        let criticalStock = 0;
        items.forEach(item => {
            const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
            inventoryValue += total * (item.cost || 0);
            const status = getStatus(item);
            if (status === 'Low') lowStock++;
            if (status === 'Critical') criticalStock++;
        });

        const today = todayStr();
        const todayTxs = transactions.filter(t => t.date === today);

        document.getElementById('dashInventoryValue').textContent = formatCurrency(inventoryValue);
        document.getElementById('dashTotalProducts').textContent = items.length;
        document.getElementById('dashLowStock').textContent = lowStock;
        document.getElementById('dashCriticalStock').textContent = criticalStock;
        document.getElementById('dashTodayTransactions').textContent = todayTxs.length;
        document.getElementById('dashPendingTransfers').textContent = transactions.filter(t => t.type === 'Transfer' && t.date === today).length;

        const totalAlerts = lowStock + criticalStock;
        const badge = document.getElementById('notifBadge');
        badge.textContent = totalAlerts;
        badge.style.display = totalAlerts > 0 ? 'flex' : 'none';

        // Low stock table
        const lowStockItems = items.filter(i => {
            const s = getStatus(i);
            return s === 'Low' || s === 'Critical';
        }).slice(0, 8);

        const tbody = document.getElementById('dashLowStockTable');
        if (lowStockItems.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No low stock items</p></td></tr>';
        } else {
            tbody.innerHTML = lowStockItems.map(item => {
                const status = getStatus(item);
                const statusClass = status === 'Critical' ? 'badge-critical' : 'badge-low';
                return '<tr>' +
                    '<td><span class="item-name-text">' + escapeHtml(item.name) + '</span></td>' +
                    '<td class="text-right">' + (item.qtyWarehouse || 0) + '</td>' +
                    '<td class="text-right">' + (item.qtyBamban || 0) + '</td>' +
                    '<td class="text-right">' + (item.qtyCapas || 0) + '</td>' +
                    '<td><span class="badge-status ' + statusClass + '">' + status + '</span></td>' +
                '</tr>';
            }).join('');
        }

        // Recent activity
        const recentTxs = [...transactions].sort((a, b) => {
            const aKey = (a.date || '') + 'T' + (a.time || '');
            const bKey = (b.date || '') + 'T' + (b.time || '');
            return bKey.localeCompare(aKey);
        }).slice(0, 12);

        const activityList = document.getElementById('dashActivityList');
        if (recentTxs.length === 0) {
            activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
        } else {
            activityList.innerHTML = recentTxs.map(tx => {
                let iconBg, iconColor, actionText;
                switch(tx.type) {
                    case 'Receive':
                        iconBg = 'rgba(76,175,80,0.1)'; iconColor = 'var(--success)';
                        actionText = 'Received <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> of <strong>' + escapeHtml(tx.itemName) + '</strong>';
                        break;
                    case 'Transfer':
                        iconBg = 'rgba(33,150,243,0.1)'; iconColor = 'var(--info)';
                        actionText = 'Transferred <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> of <strong>' + escapeHtml(tx.itemName) + '</strong>';
                        break;
                    case 'Damage':
                        iconBg = 'rgba(217,83,79,0.1)'; iconColor = 'var(--danger)';
                        actionText = 'Recorded <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> damaged <strong>' + escapeHtml(tx.itemName) + '</strong>';
                        break;
                    case 'Expired':
                        iconBg = 'rgba(244,168,37,0.1)'; iconColor = 'var(--warning)';
                        actionText = 'Recorded <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> expired <strong>' + escapeHtml(tx.itemName) + '</strong>';
                        break;
                    case 'Adjustment':
                        iconBg = 'rgba(196,106,43,0.1)'; iconColor = 'var(--primary)';
                        actionText = 'Adjusted <strong>' + escapeHtml(tx.itemName) + '</strong> by ' + tx.qty;
                        break;
                    case 'Return':
                        iconBg = 'rgba(90,70,54,0.1)'; iconColor = 'var(--coffee)';
                        actionText = 'Returned <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> of <strong>' + escapeHtml(tx.itemName) + '</strong>';
                        break;
                    default:
                        iconBg = 'rgba(104,119,91,0.1)'; iconColor = 'var(--secondary)';
                        actionText = tx.type + ' <strong>' + tx.qty + ' ' + (tx.unit || 'pcs') + '</strong> of <strong>' + escapeHtml(tx.itemName) + '</strong>';
                }
                return '<div class="activity-item">' +
                    '<div class="activity-icon" style="background:' + iconBg + ';color:' + iconColor + ';">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
                    '</div>' +
                    '<div class="activity-content">' +
                        '<div class="activity-text">' + actionText + '</div>' +
                        '<div class="activity-meta">' +
                            '<span>' + formatDate(tx.date) + '</span>' +
                            '<span>&bull;</span>' +
                            '<span>' + (tx.time || '') + '</span>' +
                            '<span>&bull;</span>' +
                            '<span>' + escapeHtml(tx.user || 'System') + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        // Branch summary
        let wTotal = 0, bTotal = 0, cTotal = 0;
        let wVal = 0, bVal = 0, cVal = 0;
        items.forEach(item => {
            wTotal += item.qtyWarehouse || 0;
            bTotal += item.qtyBamban || 0;
            cTotal += item.qtyCapas || 0;
            wVal += (item.qtyWarehouse || 0) * (item.cost || 0);
            bVal += (item.qtyBamban || 0) * (item.cost || 0);
            cVal += (item.qtyCapas || 0) * (item.cost || 0);
        });

        const whName = _settingsData.warehouseName || 'Warehouse';

        document.getElementById('dashBranchSummary').innerHTML =
            '<div class="branch-sum-item"><span class="branch-sum-name">' + escapeHtml(whName) + '</span>' +
            '<div class="branch-sum-stats"><span><strong>' + wTotal + '</strong> items</span><span><strong>' + formatCurrency(wVal) + '</strong></span></div></div>' +
            '<div class="branch-sum-item"><span class="branch-sum-name">Bamban Branch</span>' +
            '<div class="branch-sum-stats"><span><strong>' + bTotal + '</strong> items</span><span><strong>' + formatCurrency(bVal) + '</strong></span></div></div>' +
            '<div class="branch-sum-item"><span class="branch-sum-name">Capas Branch</span>' +
            '<div class="branch-sum-stats"><span><strong>' + cTotal + '</strong> items</span><span><strong>' + formatCurrency(cVal) + '</strong></span></div></div>';
    }

    // ==========================================
    // RECEIVE STOCK PAGE
    // ==========================================

    function renderReceive() {
        updateRefNumbers();
        document.getElementById('receiveDate').value = todayStr();
        InventoryModule.populateDropdowns();
        renderRecentDeliveries();
    }

    function renderRecentDeliveries() {
        const transactions = _transactionsData;
        const receives = transactions.filter(t => t.type === 'Receive').slice(0, 10);
        const tbody = document.getElementById('recentDeliveriesTable');
        if (receives.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No recent deliveries</p></td></tr>';
        } else {
            tbody.innerHTML = receives.map(tx => '<tr>' +
                '<td><span class="item-sku">' + escapeHtml(tx.refNum) + '</span></td>' +
                '<td>' + formatDate(tx.date) + '</td>' +
                '<td>' + escapeHtml(tx.supplierName || '-') + '</td>' +
                '<td>' + escapeHtml(tx.itemName) + '</td>' +
                '<td class="text-right">' + tx.qty + '</td>' +
                '<td>' + escapeHtml(tx.to || '-') + '</td>' +
                '<td>' + escapeHtml(tx.user || 'System') + '</td>' +
            '</tr>').join('');
        }
    }

    // ==========================================
    // TRANSFER STOCK PAGE
    // ==========================================

    function renderTransfer() {
        updateRefNumbers();
        document.getElementById('transferDate').value = todayStr();
        document.getElementById('adjustDate').value = todayStr();
        InventoryModule.populateTransferDropdowns();
        renderTransferHistory();
    }

    function renderTransferHistory() {
        let transactions = _transactionsData.filter(t => t.type === 'Transfer');

        const fromFilter = document.getElementById('transferFromFilter').value;
        const toFilter = document.getElementById('transferToFilter').value;
        const dateFilter = document.getElementById('transferDateFilter').value;

        if (fromFilter) transactions = transactions.filter(t => t.from === fromFilter);
        if (toFilter) transactions = transactions.filter(t => t.to === toFilter);
        if (dateFilter) transactions = transactions.filter(t => t.date === dateFilter);

        const tbody = document.getElementById('transferHistoryTable');
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No transfer records</p></td></tr>';
        } else {
            tbody.innerHTML = transactions.slice(0, 50).map(tx => '<tr>' +
                '<td><span class="item-sku">' + escapeHtml(tx.refNum) + '</span></td>' +
                '<td>' + formatDate(tx.date) + '</td>' +
                '<td>' + escapeHtml(tx.from) + '</td>' +
                '<td>' + escapeHtml(tx.to) + '</td>' +
                '<td>' + escapeHtml(tx.itemName) + '</td>' +
                '<td class="text-right">' + tx.qty + '</td>' +
                '<td><span class="badge-status badge-completed">Completed</span></td>' +
                '<td>' + escapeHtml(tx.user || 'System') + '</td>' +
            '</tr>').join('');
        }
    }

    // ==========================================
    // BRANCHES PAGE
    // ==========================================

    function renderBranches() {
        const items = _inventoryData;
        const transactions = _transactionsData;
        const whName = _settingsData.warehouseName || 'Main Warehouse';

        const branches = [
            { key: 'Warehouse', name: whName, color: '#C46A2B', qtyKey: 'qtyWarehouse' },
            { key: 'Bamban', name: 'Bamban Branch', color: '#68775B', qtyKey: 'qtyBamban' },
            { key: 'Capas', name: 'Capas Branch', color: '#5A4636', qtyKey: 'qtyCapas' }
        ];

        document.getElementById('branchesGrid').innerHTML = branches.map(b => {
            let totalItems = 0, totalQty = 0, totalValue = 0, lowStock = 0;
            items.forEach(item => {
                const qty = item[b.qtyKey] || 0;
                if (qty > 0) totalItems++;
                totalQty += qty;
                totalValue += qty * (item.cost || 0);
                if (qty <= (item.reorderLevel || _settingsData.reorderLevel || 10)) lowStock++;
            });

            const recentTxs = transactions.filter(t =>
                (t.from === b.key || t.to === b.key)
            ).slice(0, 5);

            return '<div class="branch-card">' +
                '<div class="branch-card-header">' +
                    '<div class="branch-card-icon" style="background:' + b.color + '15;color:' + b.color + ';">' +
                        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>' +
                    '</div>' +
                    '<div><div class="branch-card-title">' + b.name + '</div><div class="branch-card-subtitle">' + totalItems + ' items in stock</div></div>' +
                '</div>' +
                '<div class="branch-card-body">' +
                    '<div class="branch-stat-row"><span class="branch-stat-label">Total Quantity</span><span class="branch-stat-value">' + totalQty.toLocaleString() + '</span></div>' +
                    '<div class="branch-stat-row"><span class="branch-stat-label">Inventory Value</span><span class="branch-stat-value">' + formatCurrency(totalValue) + '</span></div>' +
                    '<div class="branch-stat-row"><span class="branch-stat-label">Low Stock Items</span><span class="branch-stat-value" style="color:' + (lowStock > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + lowStock + '</span></div>' +
                '</div></div>';
        }).join('');

        document.getElementById('branchComparisonTable').innerHTML = items.map(item => {
            const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
            return '<tr>' +
                '<td><strong>' + escapeHtml(item.name) + '</strong></td>' +
                '<td class="text-right">' + (item.qtyWarehouse || 0) + '</td>' +
                '<td class="text-right">' + (item.qtyBamban || 0) + '</td>' +
                '<td class="text-right">' + (item.qtyCapas || 0) + '</td>' +
                '<td class="text-right"><strong>' + total + '</strong></td>' +
            '</tr>';
        }).join('');
    }

    // ==========================================
    // USER MANAGEMENT (Admin only)
    // ==========================================

    function renderUsers() {
        if (!Auth.isAdmin()) {
            navigate('dashboard');
            return;
        }

        DB.users.getAll(users => {
            const container = document.getElementById('usersTableBody');
            if (!users || users.length === 0) {
                container.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No users found</p></td></tr>';
                return;
            }

            container.innerHTML = users.map(u => {
                const roleClass = u.role === 'admin' ? 'badge-critical' : u.role === 'staff' ? 'badge-healthy' : 'badge-pending';
                const statusClass = u.isActive === false ? 'badge-critical' : 'badge-healthy';
                const isCurrentUser = u.uid === (Auth.getUser() ? Auth.getUser().uid : '');
                let actionsHtml = '';
                if (!isCurrentUser) {
                    actionsHtml = '<div class="table-actions">' +
                        '<select class="filter-select" onchange="app.changeUserRole(\'' + u.uid + '\', this.value)" style="min-width:100px;font-size:12px;">' +
                            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>Admin</option>' +
                            '<option value="staff"' + (u.role === 'staff' ? ' selected' : '') + '>Staff</option>' +
                            '<option value="viewer"' + (u.role === 'viewer' ? ' selected' : '') + '>Viewer</option>' +
                        '</select>' +
                        '<button class="btn btn-sm ' + (u.isActive === false ? 'btn-success' : 'btn-danger') + '" onclick="app.toggleUserActive(\'' + u.uid + '\', ' + (u.isActive !== false) + ')" style="padding:4px 10px;font-size:11px;">' + (u.isActive === false ? 'Activate' : 'Deactivate') + '</button>' +
                    '</div>';
                } else {
                    actionsHtml = '<span style="color:var(--text-muted);font-size:12px;">Cannot modify own account</span>';
                }

                return '<tr>' +
                    '<td><strong>' + escapeHtml(u.displayName || 'Unknown') + '</strong>' + (isCurrentUser ? ' <span style="font-size:10px;color:var(--primary)">(You)</span>' : '') + '</td>' +
                    '<td>' + escapeHtml(u.email || '-') + '</td>' +
                    '<td><span class="badge-status ' + roleClass + '">' + escapeHtml((u.role || 'viewer').charAt(0).toUpperCase() + (u.role || 'viewer').slice(1)) + '</span></td>' +
                    '<td><span class="badge-status ' + statusClass + '">' + (u.isActive === false ? 'Inactive' : 'Active') + '</span></td>' +
                    '<td>' + (u.createdAt ? formatDate(u.createdAt.split('T')[0]) : '-') + '</td>' +
                    '<td>' + actionsHtml + '</td>' +
                '</tr>';
            }).join('');
        });
    }

    function addUser() {
        if (!Auth.isAdmin()) {
            showToast('Only admins can add users.', 'error');
            return;
        }
        document.getElementById('addUserForm').reset();
        document.getElementById('addUserError').textContent = '';
        document.getElementById('newUserRole').value = 'staff';
        openModal('addUserModal');
    }

    function saveNewUser() {
        if (!Auth.isAdmin()) return;

        const displayName = document.getElementById('newUserName').value.trim();
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const confirmPassword = document.getElementById('newUserConfirmPassword').value;
        const role = document.getElementById('newUserRole').value;
        const errorEl = document.getElementById('addUserError');
        const btn = document.getElementById('saveNewUserBtn');

        errorEl.textContent = '';

        if (!displayName || !email || !password) {
            errorEl.textContent = 'Please fill in all required fields.';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'Password must be at least 6 characters.';
            return;
        }
        if (password !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating...';

        Auth.createUser(email, password, displayName, role)
            .then(() => {
                showToast('User "' + displayName + '" created', 'success');
                closeModal('addUserModal');
                renderUsers();
            })
            .catch(err => {
                let msg = err.message || 'Failed to create user.';
                if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
                if (err.code === 'auth/invalid-email') msg = 'Invalid email address.';
                if (err.code === 'auth/weak-password') msg = 'Password is too weak.';
                errorEl.textContent = msg;
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = 'Create User';
            });
    }

    function changeUserRole(uid, newRole) {
        if (!Auth.isAdmin()) return;
        if (uid === (Auth.getUser() ? Auth.getUser().uid : '')) {
            showToast('You cannot change your own role.', 'error');
            return;
        }
        Auth.updateUserRole(uid, newRole).then(() => {
            showToast('User role updated', 'success');
        }).catch(err => {
            showToast('Failed to update role: ' + err.message, 'error');
        });
    }

    function toggleUserActive(uid, currentlyActive) {
        if (!Auth.isAdmin()) return;
        if (uid === (Auth.getUser() ? Auth.getUser().uid : '')) {
            showToast('You cannot deactivate your own account.', 'error');
            return;
        }
        if (currentlyActive) {
            Auth.deactivateUser(uid).then(() => {
                showToast('User deactivated', 'success');
                renderUsers();
            }).catch(err => {
                showToast('Failed: ' + err.message, 'error');
            });
        } else {
            Auth.activateUser(uid).then(() => {
                showToast('User activated', 'success');
                renderUsers();
            }).catch(err => {
                showToast('Failed: ' + err.message, 'error');
            });
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        navigate,
        escapeHtml,
        formatCurrency,
        formatDate,
        todayStr,
        nowTimeStr,
        genId,
        getStatus,
        getSupplierName,
        showToast,
        openModal,
        closeModal,
        showLoading,
        hideLoading,
        updateRefNumbers,
        downloadCSV,
        toggleTheme,
        applyTheme,
        getStoredThemePreference,
        setThemePreference,
        getInventoryData,
        getSuppliersData,
        getTransactionsData,
        getRecipesData,
        getSettingsData,
        getInventoryFilter,
        getInventorySort,
        getInventoryPageNum,
        getInventoryPerPage,
        setInventoryPageNum,
        addUser,
        saveNewUser,
        changeUserRole,
        toggleUserActive
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', app.init);
