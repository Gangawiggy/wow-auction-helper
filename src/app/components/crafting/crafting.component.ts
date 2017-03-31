import { Component } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ParentAuctionComponent } from '../auctions/parent.auctions.component';
import { calcCost, user, itemClasses, lists, copperToArray, getPet } from '../../utils/globals';
import { ItemService } from '../../services/item';
import { Title }     from '@angular/platform-browser';
import { IUser, IAuction } from '../../utils/interfaces';


@Component({
	selector: 'crafting',
	templateUrl: 'crafting.component.html',
	styleUrls: ['../auctions/auctions.component.css']
})

export class CraftingComponent extends ParentAuctionComponent{
	crafts = [];
	shoppingCart = {'recipes': [], 'reagents': [], 'cost': 0, 'buyout': 0, 'profit': 0};

	reagentIndex: number = 0;

	sortAsc = false;
	buyoutLimit = user.buyoutLimit;
	professions = [
		'First Aid',
		'Blacksmithing',
		'Leatherworking',
		'Alchemy',
		'Cooking',
		'Mining',
		'Tailoring',
		'Engineering',
		'Enchanting',
		'Jewelcrafting',
		'Inscription'
	].sort();
	craftManually = ['Choose manually', 'None', 'Only if it\'s cheaper', 'Do it for everything!'];

	private isInitiated = false;

	constructor(private itemService: ItemService, private titleService: Title, private formBuilder: FormBuilder) {
		super();
		let query = localStorage.getItem('query_crafting') === null ? undefined : JSON.parse(localStorage.getItem('query_crafting'));
		this.filterForm = formBuilder.group({
			'searchQuery': query !== undefined ? query.searchQuery : '',
			'profession': query !== undefined ? query.profession : 'All',
			'profit': query !== undefined  && query.profit !== null ? parseFloat(query.profit) : 0,
			'demand': query !== undefined && query.demand !== null ? parseFloat(query.demand) : 0,
			'minSold': query !== undefined && query.minSold !== null ? parseFloat(query.minSold) : 0,
			'craftManually': query !== undefined && query.craftManually !== null ? query.craftManually : this.craftManually[0]
		});
		let sc = localStorage.getItem('shopping_cart');
		if(sc !== null && sc !== undefined && sc !== 'undefined') {
			this.shoppingCart = JSON.parse(sc);
		}
		this.titleService.setTitle('Wah - Crafting');
	}

	ngOnInit() {
		if(lists.customPrices === undefined) {
			lists.customPrices = [];
		} else {
			Object.keys(lists.customPrices).forEach( k => {
				if(lists.items[k] === undefined) {
					this.itemService.getItem(k).subscribe(r => {
						lists.items[k] = r;
					}, e => {
						console.log('', e);
					});
				}
			});
		}

		try {
			this.setCrafts();
		} catch (e) {
			console.log(e);
		}

		let refreshId = setInterval(() => {
				try {
					if (!lists.isDownloading && lists.auctions.length > 0) {
						this.setShoppingCartCost();
						clearInterval(refreshId);
					}
				} catch(e) {console.log(e);}
			}, 100);
	}

	setCrafts() {
		if (lists.recipes !== undefined) {
			this.crafts = lists.recipes;
			this.numOfPages = this.crafts.length / this.limit;

			let refreshId = setInterval(() => {
				try {
					if (!lists.isDownloading && lists.auctions.length > 0 && !this.isInitiated) {
						this.isInitiated = true;
						this.filteRecipes();
						clearInterval(refreshId);
					}
				} catch(e) {console.log(e);}
			}, 100);
		}
	}

	setManualCraft(material, recipe) {
		material.useCraftedBy = !material.useCraftedBy;
		console.log(material.name + ' using manual craft ' + material.useCraftedBy);
		this.updateCraftingCost(recipe);
	}

	updateCraftingCost(recipe) {
		calcCost(recipe);
		recipe.reagents.forEach(reagent => {
			if(reagent.createdBy !== undefined && lists.recipes[lists.recipesIndex[reagent.createdBy]] === undefined) {
				delete reagent.createdBy;
				delete reagent.useCraftedBy;
			}
		});
	}

	filteRecipes() {
		this.crafts = [];
		let isAffected = false,
			match = false,
			searchQuery = this.filterForm.value['searchQuery'],
			profession = this.filterForm.value['profession'],
			profit = this.filterForm.value['profit'] || 0,
			demand = this.filterForm.value['demand'] || 0,
			minSold = this.filterForm.value['minSold'] || 0,
			craftManually = this.filterForm.value['craftManually'] || 0;
		localStorage.setItem(
			'query_crafting',
			JSON.stringify(
				{'searchQuery': searchQuery, 'profession': profession,
					'profit': profit, 'demand': demand, 'minSold': minSold, 'craftManually': craftManually}));

		lists.recipes.forEach(r => {
			isAffected = false;
			// Checking if there are any items missing in the DB
			if (lists.items[r.itemID] === undefined) {
				/*console.log('Importing item ' + r.name + '(' + r.itemID + ')');
				this.itemService.getItem(r.itemID).subscribe(i => {
					lists.items[r.itemID] = i;
					console.log(r.itemID + ' added');
				});*/
			}

			try {
				if (profession === 'All') {
					match = true;
				} else if (profession === r.profession) {
					match = true;
				} else {
					match = false;
				}

				if (match && searchQuery.length > 0) {
					// Matching against item name
					if (searchQuery.length !== 0 && match) {
						// TODO: Used to use getItemName()
						if (r.name.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1) {
							match = true;
						} else {
							match = false;
						}
					}
				}

				if(match && (minSold === 0 || minSold <= this.getItem(r.itemID).avgDailySold)) {
					match = true;
				} else {
					match = false;
				}

				if (match && (profit === 0 || profit <= this.getProfitPercent(r.profit, r.buyout))) {
					match = true;
				} else {
					match = false;
				}

				if (match && (demand === 0 || demand <= this.getItem(r.itemID).estDemand)) {
					match = true;
				} else {
					match = false;
				}

				if (match) {
					r.reagents.forEach(reagent => {
						if(reagent.createdBy !== undefined && lists.recipes[lists.recipesIndex[reagent.createdBy]] === undefined) {
							delete reagent.createdBy;
							delete reagent.useCraftedBy;
						} else if(lists.recipes[lists.recipesIndex[reagent.createdBy]] !== undefined) {
							switch(craftManually) {
								// ['Choose manually', 'None', 'Only if it\'s cheaper', 'Do it for everything!']
								case this.craftManually[1] :
									// Disable
									reagent.useCraftedBy = false;
									isAffected = true;
									break;
								case this.craftManually[2] :
									// If cheaper
									if(lists.recipes[lists.recipesIndex[reagent.createdBy]].cost > 0 &&
										lists.recipes[lists.recipesIndex[reagent.createdBy]].cost < (reagent.count * this.getMinPrice(reagent.itemID))) {
										reagent.useCraftedBy = true;
										isAffected = true;
									} else {
										reagent.useCraftedBy = false;
										isAffected = true;
									}
									break;
								case this.craftManually[3] :
									// For everything
									reagent.useCraftedBy = true;
									break;
							}
						}
					});
					this.updateCraftingCost(r);
					this.crafts.push(r);
				}
			} catch (err) {
				console.log(err);
			}
		});
		this.currentPage = 1;
		this.numOfPages = this.crafts.length / this.limit;
	}

	getSubMaterials(material) {
		return lists.recipes[lists.recipesIndex[material.createdBy]].reagents;
	}

	sortList(sortBy: string) {
		if (this.sortAsc) {
			this.sortAsc = false;
			this.crafts.sort(
				function (a, b) {
					return a[sortBy] - b[sortBy];
				}
			);
		} else {
			this.sortAsc = true;
			this.crafts.sort(
				function (a, b) {
					return b[sortBy] - a[sortBy];
				}
			);
		}
	}

	getItem(itemID) {
		if (lists.auctions[itemID] !== undefined) {
			return lists.auctions[itemID];
		} else if(user.apiToUse === 'tsm' && lists.tsm[itemID] !== undefined) {
			return { 'name': lists.tsm[itemID].name, 
					'estDemand': lists.tsm[itemID].RegionSaleRate,
					'avgDailySold': lists.tsm[itemID].RegionAvgDailySold,
					'avgDailyPosted': Math.round(
						(parseFloat(lists.tsm[itemID]['RegionAvgDailySold']) / parseFloat(lists.tsm[itemID]['RegionSaleRate'])) * 100) / 100 || 0,
					'regionSaleAvg': lists.tsm[itemID].RegionSaleAvg,
					'quantity_total': 0 };
		} else {
			return { 'name': 'loading', 'estDemand': 0, 'avgDailySold': 0, 'avgDailyPosted': 0, 'quantity_total': 0 };
		}
	}

	getNumOfPages() {
		this.numOfPages = Math.round(this.crafts.length / this.limit);
		return this.numOfPages;
	}

	isAtAH(itemID) {
		return lists.auctions[itemID] !== undefined ? true : false;
	}

	getMinPrice(itemID) {
		try {
			return lists.auctions[itemID].buyout;
		} catch (e) {
			if(lists.customPrices[itemID] !== undefined) {
				return lists.customPrices[itemID];
			} else if(user.apiToUse === 'wowuction' && lists.wowuction[itemID] !== undefined) {
				//console.log(lists.wowuction[itemID]);
				return lists.wowuction[itemID]['mktPrice'];
			} else if(user.apiToUse === 'tsm' && lists.tsm[itemID] !== undefined) {
				return lists.tsm[itemID].MarketValue;
			}
			return 0;
		}
	}

	getProfitPercent(profit, buyout) {
		return Math.round((profit / buyout) * 100);
	};

	getAuctionItem(itemID) {
		if(lists.auctions[itemID] === undefined){
			return {'quantity_total': 0};
		}
		return lists.auctions[itemID];
	}

	changePage(change: number): void {
		if (change > 0 && this.currentPage <= this.numOfPages) {
			this.currentPage++;
		} else if (change < 0 && this.currentPage > 1) {
			this.currentPage--;
		}
	}

	getIcon(itemID): string {
		let url = 'http://media.blizzard.com/wow/icons/56/',
			icon = lists.items[itemID] === undefined ? undefined : lists.items[itemID].icon;
		if (icon === undefined) {
			url = 'http://media.blizzard.com/wow/icons/56/inv_scroll_03.jpg';
		} else {
			url += icon + '.jpg';
		}
		return url;
	}

	addToCart(recipe): void {
		if(this.shoppingCart.recipes.length === 0 || !this.keyValueInArray(this.shoppingCart.recipes, 'spellID', recipe.spellID)) {
			this.shoppingCart.recipes.push({
				'name': recipe.name, 'spellID': recipe.spellID, 'itemID': recipe.itemID,
					'quantity': 1, 'minCount': recipe.minCount, 'reagents': recipe.reagents});
		} else {
			this.shoppingCart.recipes[this.reagentIndex].quantity += 1;
		}

		this.addReagentToCart(recipe);

		this.setShoppingCartCost();
		localStorage.setItem('shopping_cart', JSON.stringify(this.shoppingCart));
	}

	addReagentToCart(recipe) {
		recipe.reagents.forEach(r => {
			if(this.keyValueInArray(this.shoppingCart.reagents, 'itemID', r.itemID)) {
				if(r.useCraftedBy) {
					for(let i = 0, x = parseFloat(r.count); i < x; i++) {
						this.addToCart(lists.recipes[lists.recipesIndex[r.createdBy]]);
					}
				} else {
					this.shoppingCart.reagents[this.reagentIndex].count += parseFloat(r.count);
					this.shoppingCart.reagents[this.reagentIndex].count = Math.round(this.shoppingCart.reagents[this.reagentIndex].count * 100) / 100;
				}
			} else {
				if(r.useCraftedBy) {
					for(let i = 0, x = parseFloat(r.count); i < x; i++) {
						this.addToCart(lists.recipes[lists.recipesIndex[r.createdBy]]);
					}
				} else {
					this.shoppingCart.reagents.push({'itemID': r.itemID, 'name': r.name, 'count': parseFloat(r.count), 'useCraftedBy': r.useCraftedBy});
				}
			}
		});
	}

	removeFromCart(spellID): void {
		console.log('Removed ' + spellID);
		let recipeIndex = 0,
			reagentRemoveList = [],
			recipe = {};
		// Fetching the recipe's index key
		if(this.keyValueInArray(this.shoppingCart.recipes, 'spellID', spellID)) {
			recipeIndex = this.reagentIndex;
			recipe = this.shoppingCart.recipes[recipeIndex];
		}

		// Removing reagents
		recipe['reagents'].forEach(r => {
			if(this.keyValueInArray(this.shoppingCart.reagents, 'itemID', r.itemID)) {
				this.shoppingCart.reagents[this.reagentIndex].count -= (parseFloat(r.count) * recipe['quantity']);
				if(this.shoppingCart.reagents[this.reagentIndex].count <= 0) {
					this.shoppingCart.reagents.splice(this.reagentIndex, 1);
				}
			}
		});

		// Removing recipe and storing changes
		this.shoppingCart.recipes.splice(recipeIndex, 1);
		this.setShoppingCartCost();
		localStorage.setItem('shopping_cart', JSON.stringify(this.shoppingCart));
	}

	clearCart(): void {
		this.shoppingCart.reagents = [];
		this.shoppingCart.recipes = [];
		this.shoppingCart.buyout = 0;
		this.shoppingCart.profit = 0;
		this.shoppingCart.cost = 0;
		localStorage.setItem('shopping_cart', JSON.stringify(this.shoppingCart));
	}

	setShoppingCartCost(): void {
		this.shoppingCart.buyout = 0;
		this.shoppingCart.cost = 0;

		this.shoppingCart.recipes.forEach(v => {
			this.shoppingCart.buyout += this.getMinPrice(v.itemID) * v.quantity;

			v.reagents.forEach(reagent => {
				if(reagent.useCraftedBy) {
					console.log(this.getMinPrice(reagent.itemID), reagent.count);
					this.shoppingCart.buyout -= (this.getMinPrice(reagent.itemID) * parseFloat(reagent.count)) * v.quantity;
				}
			});
		});

		this.shoppingCart.reagents.forEach(v => {
			console.log('count', v);
			this.shoppingCart.cost += this.getMinPrice(v.itemID) * v.count;
		});

		this.shoppingCart.profit = this.shoppingCart.buyout - this.shoppingCart.cost;
	}

	percentOf(val1, val2) {
		if(val1 === 0) {
			return 0;
		}
		return Math.round((val2 / val1) * 100);
	}

	keyValueInArray(array, key, value): boolean {
		let contains = false, index = 0;
		array.forEach(o => {
			if(o[key] === value ) {
				contains = true;
				this.reagentIndex = index;
			}
			index++;
		});
		return contains;
	}
}