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
    let confirmCallback = null;
    let _dataReady = false;

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
    // INITIALIZATION
    // ==========================================
   // ==========================================
    // INITIALIZATION
    // ==========================================
    function init() {
        // Step 1: Initialize Firebase
        const dbReady = DB.init();

        if (!dbReady) {
            showFirebaseConfigScreen();
            return;
        }

        // Step 2: Set up live auth state listener with a callback
        Auth.init(firebaseUser => {
            if (firebaseUser) {
                // User is logged in - check if active
                if (Auth.getProfile() && Auth.getProfile().isActive === false) {
                    showLoginScreen();
                    showToast('Your account has been deactivated. Contact an admin.', 'error');
                    return;
                }
                setupApp();
            } else {
                // Not logged in - check if first-time setup needed
                checkFirstTimeSetup();
            }
        });
    }

    // ==========================================
    // REAL-TIME DATA LISTENERS
    // ==========================================
    function setupRealTimeListeners() {
        // Listen to inventory changes
        _unsubInventory = DB.inventory.getAll(data => {
            _inventoryData = data || [];
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'branches') renderBranches();
            if (currentPage === 'receive') InventoryModule.populateDropdowns();
            if (currentPage === 'transfer') InventoryModule.populateTransferDropdowns();
            if (currentPage === 'recipes') RecipesModule.populateDropdowns();
        });

        // Listen to suppliers changes
        _unsubSuppliers = DB.suppliers.getAll(data => {
            _suppliersData = data || [];
            if (currentPage === 'suppliers') SuppliersModule.render();
            if (currentPage === 'inventory') InventoryModule.render();
            if (currentPage === 'dashboard') renderDashboard();
        });

        // Listen to transactions changes
        _unsubTransactions = DB.transactions.getAll(data => {
            _transactionsData = data || [];
            if (currentPage === 'dashboard') renderDashboard();
            if (currentPage === 'receive') renderRecentDeliveries();
            if (currentPage === 'transfer') renderTransferHistory();
            if (currentPage === 'reports') ReportsModule.render();
        });

        // Listen to recipes changes
        _unsubRecipes = DB.recipes.getAll(data => {
            _recipesData = data || [];
            if (currentPage === 'recipes') RecipesModule.render();
        });

        // Listen to settings changes
        _unsubSettings = DB.settings.get(data => {
            _settingsData = data || {};
            applyTheme(_settingsData.theme || 'light');
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
                if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please try again later.';
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
                // Fire and forget the initial settings save
                DB.settings.save({
                    businessName: 'Akasya Coffee',
                    warehouseName: 'Main Warehouse',
                    currency: '\u20B1',
                    reorderLevel: 10,
                    theme: 'light'
                });

                // Force move into the application right away
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
        // Detach all real-time listeners
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

        // Show/hide nav sections that have no visible links
        document.querySelectorAll('.nav-section').forEach(section => {
            const visibleLinks = section.querySelectorAll('.nav-link:not([style*="display: none"])');
            section.style.display = visibleLinks.length > 0 ? '' : 'none';
        });

        // Hide user menu section in nav for non-admins
        const usersLink = document.querySelector('.nav-link[data-page="users"]');
        if (usersLink) {
            usersLink.style.display = Auth.isAdmin() ? '' : 'none';
        }
    }

    // ==========================================
    // NAVIGATION
    // ==========================================
    function navigate(page) {
        // Check permission
        if (!Auth.canAccessPage(page)) {
            showToast('You do not have permission to access this page.', 'error');
            return;
        }

        currentPage = page;

        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        // Show selected page
        const pageEl = document.getElementById(page + 'Page');
        if (pageEl) pageEl.classList.add('active');

        // Update nav
        const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (navLink) navLink.classList.add('active');

        // Update title
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

        // Close sidebar on mobile
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('active');

        // Render page content
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

        // Stats calculations
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

        // Update stat cards
        document.getElementById('dashInventoryValue').textContent = formatCurrency(inventoryValue);
        document.getElementById('dashTotalProducts').textContent = items.length;
        document.getElementById('dashLowStock').textContent = lowStock;
        document.getElementById('dashCriticalStock').textContent = criticalStock;
        document.getElementById('dashTodayTransactions').textContent = todayTxs.length;
        document.getElementById('dashPendingTransfers').textContent = transactions.filter(t => t.type === 'Transfer' && t.date === today).length;

        // Notification badge
        const totalAlerts = lowStock + criticalStock;
        const badge = document.getElementById('notifBadge');
        badge.textContent = totalAlerts;
        badge.style.display = totalAlerts > 0 ? 'flex' : 'none';

        // Low stock table (no SKU column)
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
                return `<tr>
                    <td><span class="item-name-text">${escapeHtml(item.name)}</span></td>
                    <td class="text-right">${item.qtyWarehouse || 0}</td>
                    <td class="text-right">${item.qtyBamban || 0}</td>
                    <td class="text-right">${item.qtyCapas || 0}</td>
                    <td><span class="badge-status ${statusClass}">${status}</span></td>
                </tr>`;
            }).join('');
        }

        // Recent activity
        const recentTxs = transactions.slice(0, 12);
        const activityList = document.getElementById('dashActivityList');
        if (recentTxs.length === 0) {
            activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
        } else {
            activityList.innerHTML = recentTxs.map(tx => {
                let iconBg, iconColor, actionText;
                switch(tx.type) {
                    case 'Receive':
                        iconBg = 'rgba(76,175,80,0.1)'; iconColor = 'var(--success)';
                        actionText = `Received <strong>${tx.qty} ${tx.unit || 'pcs'}</strong> of <strong>${escapeHtml(tx.itemName)}</strong>`;
                        break;
                    case 'Transfer':
                        iconBg = 'rgba(33,150,243,0.1)'; iconColor = 'var(--info)';
                        actionText = `Transferred <strong>${tx.qty} ${tx.unit || 'pcs'}</strong> of <strong>${escapeHtml(tx.itemName)}</strong> from ${tx.from} to ${tx.to}`;
                        break;
                    case 'Damage':
                        iconBg = 'rgba(217,83,79,0.1)'; iconColor = 'var(--danger)';
                        actionText = `Recorded <strong>${tx.qty} ${tx.unit || 'pcs'}</strong> damaged <strong>${escapeHtml(tx.itemName)}</strong>`;
                        break;
                    case 'Expired':
                        iconBg = 'rgba(244,168,37,0.1)'; iconColor = 'var(--warning)';
                        actionText = `Recorded <strong>${tx.qty} ${tx.unit || 'pcs'}</strong> expired <strong>${escapeHtml(tx.itemName)}</strong>`;
                        break;
                    case 'Adjustment':
                        iconBg = 'rgba(196,106,43,0.1)'; iconColor = 'var(--primary)';
                        actionText = `Adjusted <strong>${escapeHtml(tx.itemName)}</strong> by ${tx.qty}`;
                        break;
                    default:
                        iconBg = 'rgba(104,119,91,0.1)'; iconColor = 'var(--secondary)';
                        actionText = `${tx.type} <strong>${tx.qty} ${tx.unit || 'pcs'}</strong> of <strong>${escapeHtml(tx.itemName)}</strong>`;
                }
                const icons = {
                    Receive: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
                    Transfer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
                    Damage: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
                    Expired: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
                    Adjustment: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'
                };
                return `<div class="activity-item">
                    <div class="activity-icon" style="background: ${iconBg}; color: ${iconColor};">${icons[tx.type] || icons.Adjustment}</div>
                    <div class="activity-content">
                        <div class="activity-text">${actionText}</div>
                        <div class="activity-meta">
                            <span>${formatDate(tx.date)}</span>
                            <span>&bull;</span>
                            <span>${tx.time || ''}</span>
                            <span>&bull;</span>
                            <span>${escapeHtml(tx.user || 'System')}</span>
                        </div>
                    </div>
                </div>`;
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

        const settings = _settingsData;
        const whName = settings.warehouseName || 'Warehouse';

        document.getElementById('dashBranchSummary').innerHTML = `
            <div class="branch-sum-item">
                <span class="branch-sum-name">${escapeHtml(whName)}</span>
                <div class="branch-sum-stats">
                    <span><strong>${wTotal}</strong> items</span>
                    <span><strong>${formatCurrency(wVal)}</strong></span>
                </div>
            </div>
            <div class="branch-sum-item">
                <span class="branch-sum-name">Bamban Branch</span>
                <div class="branch-sum-stats">
                    <span><strong>${bTotal}</strong> items</span>
                    <span><strong>${formatCurrency(bVal)}</strong></span>
                </div>
            </div>
            <div class="branch-sum-item">
                <span class="branch-sum-name">Capas Branch</span>
                <div class="branch-sum-stats">
                    <span><strong>${cTotal}</strong> items</span>
                    <span><strong>${formatCurrency(cVal)}</strong></span>
                </div>
            </div>
        `;
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
            tbody.innerHTML = receives.map(tx => `<tr>
                <td><span class="item-sku">${escapeHtml(tx.refNum)}</span></td>
                <td>${formatDate(tx.date)}</td>
                <td>${escapeHtml(tx.supplierName || '-')}</td>
                <td>${escapeHtml(tx.itemName)}</td>
                <td class="text-right">${tx.qty}</td>
                <td>${escapeHtml(tx.to || '-')}</td>
                <td>${escapeHtml(tx.user || 'System')}</td>
            </tr>`).join('');
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
            tbody.innerHTML = transactions.slice(0, 50).map(tx => `<tr>
                <td><span class="item-sku">${escapeHtml(tx.refNum)}</span></td>
                <td>${formatDate(tx.date)}</td>
                <td>${escapeHtml(tx.from)}</td>
                <td>${escapeHtml(tx.to)}</td>
                <td>${escapeHtml(tx.itemName)}</td>
                <td class="text-right">${tx.qty}</td>
                <td><span class="badge-status badge-completed">Completed</span></td>
                <td>${escapeHtml(tx.user || 'System')}</td>
            </tr>`).join('');
        }
    }

    // ==========================================
    // BRANCHES PAGE
    // ==========================================
    function renderBranches() {
        const items = _inventoryData;
        const transactions = _transactionsData;
        const settings = _settingsData;
        const whName = settings.warehouseName || 'Main Warehouse';

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
                if (qty <= (item.reorderLevel || 10)) lowStock++;
            });

            const recentTxs = transactions.filter(t =>
                (t.from === b.key || t.to === b.key)
            ).slice(0, 5);

            return `<div class="branch-card">
                <div class="branch-card-header">
                    <div class="branch-card-icon" style="background: ${b.color}15; color: ${b.color};">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                    <div>
                        <div class="branch-card-title">${b.name}</div>
                        <div class="branch-card-subtitle">${totalItems} items in stock</div>
                    </div>
                </div>
                <div class="branch-card-body">
                    <div class="branch-stat-row">
                        <span class="branch-stat-label">Total Quantity</span>
                        <span class="branch-stat-value">${totalQty.toLocaleString()}</span>
                    </div>
                    <div class="branch-stat-row">
                        <span class="branch-stat-label">Inventory Value</span>
                        <span class="branch-stat-value">${formatCurrency(totalValue)}</span>
                    </div>
                    <div class="branch-stat-row">
                        <span class="branch-stat-label">Low Stock Items</span>
                        <span class="branch-stat-value" style="color: ${lowStock > 0 ? 'var(--danger)' : 'var(--success)'}">${lowStock}</span>
                    </div>
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">
                        <div style="font-size: 11px; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Recent Transactions</div>
                        ${recentTxs.length === 0 ? '<span style="font-size: 12px; color: var(--text-muted);">No recent activity</span>' :
                            recentTxs.map(tx => `<div style="font-size: 12px; color: var(--text); margin-bottom: 4px; display: flex; justify-content: space-between;">
                                <span>${escapeHtml(tx.itemName)} - ${tx.qty} ${tx.unit || ''}</span>
                                <span style="color: var(--text-muted);">${formatDate(tx.date)}</span>
                            </div>`).join('')}
                    </div>
                </div>
            </div>`;
        }).join('');

        // Branch comparison table (no SKU)
        document.getElementById('branchComparisonTable').innerHTML = items.map(item => {
            const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
            return `<tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td class="text-right">${item.qtyWarehouse || 0}</td>
                <td class="text-right">${item.qtyBamban || 0}</td>
                <td class="text-right">${item.qtyCapas || 0}</td>
                <td class="text-right"><strong>${total}</strong></td>
            </tr>`;
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
                const isCurrentUser = u.uid === Auth.getUser()?.uid;
                return `<tr>
                    <td><strong>${escapeHtml(u.displayName || 'Unknown')}</strong>${isCurrentUser ? ' <span style="font-size:10px;color:var(--primary)">(You)</span>' : ''}</td>
                    <td>${escapeHtml(u.email || '-')}</td>
                    <td><span class="badge-status ${roleClass}">${escapeHtml((u.role || 'viewer').charAt(0).toUpperCase() + (u.role || 'viewer').slice(1))}</span></td>
                    <td><span class="badge-status ${statusClass}">${u.isActive === false ? 'Inactive' : 'Active'}</span></td>
                    <td>${u.createdAt ? formatDate(u.createdAt.split('T')[0]) : '-'}</td>
                    <td>
                        <div class="table-actions">
                            ${!isCurrentUser ? `
                            <select class="filter-select" onchange="app.changeUserRole('${u.uid}', this.value)" style="min-width:100px;font-size:12px;">
                                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option>
                                <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                            </select>
                            <button class="btn btn-sm ${u.isActive === false ? 'btn-success' : 'btn-danger'}" onclick="app.toggleUserActive('${u.uid}', ${u.isActive !== false})" style="padding:4px 10px;font-size:11px;">
                                ${u.isActive === false ? 'Activate' : 'Deactivate'}
                            </button>` : '<span style="color:var(--text-muted);font-size:12px;">Cannot modify own account</span>'}
                        </div>
                    </td>
                </tr>`;
            }).join('');
        });
    }

    function changeUserRole(uid, newRole) {
        if (!Auth.isAdmin()) return;
        if (uid === Auth.getUser()?.uid) {
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
        if (uid === Auth.getUser()?.uid) {
            showToast('You cannot deactivate your own account.', 'error');
            return;
        }
        const action = currentlyActive ? 'deactivate' : 'activate';
        const method = currentlyActive ? Auth.deactivateUser : Auth.activateUser;
        if (confirm(`Are you sure you want to ${action} this user?`)) {
            method.call(Auth, uid).then(() => {
                showToast(`User ${action}d`, 'success');
                renderUsers();
            }).catch(err => {
                showToast('Failed: ' + err.message, 'error');
            });
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function genId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function genRefNum(type) {
        const prefix = { Receive: 'RCV', Transfer: 'TRF', Damage: 'DMG', Expired: 'EXP', Adjustment: 'ADJ', Return: 'RET' };
        return (prefix[type] || 'TXN') + '-' + Date.now().toString(36).toUpperCase().slice(-6);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatCurrency(val) {
        const settings = _settingsData;
        const sym = settings.currency || '\u20B1';
        return sym + parseFloat(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function todayStr() {
        return new Date().toISOString().split('T')[0];
    }

    function nowTimeStr() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    function getStatus(item) {
        const total = (item.qtyWarehouse || 0) + (item.qtyBamban || 0) + (item.qtyCapas || 0);
        const reorder = item.reorderLevel || 10;
        if (total <= reorder * 0.5) return 'Critical';
        if (total <= reorder) return 'Low';
        return 'Healthy';
    }

    function getSupplierName(id) {
        const s = _suppliersData.find(s => s.id === id || s._key === id);
        return s ? s.name : id;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function debounce(fn, ms) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    // ==========================================
    // UI HELPERS
    // ==========================================
    function openModal(id) {
        document.getElementById(id).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        document.getElementById(id).classList.remove('active');
        document.body.style.overflow = '';
    }

    function showToast(message, type) {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
            error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
        };
        const titles = { success: 'Success', error: 'Error', warning: 'Warning' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        toast.innerHTML = `
            <div class="toast-icon">${icons[type]}</div>
            <div class="toast-content">
                <div class="toast-title">${titles[type]}</div>
                <div class="toast-message">${escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Close notification" onclick="this.parentElement.remove()">&times;</button>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function showLoading(message) {
        const overlay = document.getElementById('loadingOverlay');
        const msgEl = document.getElementById('loadingMessage');
        if (msgEl && message) msgEl.textContent = message;
        overlay.classList.add('active');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    function updateRefNumbers() {
        const receiveRef = document.getElementById('receiveRef');
        if (receiveRef) receiveRef.value = genRefNum('Receive');
        const transferRef = document.getElementById('transferRef');
        if (transferRef) transferRef.value = genRefNum('Transfer');
        const adjustRef = document.getElementById('adjustRef');
        if (adjustRef) adjustRef.value = genRefNum('Adjustment');
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    }

    function downloadCSV(headers, rows, filename) {
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ==========================================
    // DATA ACCESSORS (for other modules)
    // ==========================================
    function getInventoryData() { return _inventoryData; }
    function getSuppliersData() { return _suppliersData; }
    function getTransactionsData() { return _transactionsData; }
    function getRecipesData() { return _recipesData; }
    function getSettingsData() { return _settingsData; }
    function getInventorySort() { return inventorySort; }
    function getInventoryFilter() { return inventoryFilter; }
    function getInventoryPageNum() { return inventoryPageNum; }
    function setInventoryPageNum(p) { inventoryPageNum = p; }
    function getInventoryPerPage() { return inventoryPerPage; }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        navigate,
        showToast,
        openModal,
        closeModal,
        showLoading,
        hideLoading,
        genId,
        genRefNum,
        formatDate,
        formatCurrency,
        todayStr,
        nowTimeStr,
        getStatus,
        getSupplierName,
        escapeHtml,
        debounce,
        downloadCSV,
        getInventoryData,
        getSuppliersData,
        getTransactionsData,
        getRecipesData,
        getSettingsData,
        getInventorySort,
        getInventoryFilter,
        getInventoryPageNum,
        setInventoryPageNum,
        getInventoryPerPage,
        renderReceive,
        renderRecentDeliveries,
        renderTransfer,
        renderTransferHistory,
        updateRefNumbers,
        changeUserRole,
        toggleUserActive,
        renderUsers
    };
})();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', app.init);
