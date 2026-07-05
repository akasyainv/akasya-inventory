/* =============================================
   AKASYA COFFEE - RECIPES / BOM MODULE
   Recipe and bill of materials management
   ============================================= */

const RecipesModule = (function() {
    'use strict';

    // ==========================================
    // RENDER RECIPES LIST
    // ==========================================
    function render(search) {
        const recipes = app.getRecipesData();
        let filtered = recipes;

        if (search) {
            filtered = recipes.filter(r =>
                (r.name || '').toLowerCase().includes(search) ||
                (r.category || '').toLowerCase().includes(search)
            );
        }

        const container = document.getElementById('recipesList');
        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No recipes found</p></div>';
            return;
        }

        container.innerHTML = filtered.map(r => {
            const ingredients = r.ingredients || [];
            // Determine if user can edit/delete
            let actions = '';
            if (Auth.can('canEditRecipe')) {
                actions += `<button class="btn-icon" onclick="RecipesModule.editRecipe('${r._key || r.id}')" title="Edit recipe" aria-label="Edit ${app.escapeHtml(r.name)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>`;
            }
            if (Auth.can('canDeleteRecipe')) {
                actions += `<button class="btn-icon" onclick="RecipesModule.confirmDelete('${r._key || r.id}', '${app.escapeHtml(r.name)}')" title="Delete recipe" aria-label="Delete ${app.escapeHtml(r.name)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>`;
            }

            return `<div class="recipe-card" onclick="RecipesModule.viewRecipe('${r._key || r.id}')" role="button" tabindex="0" aria-label="View recipe ${app.escapeHtml(r.name)}">
                <div class="recipe-card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>
                </div>
                <div class="recipe-card-body">
                    <div class="recipe-card-title">${app.escapeHtml(r.name)}</div>
                    <div class="recipe-card-meta">${app.escapeHtml(r.category)} &bull; ${ingredients.length} ingredient(s)</div>
                    <div class="recipe-card-ingredients">
                        ${ingredients.slice(0, 4).map(ing => `<span class="recipe-ingredient-tag">${ing.qty}${app.escapeHtml(ing.unit || '')} ${app.escapeHtml(ing.itemName)}</span>`).join('')}
                        ${ingredients.length > 4 ? `<span class="recipe-ingredient-tag">+${ingredients.length - 4} more</span>` : ''}
                    </div>
                </div>
                <div class="recipe-card-actions" onclick="event.stopPropagation()">
                    ${actions}
                </div>
            </div>`;
        }).join('');
    }

    // ==========================================
    // RECIPE CRUD
    // ==========================================
    function addRecipe() {
        if (!Auth.can('canAddRecipe')) {
            app.showToast('You do not have permission to add recipes.', 'error');
            return;
        }
        document.getElementById('recipeId').value = '';
        document.getElementById('recipeModalTitle').textContent = 'Add Recipe';
        document.getElementById('recipeForm').reset();
        document.getElementById('recipeIngredients').innerHTML = createIngredientRowHTML(0, true);
        populateDropdowns();
        app.openModal('recipeModal');
    }

    function editRecipe(id) {
        if (!Auth.can('canEditRecipe')) {
            app.showToast('Permission denied.', 'error');
            return;
        }
        const recipes = app.getRecipesData();
        const recipe = recipes.find(r => (r._key || r.id) === id);
        if (!recipe) return;

        document.getElementById('recipeId').value = id;
        document.getElementById('recipeModalTitle').textContent = 'Edit Recipe';
        document.getElementById('recipeName').value = recipe.name || '';
        document.getElementById('recipeCategory').value = recipe.category || 'Coffee';
        document.getElementById('recipeDesc').value = recipe.description || '';

        const container = document.getElementById('recipeIngredients');
        container.innerHTML = '';
        (recipe.ingredients || []).forEach((ing, idx) => {
            container.insertAdjacentHTML('beforeend', createIngredientRowHTML(idx, idx === 0));
        });
        populateDropdowns();

        // Set values
        const rows = container.querySelectorAll('.recipe-ingredient-row');
        (recipe.ingredients || []).forEach((ing, idx) => {
            if (rows[idx]) {
                const itemSelect = rows[idx].querySelector('.recipe-ingredient-item');
                const options = itemSelect.querySelectorAll('option');
                for (const opt of options) {
                    if (opt.value === ing.itemId || opt.textContent.includes(ing.itemName)) {
                        itemSelect.value = opt.value;
                        break;
                    }
                }
                rows[idx].querySelector('.recipe-ingredient-qty').value = ing.qty;
                rows[idx].querySelector('.recipe-ingredient-unit').value = ing.unit || '';
            }
        });

        app.openModal('recipeModal');
    }

    function viewRecipe(id) {
        const recipes = app.getRecipesData();
        const recipe = recipes.find(r => (r._key || r.id) === id);
        if (!recipe) return;

        document.getElementById('viewRecipeTitle').textContent = app.escapeHtml(recipe.name);
        const ingredients = recipe.ingredients || [];
        document.getElementById('viewRecipeBody').innerHTML = `
            <div style="margin-bottom: 12px;">
                <span class="badge-status badge-healthy">${app.escapeHtml(recipe.category)}</span>
            </div>
            <p style="color: var(--text-light); font-size: 13px; margin-bottom: 20px;">${app.escapeHtml(recipe.description || 'No description')}</p>
            <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--dark);">Ingredients</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${ingredients.length === 0 ? '<p style="color: var(--text-muted); font-size: 13px;">No ingredients</p>' :
                    ingredients.map(ing => `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg); border-radius: var(--radius-sm);">
                        <span style="font-weight: 500;">${app.escapeHtml(ing.itemName)}</span>
                        <span style="color: var(--text-light); font-size: 13px;">${ing.qty} ${app.escapeHtml(ing.unit || '')}</span>
                    </div>`).join('')}
            </div>
        `;
        app.openModal('viewRecipeModal');
    }

    function saveRecipe() {
        if (!Auth.can('canAddRecipe') && !Auth.can('canEditRecipe')) {
            app.showToast('Permission denied.', 'error');
            return;
        }

        const id = document.getElementById('recipeId').value;
        const name = document.getElementById('recipeName').value.trim();
        const category = document.getElementById('recipeCategory').value;
        const description = document.getElementById('recipeDesc').value.trim();

        if (!name) {
            app.showToast('Recipe name is required', 'error');
            return;
        }

        // Validate unique name
        const recipes = app.getRecipesData();
        const nameExists = recipes.some(r =>
            r.name.toLowerCase() === name.toLowerCase() &&
            (r._key || r.id) !== id
        );
        if (nameExists) {
            app.showToast('A recipe with this name already exists.', 'error');
            return;
        }

        // Collect ingredients
        const ingredients = [];
        let hasError = false;
        document.querySelectorAll('#recipeIngredients .recipe-ingredient-row').forEach(row => {
            const itemSelect = row.querySelector('.recipe-ingredient-item');
            const itemId = itemSelect.value;
            const qty = parseFloat(row.querySelector('.recipe-ingredient-qty').value);
            const unit = row.querySelector('.recipe-ingredient-unit').value;
            const itemText = itemSelect.options[itemSelect.selectedIndex]?.text || '';
            const itemName = itemText.split('(')[0]?.trim() || '';

            if (!itemId || !qty || qty <= 0) {
                hasError = true;
                return;
            }
            ingredients.push({ itemId, itemName, qty, unit });
        });

        if (hasError || ingredients.length === 0) {
            app.showToast('Please add at least one valid ingredient', 'error');
            return;
        }

        const data = { name, category, description, ingredients };

        if (id) {
            data.updatedAt = new Date().toISOString();
            DB.recipes.update(id, data).then(() => {
                app.showToast('Recipe updated', 'success');
                app.closeModal('recipeModal');
            }).catch(err => {
                app.showToast('Failed to update recipe: ' + err.message, 'error');
            });
        } else {
            data.createdAt = new Date().toISOString();
            DB.recipes.create(data).then(() => {
                app.showToast('Recipe added', 'success');
                app.closeModal('recipeModal');
            }).catch(err => {
                app.showToast('Failed to add recipe: ' + err.message, 'error');
            });
        }
    }

    function confirmDelete(id, name) {
        if (!Auth.can('canDeleteRecipe')) {
            app.showToast('Permission denied.', 'error');
            return;
        }
        if (confirm(`Delete recipe "${name}"?`)) {
            DB.recipes.delete(id).then(() => {
                app.showToast('Recipe deleted', 'success');
            }).catch(err => {
                app.showToast('Failed to delete: ' + err.message, 'error');
            });
        }
    }

    // ==========================================
    // INGREDIENT ROWS
    // ==========================================
    function createIngredientRowHTML(index, isFirst) {
        return `<div class="recipe-ingredient-row" data-index="${index}">
            <div class="form-group" style="flex: 2;">
                ${index === 0 ? '<label class="form-label">Item</label>' : ''}
                <select class="form-select recipe-ingredient-item" required>
                    <option value="">Select Item</option>
                </select>
            </div>
            <div class="form-group" style="flex: 1;">
                ${index === 0 ? '<label class="form-label">Qty</label>' : ''}
                <input type="number" class="form-input recipe-ingredient-qty" min="0.01" step="0.01" placeholder="Qty" required>
            </div>
            <div class="form-group" style="flex: 1;">
                ${index === 0 ? '<label class="form-label">Unit</label>' : ''}
                <input type="text" class="form-input recipe-ingredient-unit" placeholder="Unit" readonly>
            </div>
            <button type="button" class="btn-icon remove-ingredient" onclick="RecipesModule.removeIngredient(this)" style="${isFirst ? 'display:none;' : ''} margin-top: ${index === 0 ? '22px' : '0'};" aria-label="Remove ingredient">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        </div>`;
    }

    function addIngredient() {
        const container = document.getElementById('recipeIngredients');
        const rows = container.querySelectorAll('.recipe-ingredient-row');
        container.insertAdjacentHTML('beforeend', createIngredientRowHTML(rows.length, false));
        populateDropdowns();
        container.querySelectorAll('.remove-ingredient').forEach(btn => btn.style.display = '');
    }

    function removeIngredient(btn) {
        const container = document.getElementById('recipeIngredients');
        const rows = container.querySelectorAll('.recipe-ingredient-row');
        if (rows.length <= 1) return;
        btn.closest('.recipe-ingredient-row').remove();
        if (container.querySelectorAll('.recipe-ingredient-row').length <= 1) {
            container.querySelector('.remove-ingredient').style.display = 'none';
        }
    }

    function populateDropdowns() {
        const items = app.getInventoryData();
        const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
        document.querySelectorAll('.recipe-ingredient-item').forEach(select => {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Select Item</option>' +
                sorted.map(i => `<option value="${i._key || i.id}" data-unit="${app.escapeHtml(i.unit)}">${app.escapeHtml(i.name)}</option>`).join('');
            select.value = currentVal;
            select.onchange = function() {
                const selected = this.options[this.selectedIndex];
                const unitInput = this.closest('.recipe-ingredient-row').querySelector('.recipe-ingredient-unit');
                unitInput.value = selected.dataset.unit || '';
            };
        });
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        render,
        addRecipe,
        editRecipe,
        viewRecipe,
        saveRecipe,
        confirmDelete,
        addIngredient,
        removeIngredient,
        populateDropdowns
    };
})();
